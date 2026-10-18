import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import Numeric, cast, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.api.acceso import ROLES_CAMPO, ROLES_GESTION, exigir_lote, exigir_predio, exigir_trampa
from app.api.deps import SessionDep, UsuarioActualDep, requiere_rol
from app.models.lectura_trampa import LecturaTrampa
from app.models.lote import Lote
from app.models.trampa import Trampa
from app.models.usuario import Usuario
from app.models.visita import Visita
from app.schemas.geo import a_geometria
from app.schemas.lectura import (
    LecturaCrear,
    LecturaLeer,
    LecturaResumen,
    PreparacionLectura,
    Revision,
)
from app.schemas.trampa import EstadoLectura
from app.services.lecturas import avisos_lectura, dias_exposicion, fecha_bogota, revision_anterior

router = APIRouter(prefix="/visitas", tags=["visitas"])

CampoDep = Annotated[Usuario, Depends(requiere_rol(*ROLES_CAMPO))]
GestionDep = Annotated[Usuario, Depends(requiere_rol(*ROLES_GESTION))]
Revisor = aliased(Usuario)
ERROR_401 = {401: {"description": "Sin sesión o sesión inválida"}}
ERROR_403 = {403: {"description": "El productor no registra lecturas"}}
ERROR_404 = {404: {"description": "Trampa, lote o lectura no encontrada (o no asignada)"}}
ERROR_409 = {409: {"description": "El `id` ya se usó, o la trampa ya tiene lectura en esta visita"}}
ERROR_422 = {
    422: {
        "description": "Datos inválidos: fecha futura o anterior a la instalación, trampa no "
        "activa o días de exposición cambiados sin justificación"
    }
}
# Margen para relojes de teléfono un poco adelantados.
TOLERANCIA_FUTURO = timedelta(minutes=5)
# Máximo atraso al registrar (lecturas guardadas sin conexión, fase 2).
MAX_ATRASO = timedelta(days=30)


def ahora() -> datetime:
    return datetime.now(UTC)


def _no_valida(detalle: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=detalle)


def consulta_lecturas():
    return (
        select(
            LecturaTrampa,
            Trampa.codigo_ica,
            Lote.id,
            Lote.codigo,
            Usuario.nombre_completo,
            Revisor.nombre_completo,
        )
        .join(Trampa, Trampa.id == LecturaTrampa.trampa_id)
        .join(Lote, Lote.id == Trampa.lote_id)
        .join(Usuario, Usuario.id == LecturaTrampa.responsable_id)
        .outerjoin(Revisor, Revisor.id == LecturaTrampa.revisada_por_id)
        .where(LecturaTrampa.deleted_at.is_(None))
    )


def leer_lectura(
    usuario: Usuario, lectura, codigo_ica, lote_id, lote_codigo, responsable, revisor
) -> LecturaLeer:
    """Lectura para el usuario. Datos personales (Ley 1581): la posición GPS del técnico solo la
    ven el agrónomo, el administrador y quien la registró; el productor no ve el responsable."""
    datos = {c: getattr(lectura, c) for c in LecturaLeer.model_fields if hasattr(lectura, c)}
    datos.update(
        trampa_codigo_ica=codigo_ica,
        lote_id=lote_id,
        lote_codigo=lote_codigo,
        responsable_nombre=responsable,
        revisada_por=revisor,
        # Los avisos son para quien valida (agrónomo o administrador).
        avisos=avisos_lectura(
            None if lectura.distancia_m is None else float(lectura.distancia_m),
            None if lectura.precision_m is None else float(lectura.precision_m),
            lectura.dias_exposicion,
            lectura.dias_calculados,
            lectura.justificacion_dias,
        )
        if usuario.rol in ROLES_GESTION
        else [],
    )
    if usuario.rol not in ROLES_GESTION and lectura.responsable_id != usuario.id:
        datos.update(posicion=None, precision_m=None)
    if usuario.rol == "productor":
        datos.update(responsable_id=None, responsable_nombre=None, revisada_por=None)
    return LecturaLeer.model_validate(datos)


async def leer_lectura_id(
    session: SessionDep, usuario: Usuario, lectura_id: uuid.UUID
) -> LecturaLeer | None:
    fila = (
        await session.execute(consulta_lecturas().where(LecturaTrampa.id == lectura_id))
    ).first()
    return leer_lectura(usuario, *fila) if fila else None


@router.get(
    "/lecturas/preparar",
    response_model=PreparacionLectura,
    summary="Datos para diligenciar una lectura",
    description="Revisión anterior de la trampa, días de exposición calculados hasta "
    "`observado_en` (por defecto, ahora) y la última lectura. Lo usa el formulario antes de "
    "registrar.",
    responses={**ERROR_401, **ERROR_404},
)
async def preparar_lectura(
    trampa_id: uuid.UUID,
    usuario: UsuarioActualDep,
    session: SessionDep,
    observado_en: datetime | None = None,
) -> PreparacionLectura:
    trampa = await exigir_trampa(session, usuario, trampa_id)
    momento = observado_en or ahora()
    referencia, anterior = await revision_anterior(session, trampa, momento)
    return PreparacionLectura(
        trampa_id=trampa.id,
        revision_anterior=referencia,
        dias_exposicion=dias_exposicion(fecha_bogota(momento), referencia),
        ultima_lectura=LecturaResumen.model_validate(anterior) if anterior else None,
    )


@router.post(
    "/lecturas",
    response_model=LecturaLeer,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar la lectura de una trampa",
    description="Formulario de la trampa en campo (una lectura por trampa y día, hasta 30 días "
    "atrás). El servidor calcula los días de exposición "
    "desde la lectura anterior (o la instalación); si se envían otros, exige justificación. "
    "Con `posicion` guarda la ubicación del dispositivo, su precisión y la distancia a la "
    "trampa. La lectura queda en la visita del técnico a ese lote ese día (se crea si no "
    "existe). Reenviar el mismo `id` devuelve la lectura existente con 200.",
    responses={
        200: {"description": "La lectura con ese `id` ya existía", "model": LecturaLeer},
        **ERROR_401,
        **ERROR_403,
        **ERROR_404,
        **ERROR_409,
        **ERROR_422,
    },
)
async def registrar_lectura(
    entrada: LecturaCrear, usuario: CampoDep, session: SessionDep, response: Response
) -> LecturaLeer:
    try:
        lectura_id, creada = await crear_lectura(session, usuario, entrada)
    except IntegrityError as error:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="La lectura ya estaba registrada"
        ) from error
    if not creada:
        response.status_code = status.HTTP_200_OK
    leida = await leer_lectura_id(session, usuario, lectura_id)
    await session.commit()
    return leida


async def crear_lectura(
    session: AsyncSession, usuario: Usuario, entrada: LecturaCrear
) -> tuple[uuid.UUID, bool]:
    """Valida y guarda la lectura (sin confirmar la transacción). Devuelve su id y si se creó;
    con un `id` ya registrado por el mismo técnico en la misma trampa, devuelve esa lectura sin
    cambiarla (idempotencia; la primera versión que llegó es la que vale). Lanza HTTPException
    (404, 409, 422) o IntegrityError si otra petición la registró al mismo tiempo."""
    trampa = await exigir_trampa(
        session, usuario, entrada.trampa_id, escribir=True, roles_escritura=ROLES_CAMPO
    )
    if entrada.id is not None and (existente := await session.get(LecturaTrampa, entrada.id)):
        if (
            existente.deleted_at is not None
            or existente.trampa_id != trampa.id
            or existente.responsable_id != usuario.id
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Ese id ya está en uso"
            )
        return existente.id, False

    if trampa.estado != "activa":
        raise _no_valida(f"La trampa {trampa.codigo_ica} está {trampa.estado}: no admite lecturas")
    momento = ahora()
    if entrada.observado_en > momento + TOLERANCIA_FUTURO:
        raise _no_valida("La fecha de observación está en el futuro")
    if entrada.observado_en < momento - MAX_ATRASO:
        raise _no_valida(
            f"La lectura tiene más de {MAX_ATRASO.days} días: pida al agrónomo que la registre"
        )
    fecha = fecha_bogota(entrada.observado_en)
    if fecha < trampa.fecha_instalacion:
        raise _no_valida("La fecha de observación es anterior a la instalación de la trampa")

    referencia, _ = await revision_anterior(session, trampa, entrada.observado_en)
    calculados = dias_exposicion(fecha, referencia)
    dias = calculados if entrada.dias_exposicion is None else entrada.dias_exposicion
    if dias != calculados and entrada.justificacion_dias is None:
        raise _no_valida(
            f"Los días de exposición calculados son {calculados}: para usar {dias} "
            "escriba la justificación"
        )

    lote = await session.get(Lote, trampa.lote_id)
    visita = await session.scalar(
        select(Visita).where(
            Visita.tecnico_id == usuario.id,
            Visita.lote_id == lote.id,
            Visita.fecha == fecha,
            Visita.deleted_at.is_(None),
        )
    )
    # Una lectura por trampa y día (de cualquier técnico): no se duplican capturas en el MTD.
    if await session.scalar(
        select(LecturaTrampa.id).where(
            LecturaTrampa.trampa_id == trampa.id,
            LecturaTrampa.fecha == fecha,
            LecturaTrampa.deleted_at.is_(None),
            LecturaTrampa.estado != "rechazada",
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya hay una lectura de {trampa.codigo_ica} del {fecha:%d/%m/%Y}",
        )
    if visita is None:
        visita = Visita(
            predio_id=lote.predio_id, lote_id=lote.id, tecnico_id=usuario.id, fecha=fecha
        )
        session.add(visita)
        await session.flush()

    lectura = LecturaTrampa(
        **entrada.model_dump(exclude={"id", "posicion", "dias_exposicion", "justificacion_dias"}),
        visita_id=visita.id,
        responsable_id=usuario.id,
        fecha=fecha,
        dias_exposicion=dias,
        dias_calculados=calculados,
        justificacion_dias=entrada.justificacion_dias if dias != calculados else None,
    )
    if entrada.id is not None:
        lectura.id = entrada.id
    if entrada.posicion is not None:
        lectura.posicion = a_geometria(entrada.posicion)
        punto = func.ST_GeomFromWKB(bytes(lectura.posicion.data), 4326)
        distancia = func.ST_Distance(func.Geography(punto), func.Geography(Trampa.geom))
        lectura.distancia_m = await session.scalar(
            select(func.round(cast(distancia, Numeric), 1)).where(Trampa.id == trampa.id)
        )
    session.add(lectura)
    await session.flush()
    return lectura.id, True


@router.get(
    "/lecturas",
    response_model=list[LecturaLeer],
    summary="Lecturas de una trampa, un lote o un predio",
    description="Lecturas vigentes de la trampa, el lote o el predio, filtradas por `estado` "
    "(p. ej. `registrada` para la bandeja de validación); con `mias`, solo las que registró el "
    "usuario. De la más reciente a la más antigua, "
    "o al revés con `antiguas_primero`. Cualquier rol con el predio asignado.",
    responses={
        **ERROR_401,
        **ERROR_404,
        422: {"description": "Falta `trampa_id`, `lote_id` o `predio_id`"},
    },
)
async def listar_lecturas(
    usuario: UsuarioActualDep,
    session: SessionDep,
    trampa_id: uuid.UUID | None = None,
    lote_id: uuid.UUID | None = None,
    predio_id: uuid.UUID | None = None,
    estado: EstadoLectura | None = None,
    mias: bool = False,
    antiguas_primero: bool = False,
    limite: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[LecturaLeer]:
    if trampa_id is not None:
        await exigir_trampa(session, usuario, trampa_id)
        condicion = LecturaTrampa.trampa_id == trampa_id
    elif lote_id is not None:
        await exigir_lote(session, usuario, lote_id)
        condicion = Trampa.lote_id == lote_id
    elif predio_id is not None:
        await exigir_predio(session, usuario, predio_id)
        condicion = Lote.predio_id == predio_id
    else:
        raise _no_valida("Indique la trampa (trampa_id), el lote (lote_id) o el predio (predio_id)")
    consulta = consulta_lecturas().where(
        condicion, Trampa.deleted_at.is_(None), Lote.deleted_at.is_(None)
    )
    if estado is not None:
        consulta = consulta.where(LecturaTrampa.estado == estado)
    if mias:
        consulta = consulta.where(LecturaTrampa.responsable_id == usuario.id)
    orden = (
        LecturaTrampa.observado_en.asc() if antiguas_primero else LecturaTrampa.observado_en.desc()
    )
    filas = await session.execute(consulta.order_by(orden).limit(limite))
    return [leer_lectura(usuario, *fila) for fila in filas]


@router.get(
    "/lecturas/{lectura_id}",
    response_model=LecturaLeer,
    summary="Obtener una lectura",
    description="Con sus avisos de revisión. La posición GPS solo la ven el agrónomo, el "
    "administrador y quien la registró; el productor no ve al responsable (Ley 1581).",
    responses={**ERROR_401, **ERROR_404},
)
async def obtener_lectura(
    lectura_id: uuid.UUID, usuario: UsuarioActualDep, session: SessionDep
) -> LecturaLeer:
    lectura = await leer_lectura_id(session, usuario, lectura_id)
    no_existe = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lectura no encontrada")
    if lectura is None:
        raise no_existe
    try:
        await exigir_trampa(session, usuario, lectura.trampa_id)
    except HTTPException as error:
        raise no_existe from error
    return lectura


@router.post(
    "/lecturas/{lectura_id}/revision",
    response_model=LecturaLeer,
    summary="Validar o rechazar una lectura",
    description="El agrónomo (o el administrador) valida la lectura o la rechaza con un motivo; "
    "queda quién y cuándo. Puede revisar también las que registró él mismo (en un predio con un "
    "solo agrónomo no habría quién más). Las rechazadas no cuentan para el MTD ni como "
    "revisión anterior, y "
    "dejan registrar otra lectura de la trampa ese día. Se puede cambiar de decisión.",
    responses={
        **ERROR_401,
        403: {"description": "Solo el agrónomo o el administrador validan lecturas"},
        **ERROR_404,
        409: {
            "description": "Otra persona ya la revisó (`estado_esperado`), o ya hay otra lectura "
            "de la trampa ese día"
        },
        422: {"description": "Rechazo sin motivo"},
    },
)
async def revisar_lectura(
    lectura_id: uuid.UUID, entrada: Revision, usuario: GestionDep, session: SessionDep
) -> LecturaLeer:
    lectura = await session.scalar(
        select(LecturaTrampa).where(
            LecturaTrampa.id == lectura_id, LecturaTrampa.deleted_at.is_(None)
        )
    )
    no_existe = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lectura no encontrada")
    if lectura is None:
        raise no_existe
    try:
        await exigir_trampa(session, usuario, lectura.trampa_id, escribir=True)
    except HTTPException as error:
        if error.status_code == status.HTTP_404_NOT_FOUND:
            raise no_existe from error
        raise
    if entrada.estado_esperado is not None and entrada.estado_esperado != lectura.estado:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Otra persona ya revisó esta lectura: actualice la lista",
        )
    motivo = entrada.motivo if entrada.estado == "rechazada" else None
    if (lectura.estado, lectura.motivo_rechazo) != (entrada.estado, motivo):
        lectura.estado = entrada.estado
        lectura.motivo_rechazo = motivo
        lectura.revisada_por_id = usuario.id
        lectura.revisada_en = func.now()
        try:
            await session.flush()
        except IntegrityError as error:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ya hay otra lectura de esta trampa ese día: rechácela antes de validar "
                "esta",
            ) from error
    await session.refresh(lectura)
    leida = await leer_lectura_id(session, usuario, lectura.id)
    await session.commit()
    return leida
