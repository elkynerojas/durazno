import uuid
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from sqlalchemy import exists, func, select, update
from sqlalchemy.exc import IntegrityError
from uuid6 import uuid7

from app.api.acceso import ADMINISTRADOR, ROLES_CAMPO, ROLES_GESTION, exigir_lote, exigir_predio
from app.api.deps import SessionDep, UsuarioActualDep, requiere_rol
from app.core.config import get_settings
from app.models.hallazgo import EvidenciaHallazgo, Hallazgo
from app.models.lote import Lote
from app.models.plan_actividad import PlanActividad
from app.models.tipo_hallazgo import TipoHallazgo
from app.models.usuario import Usuario
from app.schemas.geo import a_geometria
from app.schemas.inspeccion import (
    AtencionLeer,
    EstadoHallazgo,
    EvidenciaLeer,
    HallazgoActualizar,
    HallazgoCrear,
    HallazgoLeer,
    Hallazgos,
    TipoHallazgoActualizar,
    TipoHallazgoCrear,
    TipoHallazgoLeer,
)
from app.services.cumplimiento import estado_actividad
from app.services.evidencias import (
    MAX_BYTES,
    ImagenInvalida,
    borrar,
    procesar_y_guardar,
    ruta_archivo,
)
from app.services.inspecciones import MAX_EVIDENCIAS, estado_hallazgo, rango_bogota
from app.services.monitoreo import hoy_bogota
from app.services.trampas import punto_en_lote

router = APIRouter(prefix="/inspecciones", tags=["inspecciones"])

AdministradorDep = Annotated[Usuario, Depends(requiere_rol(ADMINISTRADOR))]
CampoDep = Annotated[Usuario, Depends(requiere_rol(*ROLES_CAMPO))]
GestionDep = Annotated[Usuario, Depends(requiere_rol(*ROLES_GESTION))]

ERROR_401 = {401: {"description": "Sin sesión o sesión inválida"}}
ERROR_403 = {403: {"description": "Sin permiso para esta acción"}}
ERROR_404 = {404: {"description": "Hallazgo no encontrado (o de un predio no asignado)"}}
NOMBRE_REPETIDO = "Ya existe un tipo de hallazgo con ese nombre"
NO_ENCONTRADO = "Hallazgo no encontrado"
TOLERANCIA_FUTURO = timedelta(minutes=5)


def ahora() -> datetime:
    return datetime.now(UTC)


# --- Tipos de hallazgo (HU-40) ---


async def _nombre_libre(session: SessionDep, nombre: str, excepto: uuid.UUID | None) -> None:
    consulta = select(TipoHallazgo.id).where(
        func.lower(TipoHallazgo.nombre) == nombre.lower(), TipoHallazgo.deleted_at.is_(None)
    )
    if excepto is not None:
        consulta = consulta.where(TipoHallazgo.id != excepto)
    if await session.scalar(consulta) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=NOMBRE_REPETIDO)


async def _exigir_tipo(session: SessionDep, tipo_id: uuid.UUID) -> TipoHallazgo:
    tipo = await session.get(TipoHallazgo, tipo_id)
    if tipo is None or tipo.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tipo de hallazgo no encontrado"
        )
    return tipo


async def _guardar(session: SessionDep, tipo: TipoHallazgo) -> TipoHallazgo:
    try:
        await session.commit()
    except IntegrityError as error:
        # Carrera con otro guardado del mismo nombre (índice único parcial).
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=NOMBRE_REPETIDO) from error
    await session.refresh(tipo)
    return tipo


@router.get(
    "/tipos",
    response_model=list[TipoHallazgoLeer],
    summary="Listar los tipos de hallazgo",
    description="Tipos activos, por orden y nombre. El administrador puede pedir también los "
    "inactivos con `todos=true` para administrarlos.",
    responses=ERROR_401,
)
async def listar_tipos(
    usuario: UsuarioActualDep, session: SessionDep, todos: bool = False
) -> list[TipoHallazgo]:
    consulta = select(TipoHallazgo).where(TipoHallazgo.deleted_at.is_(None))
    if not (todos and usuario.rol == ADMINISTRADOR):
        consulta = consulta.where(TipoHallazgo.activo.is_(True))
    return list(await session.scalars(consulta.order_by(TipoHallazgo.orden, TipoHallazgo.nombre)))


@router.post(
    "/tipos",
    response_model=TipoHallazgoLeer,
    status_code=status.HTTP_201_CREATED,
    summary="Crear un tipo de hallazgo",
    description="Solo el administrador. El nombre no se repite entre los tipos vigentes (sin "
    "distinguir mayúsculas). Reenviar el mismo `id` devuelve el tipo existente con 200.",
    responses={
        200: {"description": "El tipo con ese `id` ya existía", "model": TipoHallazgoLeer},
        **ERROR_401,
        **ERROR_403,
        409: {"description": "Nombre repetido o `id` de un tipo eliminado"},
        422: {"description": "Datos inválidos"},
    },
)
async def crear_tipo(
    entrada: TipoHallazgoCrear, _admin: AdministradorDep, session: SessionDep, response: Response
) -> TipoHallazgo:
    if entrada.id is not None and (existente := await session.get(TipoHallazgo, entrada.id)):
        if existente.deleted_at is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El id pertenece a un tipo de hallazgo eliminado",
            )
        response.status_code = status.HTTP_200_OK
        return existente
    await _nombre_libre(session, entrada.nombre, None)
    tipo = TipoHallazgo(**entrada.model_dump(exclude={"id"}))
    if entrada.id is not None:
        tipo.id = entrada.id
    session.add(tipo)
    return await _guardar(session, tipo)


@router.patch(
    "/tipos/{tipo_id}",
    response_model=TipoHallazgoLeer,
    summary="Actualizar un tipo de hallazgo",
    description="Solo el administrador: renombra, cambia el color o el orden, o lo activa y "
    "desactiva. Un tipo no se borra; desactivado deja de ofrecerse al registrar, pero los "
    "hallazgos que ya lo usan lo conservan.",
    responses={
        **ERROR_401,
        **ERROR_403,
        404: {"description": "Tipo de hallazgo no encontrado"},
        409: {"description": "Nombre repetido"},
        422: {"description": "Datos inválidos"},
    },
)
async def actualizar_tipo(
    tipo_id: uuid.UUID,
    entrada: TipoHallazgoActualizar,
    _admin: AdministradorDep,
    session: SessionDep,
) -> TipoHallazgo:
    tipo = await _exigir_tipo(session, tipo_id)
    cambios = entrada.model_dump(exclude_unset=True, exclude_none=True)
    if "nombre" in cambios:
        await _nombre_libre(session, cambios["nombre"], tipo.id)
    for campo, valor in cambios.items():
        setattr(tipo, campo, valor)
    return await _guardar(session, tipo)


# --- Hallazgos (HU-41) ---


def _consulta():
    return (
        select(Hallazgo, Lote.codigo, TipoHallazgo.nombre, TipoHallazgo.color, Usuario)
        .join(Lote, Lote.id == Hallazgo.lote_id)
        .join(TipoHallazgo, TipoHallazgo.id == Hallazgo.tipo_id)
        .join(Usuario, Usuario.id == Hallazgo.registrado_por_id)
        .where(Hallazgo.deleted_at.is_(None))
    )


async def _evidencias(session: SessionDep, ids: list[uuid.UUID]) -> dict:
    por_hallazgo: dict[uuid.UUID, list[EvidenciaHallazgo]] = defaultdict(list)
    if ids:
        filas = await session.scalars(
            select(EvidenciaHallazgo)
            .where(EvidenciaHallazgo.hallazgo_id.in_(ids), EvidenciaHallazgo.deleted_at.is_(None))
            .order_by(EvidenciaHallazgo.orden, EvidenciaHallazgo.created_at)
        )
        for evidencia in filas:
            por_hallazgo[evidencia.hallazgo_id].append(evidencia)
    return por_hallazgo


async def _atenciones(session: SessionDep, ids: list[uuid.UUID], oculto: bool) -> dict:
    """Actividades de atención (HU-42) de cada hallazgo, con su estado calculado."""
    por_hallazgo: dict[uuid.UUID, list[AtencionLeer]] = defaultdict(list)
    if not ids:
        return por_hallazgo
    hoy = hoy_bogota()
    filas = await session.execute(
        select(PlanActividad, Usuario.nombre_completo)
        .join(Usuario, Usuario.id == PlanActividad.responsable_id)
        .where(PlanActividad.hallazgo_id.in_(ids), PlanActividad.deleted_at.is_(None))
        .order_by(PlanActividad.created_at)
    )
    for actividad, responsable in filas:
        por_hallazgo[actividad.hallazgo_id].append(
            AtencionLeer(
                id=actividad.id,
                anio=actividad.anio,
                semana=actividad.semana,
                estado=estado_actividad(
                    actividad.estado, actividad.anio, actividad.semana, hoy, None
                ),
                responsable_id=None if oculto else actividad.responsable_id,
                responsable_nombre=None if oculto else responsable,
                notas=actividad.notas,
                nota_cumplimiento=actividad.nota_cumplimiento,
                cumplida_en=actividad.cumplida_en,
            )
        )
    return por_hallazgo


def _filtro_estado(estado: EstadoHallazgo):
    """El mismo criterio de `estado_hallazgo`, en SQL (la marca de vencida no cambia el estado)."""

    def con(*condiciones):
        return exists().where(
            PlanActividad.hallazgo_id == Hallazgo.id,
            PlanActividad.deleted_at.is_(None),
            *condiciones,
        )

    atendido = con(PlanActividad.estado == "cumplida")
    if estado == "atendido":
        return atendido
    pendiente = con(PlanActividad.estado.in_(("programada", "reprogramada")))
    if estado == "en_atencion":
        return pendiente & ~atendido
    return ~atendido & ~pendiente


async def _leer_filas(session: SessionDep, usuario: Usuario, filas) -> list[HallazgoLeer]:
    """Hallazgos para el usuario. Ley 1581: el productor no ve quién los registró ni quién los
    atiende."""
    oculto = usuario.rol == "productor"
    ids = [fila[0].id for fila in filas]
    evidencias = await _evidencias(session, ids)
    atenciones = await _atenciones(session, ids, oculto)
    leidos = []
    for hallazgo, lote_codigo, tipo_nombre, tipo_color, registrador in filas:
        estado, vencida = estado_hallazgo(a.estado for a in atenciones[hallazgo.id])
        leidos.append(
            HallazgoLeer(
                id=hallazgo.id,
                predio_id=hallazgo.predio_id,
                lote_id=hallazgo.lote_id,
                lote_codigo=lote_codigo,
                tipo_id=hallazgo.tipo_id,
                tipo_nombre=tipo_nombre,
                tipo_color=tipo_color,
                titulo=hallazgo.titulo,
                descripcion=hallazgo.descripcion,
                ubicacion=hallazgo.geom,
                precision_m=hallazgo.precision_m,
                observado_en=hallazgo.observado_en,
                registrado_por_id=None if oculto else registrador.id,
                registrado_por_nombre=None if oculto else registrador.nombre_completo,
                estado=estado,
                vencida=vencida,
                atenciones=atenciones[hallazgo.id],
                evidencias=[EvidenciaLeer.model_validate(e) for e in evidencias[hallazgo.id]],
                created_at=hallazgo.created_at,
                updated_at=hallazgo.updated_at,
            )
        )
    return leidos


async def leer_hallazgos(
    session: SessionDep, usuario: Usuario, ids: list[uuid.UUID]
) -> list[HallazgoLeer]:
    """Hallazgos vigentes con esos ids, como los devuelve la API (para la sincronización)."""
    if not ids:
        return []
    filas = (
        await session.execute(
            _consulta().where(Hallazgo.id.in_(ids)).order_by(Hallazgo.observado_en)
        )
    ).all()
    return await _leer_filas(session, usuario, filas)


async def _leer(session: SessionDep, usuario: Usuario, hallazgo_id: uuid.UUID) -> HallazgoLeer:
    fila = (await session.execute(_consulta().where(Hallazgo.id == hallazgo_id))).first()
    [leido] = await _leer_filas(session, usuario, [fila])
    return leido


async def _exigir_hallazgo(
    session: SessionDep,
    usuario: Usuario,
    hallazgo_id: uuid.UUID,
    *,
    escribir: bool = False,
    roles_escritura: tuple[str, ...] = ROLES_CAMPO,
) -> Hallazgo:
    """El hallazgo vigente si el usuario ve su predio (404 si no). Para escribir, el técnico solo
    modifica los que registró él."""
    hallazgo = await session.get(Hallazgo, hallazgo_id)
    vigente = hallazgo is not None and hallazgo.deleted_at is None
    await exigir_predio(
        session,
        usuario,
        hallazgo.predio_id if vigente else None,
        escribir=escribir,
        roles_escritura=roles_escritura,
        detalle_404=NO_ENCONTRADO,
    )
    if escribir:
        _exigir_autor(usuario, hallazgo)
    return hallazgo


def _exigir_autor(usuario: Usuario, hallazgo: Hallazgo) -> None:
    if usuario.rol not in ROLES_GESTION and hallazgo.registrado_por_id != usuario.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo quien registró el hallazgo, el agrónomo o el administrador lo modifican",
        )


def _no_valido(detalle: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=detalle)


async def _exigir_tipo_activo(session: SessionDep, tipo_id: uuid.UUID) -> None:
    tipo = await session.get(TipoHallazgo, tipo_id)
    if tipo is None or tipo.deleted_at is not None or not tipo.activo:
        raise _no_valido("El tipo de hallazgo no existe o está desactivado")


async def _exigir_punto(session: SessionDep, lote_id: uuid.UUID, punto) -> None:
    if not await punto_en_lote(session, lote_id, punto):
        raise _no_valido("El punto no queda dentro del lote seleccionado")


@router.post(
    "/hallazgos",
    response_model=HallazgoLeer,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar un hallazgo",
    description="Lo registran el técnico, el agrónomo y el administrador del predio. El punto "
    "debe quedar dentro del lote (`ST_Contains`) y `observado_en` no puede estar en el futuro. "
    "Idempotente por `id`: reenviar el mismo hallazgo devuelve el existente con 200. Las fotos "
    "se suben después con `POST /inspecciones/hallazgos/{id}/evidencias`.",
    responses={
        200: {"description": "El hallazgo con ese `id` ya existía", "model": HallazgoLeer},
        **ERROR_401,
        403: {"description": "El productor no registra hallazgos"},
        404: {"description": "Lote no encontrado (o de un predio no asignado)"},
        409: {"description": "El `id` ya pertenece a otro registro"},
        422: {
            "description": "Datos inválidos, tipo desactivado, punto fuera del lote o fecha futura"
        },
    },
)
async def registrar_hallazgo(
    entrada: HallazgoCrear, usuario: CampoDep, session: SessionDep, response: Response
) -> HallazgoLeer:
    lote = await exigir_lote(
        session, usuario, entrada.lote_id, escribir=True, roles_escritura=ROLES_CAMPO
    )
    if entrada.id is not None and (existente := await session.get(Hallazgo, entrada.id)):
        if (
            existente.deleted_at is not None
            or existente.registrado_por_id != usuario.id
            or existente.lote_id != lote.id
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Ese id ya está en uso"
            )
        response.status_code = status.HTTP_200_OK
        return await _leer(session, usuario, existente.id)
    if entrada.observado_en > ahora() + TOLERANCIA_FUTURO:
        raise _no_valido("La fecha de observación no puede estar en el futuro")
    await _exigir_tipo_activo(session, entrada.tipo_id)
    punto = a_geometria(entrada.ubicacion)
    await _exigir_punto(session, lote.id, punto)
    hallazgo = Hallazgo(
        predio_id=lote.predio_id,
        lote_id=lote.id,
        tipo_id=entrada.tipo_id,
        titulo=entrada.titulo,
        descripcion=entrada.descripcion,
        geom=punto,
        precision_m=entrada.precision_m,
        observado_en=entrada.observado_en,
        registrado_por_id=usuario.id,
    )
    if entrada.id is not None:
        hallazgo.id = entrada.id
    session.add(hallazgo)
    try:
        await session.flush()
    except IntegrityError as error:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Ese id ya está en uso"
        ) from error
    leido = await _leer(session, usuario, hallazgo.id)
    await session.commit()
    return leido


@router.get(
    "/hallazgos",
    response_model=Hallazgos,
    summary="Listar los hallazgos de un predio",
    description="Del más reciente al más antiguo y paginados. Filtros opcionales por lote, tipo, "
    "estado y días de observación (`desde` y `hasta` en hora de Bogotá, incluidos). Cualquier "
    "rol con el predio asignado; el productor no ve quién los registró.",
    responses={**ERROR_401, 404: {"description": "Predio no encontrado (o no asignado)"}},
)
async def listar_hallazgos(
    predio_id: uuid.UUID,
    usuario: UsuarioActualDep,
    session: SessionDep,
    lote_id: uuid.UUID | None = None,
    tipo_id: uuid.UUID | None = None,
    estado: EstadoHallazgo | None = None,
    desde: date | None = None,
    hasta: date | None = None,
    pagina: Annotated[int, Query(ge=1)] = 1,
    por_pagina: Annotated[int, Query(ge=1, le=200)] = 50,
) -> Hallazgos:
    await exigir_predio(session, usuario, predio_id)
    consulta = _consulta().where(Hallazgo.predio_id == predio_id)
    if lote_id is not None:
        consulta = consulta.where(Hallazgo.lote_id == lote_id)
    if tipo_id is not None:
        consulta = consulta.where(Hallazgo.tipo_id == tipo_id)
    if estado is not None:
        consulta = consulta.where(_filtro_estado(estado))
    inicio, fin = rango_bogota(desde, hasta)
    if inicio is not None:
        consulta = consulta.where(Hallazgo.observado_en >= inicio)
    if fin is not None:
        consulta = consulta.where(Hallazgo.observado_en < fin)
    total = await session.scalar(select(func.count()).select_from(consulta.subquery()))
    filas = (
        await session.execute(
            consulta.order_by(Hallazgo.observado_en.desc(), Hallazgo.id)
            .offset((pagina - 1) * por_pagina)
            .limit(por_pagina)
        )
    ).all()
    return Hallazgos(
        total=total,
        pagina=pagina,
        por_pagina=por_pagina,
        hallazgos=await _leer_filas(session, usuario, filas),
    )


@router.get(
    "/hallazgos/{hallazgo_id}",
    response_model=HallazgoLeer,
    summary="Obtener un hallazgo",
    description="Con la lista de sus fotos (se descargan con "
    "`GET /inspecciones/hallazgos/{id}/evidencias/{evidencia_id}`).",
    responses={**ERROR_401, **ERROR_404},
)
async def obtener_hallazgo(
    hallazgo_id: uuid.UUID, usuario: UsuarioActualDep, session: SessionDep
) -> HallazgoLeer:
    await _exigir_hallazgo(session, usuario, hallazgo_id)
    return await _leer(session, usuario, hallazgo_id)


@router.patch(
    "/hallazgos/{hallazgo_id}",
    response_model=HallazgoLeer,
    summary="Actualizar un hallazgo",
    description="Cambia el tipo, el título, la descripción o la ubicación (con su lote, que "
    "debe contener el punto). Lo hacen quien lo registró, el agrónomo y el administrador.",
    responses={
        **ERROR_401,
        **ERROR_403,
        **ERROR_404,
        422: {"description": "Datos inválidos, tipo desactivado o punto fuera del lote"},
    },
)
async def actualizar_hallazgo(
    hallazgo_id: uuid.UUID, entrada: HallazgoActualizar, usuario: CampoDep, session: SessionDep
) -> HallazgoLeer:
    hallazgo = await _exigir_hallazgo(session, usuario, hallazgo_id, escribir=True)
    if entrada.tipo_id is not None and entrada.tipo_id != hallazgo.tipo_id:
        await _exigir_tipo_activo(session, entrada.tipo_id)
        hallazgo.tipo_id = entrada.tipo_id
    if entrada.titulo is not None:
        hallazgo.titulo = entrada.titulo
    if entrada.descripcion is not None:
        hallazgo.descripcion = entrada.descripcion
    if entrada.ubicacion is not None:
        lote_id = entrada.lote_id or hallazgo.lote_id
        if lote_id != hallazgo.lote_id:
            lote = await exigir_lote(session, usuario, lote_id)
            if lote.predio_id != hallazgo.predio_id:
                raise _no_valido("El lote debe ser del mismo predio del hallazgo")
        punto = a_geometria(entrada.ubicacion)
        await _exigir_punto(session, lote_id, punto)
        if lote_id != hallazgo.lote_id:
            # Su atención en el plan sigue al hallazgo al nuevo lote.
            await session.execute(
                update(PlanActividad)
                .where(PlanActividad.hallazgo_id == hallazgo.id)
                .values(lote_id=lote_id, updated_at=func.now())
            )
        hallazgo.lote_id = lote_id
        hallazgo.geom = punto
        hallazgo.precision_m = entrada.precision_m
    await session.flush()
    leido = await _leer(session, usuario, hallazgo.id)
    await session.commit()
    return leido


@router.delete(
    "/hallazgos/{hallazgo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar un hallazgo",
    description="Borrado lógico; lo hacen el agrónomo y el administrador. También salen del "
    "plan sus actividades de atención.",
    responses={**ERROR_401, **ERROR_403, **ERROR_404},
)
async def eliminar_hallazgo(
    hallazgo_id: uuid.UUID, usuario: GestionDep, session: SessionDep
) -> None:
    hallazgo = await _exigir_hallazgo(
        session, usuario, hallazgo_id, escribir=True, roles_escritura=ROLES_GESTION
    )
    momento = datetime.now(UTC)
    hallazgo.deleted_at = momento
    await session.execute(
        update(PlanActividad)
        .where(PlanActividad.hallazgo_id == hallazgo.id, PlanActividad.deleted_at.is_(None))
        .values(deleted_at=momento, updated_at=momento)
    )
    await session.commit()


# --- Evidencias fotográficas (HU-41) ---


async def _exigir_evidencia(
    session: SessionDep, hallazgo: Hallazgo, evidencia_id: uuid.UUID
) -> EvidenciaHallazgo:
    evidencia = await session.get(EvidenciaHallazgo, evidencia_id)
    if (
        evidencia is None
        or evidencia.deleted_at is not None
        or evidencia.hallazgo_id != hallazgo.id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Foto no encontrada")
    return evidencia


async def _evidencia_por_id(
    session: SessionDep, hallazgo: Hallazgo, evidencia_id: uuid.UUID
) -> EvidenciaHallazgo | None:
    """La foto ya subida con ese `id` (reenvío); 409 si el `id` es de otra o está borrada."""
    existente = await session.get(EvidenciaHallazgo, evidencia_id, populate_existing=True)
    if existente is None:
        return None
    if existente.deleted_at is not None or existente.hallazgo_id != hallazgo.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ese id ya está en uso")
    return existente


async def _exigir_cupo(session: SessionDep, hallazgo: Hallazgo) -> None:
    vigentes = await session.scalar(
        select(func.count()).where(
            EvidenciaHallazgo.hallazgo_id == hallazgo.id, EvidenciaHallazgo.deleted_at.is_(None)
        )
    )
    if vigentes >= MAX_EVIDENCIAS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"El hallazgo ya tiene {MAX_EVIDENCIAS} fotos: elimine una para agregar otra",
        )


@router.post(
    "/hallazgos/{hallazgo_id}/evidencias",
    response_model=EvidenciaLeer,
    status_code=status.HTTP_201_CREATED,
    summary="Subir una foto de evidencia",
    description=f"Multipart con el campo `archivo` (JPEG, PNG o WebP, máx. {MAX_BYTES // 2**20} "
    f"MB) y un `id` opcional generado por el cliente: reenviar la misma foto con el mismo `id` "
    f"devuelve la existente con 200. El servidor la endereza, la reduce a 1920 px, elimina sus "
    f"metadatos EXIF (que pueden traer el GPS del teléfono) y guarda una miniatura. Máximo "
    f"{MAX_EVIDENCIAS} fotos por hallazgo. La suben quien registró el hallazgo, el agrónomo y el "
    f"administrador.",
    responses={
        200: {"description": "La foto con ese `id` ya existía", "model": EvidenciaLeer},
        **ERROR_401,
        **ERROR_403,
        **ERROR_404,
        409: {"description": "El hallazgo ya tiene el máximo de fotos o el `id` está en uso"},
        413: {"description": "La foto pesa más de lo permitido"},
        422: {"description": "El archivo no es una imagen JPEG, PNG o WebP"},
    },
)
async def subir_evidencia(
    hallazgo_id: uuid.UUID,
    archivo: Annotated[UploadFile, File(description="Foto JPEG, PNG o WebP")],
    usuario: CampoDep,
    session: SessionDep,
    response: Response,
    id: Annotated[
        uuid.UUID | None, Form(description="Opcional: reenviar el mismo `id` no duplica la foto")
    ] = None,
) -> EvidenciaHallazgo:
    # Permisos y validaciones rápidas sin bloquear el predio: leer y procesar la foto puede
    # tardar, y el bloqueo de escritura frenaría al resto del predio mientras tanto.
    hallazgo = await _exigir_hallazgo(session, usuario, hallazgo_id)
    _exigir_autor(usuario, hallazgo)
    if id is not None and (existente := await _evidencia_por_id(session, hallazgo, id)):
        response.status_code = status.HTTP_200_OK
        return existente
    await _exigir_cupo(session, hallazgo)
    contenido = await archivo.read(MAX_BYTES + 1)
    if len(contenido) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"La foto pesa más de {MAX_BYTES // 2**20} MB",
        )
    directorio = get_settings().evidencias_dir
    evidencia_id = id or uuid7()
    try:
        foto = await run_in_threadpool(
            procesar_y_guardar, contenido, directorio, hallazgo.id, evidencia_id
        )
    except ImagenInvalida as error:
        raise _no_valido("El archivo no es una imagen JPEG, PNG o WebP") from error

    # Bloqueo corto: se revalida (otra petición pudo subir o borrar entretanto) y se inserta.
    try:
        hallazgo = await _exigir_hallazgo(session, usuario, hallazgo_id, escribir=True)
        if id is not None and (existente := await _evidencia_por_id(session, hallazgo, id)):
            response.status_code = status.HTTP_200_OK
            return existente
        await _exigir_cupo(session, hallazgo)
        orden = await session.scalar(
            select(func.coalesce(func.max(EvidenciaHallazgo.orden), 0)).where(
                EvidenciaHallazgo.hallazgo_id == hallazgo.id
            )
        )
        evidencia = EvidenciaHallazgo(
            id=evidencia_id,
            hallazgo_id=hallazgo.id,
            archivo=foto.archivo,
            ancho=foto.ancho,
            alto=foto.alto,
            bytes=foto.bytes,
            orden=orden + 1,
            subido_por_id=usuario.id,
        )
        session.add(evidencia)
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        await run_in_threadpool(borrar, directorio, foto.archivo)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Ese id ya está en uso"
        ) from error
    except HTTPException:
        await run_in_threadpool(borrar, directorio, foto.archivo)
        raise
    await session.refresh(evidencia)
    return evidencia


@router.get(
    "/hallazgos/{hallazgo_id}/evidencias/{evidencia_id}",
    response_class=FileResponse,
    summary="Descargar una foto de evidencia",
    description="La foto en JPEG (máx. 1920 px) o, con `tamano=miniatura`, de 400 px. Cualquier "
    "rol con el predio asignado.",
    responses={
        200: {"content": {"image/jpeg": {}}, "description": "Foto en JPEG"},
        **ERROR_401,
        404: {"description": "Hallazgo o foto no encontrados"},
    },
)
async def descargar_evidencia(
    hallazgo_id: uuid.UUID,
    evidencia_id: uuid.UUID,
    usuario: UsuarioActualDep,
    session: SessionDep,
    tamano: Annotated[str, Query(pattern="^(completa|miniatura)$")] = "completa",
) -> FileResponse:
    hallazgo = await _exigir_hallazgo(session, usuario, hallazgo_id)
    evidencia = await _exigir_evidencia(session, hallazgo, evidencia_id)
    ruta = ruta_archivo(
        get_settings().evidencias_dir, evidencia.archivo, miniatura=tamano == "miniatura"
    )
    if not ruta.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Foto no encontrada")
    return FileResponse(
        ruta, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=300"}
    )


@router.delete(
    "/hallazgos/{hallazgo_id}/evidencias/{evidencia_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar una foto de evidencia",
    description="Borrado lógico (el archivo se conserva en el servidor). Lo hacen quien registró "
    "el hallazgo, el agrónomo y el administrador.",
    responses={**ERROR_401, **ERROR_403, 404: {"description": "Hallazgo o foto no encontrados"}},
)
async def eliminar_evidencia(
    hallazgo_id: uuid.UUID, evidencia_id: uuid.UUID, usuario: CampoDep, session: SessionDep
) -> None:
    hallazgo = await _exigir_hallazgo(session, usuario, hallazgo_id, escribir=True)
    evidencia = await _exigir_evidencia(session, hallazgo, evidencia_id)
    evidencia.deleted_at = datetime.now(UTC)
    await session.commit()
