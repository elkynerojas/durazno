import uuid
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import aliased

from app.api.acceso import (
    ROLES_CAMPO,
    ROLES_GESTION,
    consulta_predios_visibles,
    exigir_lote,
    exigir_predio,
)
from app.api.deps import SessionDep, UsuarioActualDep, requiere_rol
from app.models.lectura_trampa import LecturaTrampa
from app.models.lote import Lote
from app.models.plan_actividad import PlanActividad
from app.models.plan_cambio import PlanCambio
from app.models.predio import Predio
from app.models.predio_usuario import PredioUsuario
from app.models.ruta import Ruta, RutaTrampa
from app.models.trampa import Trampa
from app.models.usuario import Usuario
from app.schemas.plan import (
    ActividadActualizar,
    ActividadCrear,
    ActividadLeer,
    Anio,
    AvanceLeer,
    CambioLeer,
    CatalogoPlan,
    Cumplimiento,
    CumplimientoLote,
    CumplimientoPlan,
    CumplimientoSemana,
    FilaCumplimiento,
    MiActividad,
    MiSemana,
    OpcionCatalogo,
    Reprogramacion,
    Semana,
    VisitaAdicional,
)
from app.services.cumplimiento import ActividadAvance, avances, estado_actividad
from app.services.monitoreo import hoy_bogota
from app.services.plan import ids_de_serie, semanas_del_anio, semanas_repetidas

router = APIRouter(prefix="/plan", tags=["plan"])

GestionDep = Annotated[Usuario, Depends(requiere_rol(*ROLES_GESTION))]
ERROR_401 = {401: {"description": "Sin sesión o sesión inválida"}}
ERROR_403 = {403: {"description": "Solo el agrónomo o el administrador programan actividades"}}
ERROR_404 = {404: {"description": "Actividad, lote o predio no encontrado (o no asignado)"}}
ERROR_409 = {409: {"description": "El `id` ya se usó para otra actividad"}}
ERROR_422 = {
    422: {
        "description": "Datos inválidos: semana que no existe en el año, responsable no asignado "
        "al predio o visita de monitoreo en un lote sin ruta"
    }
}
NO_ENCONTRADA = "Actividad no encontrada"
# Quienes pueden ser responsables de una actividad en campo.
ROLES_RESPONSABLE = ("tecnico", "agronomo")

TIPOS = {
    "visita_monitoreo": "Visita de monitoreo",
    "cambio_atrayente": "Cambio de atrayente",
    "labor_cultural": "Labor cultural",
}
LABORES = {
    "poda": "Poda",
    "fertilizacion": "Fertilización",
    "raleo": "Raleo de frutos",
    "cosecha": "Cosecha",
    "riego": "Riego",
    "control_malezas": "Control de malezas",
    "otra": "Otra labor",
}


def _no_valida(detalle: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=detalle)


def _consulta():
    return (
        select(PlanActividad, Lote.codigo, Usuario.nombre_completo)
        .join(Lote, Lote.id == PlanActividad.lote_id)
        .join(Usuario, Usuario.id == PlanActividad.responsable_id)
        .where(PlanActividad.deleted_at.is_(None))
    )


def _leer(actividad: PlanActividad, lote_codigo: str, responsable: str) -> ActividadLeer:
    return ActividadLeer.model_validate(
        {
            **{
                c: getattr(actividad, c)
                for c in ActividadLeer.model_fields
                if hasattr(actividad, c)
            },
            "lote_codigo": lote_codigo,
            "responsable_nombre": responsable,
        }
    )


async def _con_cumplimiento(session: SessionDep, lista: list[ActividadLeer]) -> list:
    """Estado calculado y avance de cada actividad a partir de las lecturas (HU-22)."""
    progreso = await avances(
        session,
        (
            ActividadAvance(a.id, a.tipo, a.lote_id, a.ruta_id, a.tipo_trampa, a.anio, a.semana)
            for a in lista
        ),
    )
    hoy = hoy_bogota()
    for a in lista:
        avance = progreso.get(a.id)
        a.avance = AvanceLeer(hechas=avance.hechas, total=avance.total) if avance else None
        a.estado = estado_actividad(a.estado, a.anio, a.semana, hoy, avance)
    return lista


async def _leer_ids(session: SessionDep, ids: list[uuid.UUID]) -> list[ActividadLeer]:
    filas = await session.execute(
        _consulta().where(PlanActividad.id.in_(ids)).order_by(PlanActividad.semana)
    )
    return await _con_cumplimiento(session, [_leer(*fila) for fila in filas])


async def _exigir_responsable(
    session: SessionDep, predio_id: uuid.UUID, responsable_id: uuid.UUID
) -> None:
    asignado = await session.scalar(
        select(Usuario.id)
        .join(PredioUsuario, PredioUsuario.usuario_id == Usuario.id)
        .where(
            Usuario.id == responsable_id,
            Usuario.activo,
            Usuario.deleted_at.is_(None),
            Usuario.rol.in_(ROLES_RESPONSABLE),
            PredioUsuario.predio_id == predio_id,
            PredioUsuario.deleted_at.is_(None),
        )
    )
    if asignado is None:
        raise _no_valida("El responsable debe ser un técnico o agrónomo activo asignado al predio")


def _exigir_semana(anio: int, semana: int) -> None:
    if semana > (total := semanas_del_anio(anio)):
        raise _no_valida(f"El año {anio} tiene {total} semanas ISO")


def _registrar(
    session: SessionDep, actividad: PlanActividad, usuario: Usuario, accion: str, **datos
) -> PlanCambio:
    """Agrega una fila al historial del plan (HU-23) con la semana que tenía la actividad."""
    cambio = PlanCambio(
        actividad_id=actividad.id,
        predio_id=actividad.predio_id,
        usuario_id=usuario.id,
        accion=accion,
        anio_anterior=actividad.anio,
        semana_anterior=actividad.semana,
        **datos,
    )
    session.add(cambio)
    return cambio


async def _cambios(session: SessionDep, *condiciones) -> list[CambioLeer]:
    autor, anterior, nuevo = aliased(Usuario), aliased(Usuario), aliased(Usuario)
    filas = await session.execute(
        select(
            PlanCambio,
            PlanActividad,
            Lote.codigo,
            autor.nombre_completo,
            anterior.nombre_completo,
            nuevo.nombre_completo,
        )
        .join(PlanActividad, PlanActividad.id == PlanCambio.actividad_id)
        .join(Lote, Lote.id == PlanActividad.lote_id)
        .join(autor, autor.id == PlanCambio.usuario_id)
        .outerjoin(anterior, anterior.id == PlanCambio.responsable_anterior_id)
        .outerjoin(nuevo, nuevo.id == PlanCambio.responsable_nuevo_id)
        .where(PlanCambio.deleted_at.is_(None), *condiciones)
        .order_by(PlanCambio.created_at.desc(), PlanCambio.id.desc())
        .limit(500)
    )
    return [
        CambioLeer(
            id=cambio.id,
            actividad_id=actividad.id,
            lote_codigo=lote,
            tipo=actividad.tipo,
            labor=actividad.labor,
            tipo_trampa=actividad.tipo_trampa,
            accion=cambio.accion,
            anio_anterior=cambio.anio_anterior,
            semana_anterior=cambio.semana_anterior,
            anio_nuevo=cambio.anio_nuevo,
            semana_nueva=cambio.semana_nueva,
            responsable_anterior=nombre_anterior,
            responsable_nuevo=nombre_nuevo,
            motivo=cambio.motivo,
            usuario=nombre_autor,
            created_at=cambio.created_at,
        )
        for cambio, actividad, lote, nombre_autor, nombre_anterior, nombre_nuevo in filas
    ]


async def _exigir_actividad(
    session: SessionDep, usuario: Usuario, actividad_id: uuid.UUID, *, escribir: bool = False
) -> PlanActividad:
    actividad = await session.scalar(
        select(PlanActividad).where(
            PlanActividad.id == actividad_id, PlanActividad.deleted_at.is_(None)
        )
    )
    await exigir_predio(
        session,
        usuario,
        actividad.predio_id if actividad else None,
        escribir=escribir,
        detalle_404=NO_ENCONTRADA,
    )
    return actividad


async def _ya_programada(
    session: SessionDep,
    existente: PlanActividad,
    entrada: ActividadCrear,
    ids: list[uuid.UUID],
    response: Response,
) -> list[ActividadLeer]:
    """Reenvío del mismo `id`: devuelve lo creado (200) si es la misma actividad; 409 si no."""
    misma = (existente.lote_id, existente.tipo, existente.anio, existente.semana) == (
        entrada.lote_id,
        entrada.tipo,
        entrada.anio,
        entrada.semana,
    )
    if existente.deleted_at is not None or not misma:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ese id ya está en uso")
    response.status_code = status.HTTP_200_OK
    return await _leer_ids(session, ids)


@router.get(
    "/catalogo",
    response_model=CatalogoPlan,
    summary="Tipos de actividad y labores culturales",
    description="Valores y nombres en español para los selectores del formulario del plan.",
    responses=ERROR_401,
)
async def catalogo(_: UsuarioActualDep) -> CatalogoPlan:
    return CatalogoPlan(
        tipos=[OpcionCatalogo(valor=v, nombre=n) for v, n in TIPOS.items()],
        labores=[OpcionCatalogo(valor=v, nombre=n) for v, n in LABORES.items()],
    )


@router.get(
    "",
    response_model=list[ActividadLeer],
    summary="Plan anual del predio",
    description="Actividades vigentes del predio en el año (por defecto, el actual en "
    "America/Bogota), ordenadas por lote y semana. Con `lote_id`, solo las de ese lote. "
    "Cualquier rol con el predio asignado.",
    responses={**ERROR_401, **ERROR_404},
)
async def listar_plan(
    predio_id: uuid.UUID,
    usuario: UsuarioActualDep,
    session: SessionDep,
    anio: Anio | None = None,
    lote_id: uuid.UUID | None = None,
) -> list[ActividadLeer]:
    await exigir_predio(session, usuario, predio_id)
    consulta = _consulta().where(
        PlanActividad.predio_id == predio_id,
        PlanActividad.anio == (anio or hoy_bogota().isocalendar().year),
        Lote.deleted_at.is_(None),
    )
    if lote_id is not None:
        consulta = consulta.where(PlanActividad.lote_id == lote_id)
    filas = await session.execute(
        consulta.order_by(Lote.codigo, PlanActividad.tipo, PlanActividad.semana)
    )
    return await _con_cumplimiento(session, [_leer(*fila) for fila in filas])


@router.get(
    "/mias",
    response_model=MiSemana,
    summary="Mis actividades de la semana",
    description="Actividades de la semana ISO (por defecto, la actual en America/Bogota) de las "
    "que el usuario es responsable, en todos sus predios, ordenadas por predio, lote y tipo. Las "
    "visitas de monitoreo traen el número de paradas de la ruta. Para la vista «Mi semana» y la "
    "app móvil.",
    responses={**ERROR_401, 422: {"description": "La semana no existe en el año"}},
)
async def mis_actividades(
    usuario: UsuarioActualDep,
    session: SessionDep,
    anio: Anio | None = None,
    semana: Semana | None = None,
) -> MiSemana:
    hoy = hoy_bogota().isocalendar()
    anio = anio or hoy.year
    semana = semana or (hoy.week if anio == hoy.year else 1)
    _exigir_semana(anio, semana)
    paradas = (
        select(func.count())
        .select_from(RutaTrampa)
        .join(Ruta, Ruta.id == RutaTrampa.ruta_id)
        .where(
            RutaTrampa.ruta_id == PlanActividad.ruta_id,
            RutaTrampa.deleted_at.is_(None),
            Ruta.deleted_at.is_(None),
        )
        .scalar_subquery()
    )
    visibles = consulta_predios_visibles(usuario).with_only_columns(Predio.id)
    filas = await session.execute(
        _consulta()
        .add_columns(Predio.nombre, paradas)
        .join(Predio, Predio.id == PlanActividad.predio_id)
        .where(
            PlanActividad.responsable_id == usuario.id,
            PlanActividad.anio == anio,
            PlanActividad.semana == semana,
            Lote.deleted_at.is_(None),
            PlanActividad.predio_id.in_(visibles),
        )
        # Primero las visitas de monitoreo (el recorrido), luego recambios y labores.
        .order_by(
            Predio.nombre,
            Lote.codigo,
            case({t: i for i, t in enumerate(TIPOS)}, value=PlanActividad.tipo),
        )
    )
    actividades = [
        MiActividad(
            **_leer(actividad, lote, responsable).model_dump(),
            predio_nombre=predio,
            ruta_paradas=(total or None) if actividad.ruta_id else None,
        )
        for actividad, lote, responsable, predio, total in filas
    ]
    await _con_cumplimiento(session, actividades)
    lunes = date.fromisocalendar(anio, semana, 1)
    return MiSemana(
        anio=anio,
        semana=semana,
        desde=lunes,
        hasta=date.fromisocalendar(anio, semana, 7),
        actividades=actividades,
    )


@router.get(
    "/cumplimiento",
    response_model=CumplimientoPlan,
    summary="Indicadores de cumplimiento del plan",
    description="Porcentaje de actividades cumplidas por semana y por lote, contando las que ya "
    "debían hacerse: de la semana 1 a la actual (o a la última, si el año ya pasó). Cualquier "
    "rol con el predio asignado.",
    responses={
        401: {"description": "Sin sesión o sesión inválida"},
        404: {"description": "Predio no encontrado (o no asignado)"},
    },
)
async def indicadores_cumplimiento(
    predio_id: uuid.UUID, usuario: UsuarioActualDep, session: SessionDep, anio: Anio | None = None
) -> CumplimientoPlan:
    await exigir_predio(session, usuario, predio_id)
    hoy = hoy_bogota().isocalendar()
    anio = anio or hoy.year
    if anio > hoy.year:
        hasta = 0
    elif anio == hoy.year:
        hasta = hoy.week
    else:
        hasta = semanas_del_anio(anio)
    filas = await session.execute(
        _consulta().where(
            PlanActividad.predio_id == predio_id,
            PlanActividad.anio == anio,
            PlanActividad.semana <= hasta,
            Lote.deleted_at.is_(None),
        )
    )
    crudas = [(fila[0].estado, _leer(*fila)) for fila in filas]
    lista = await _con_cumplimiento(session, [a for _, a in crudas])
    pares = [(a.estado, base) for (base, _), a in zip(crudas, lista, strict=True)]
    por_semana: dict[int, list] = {}
    por_lote: dict[tuple, list] = {}
    for (estado, base), a in zip(pares, lista, strict=True):
        por_semana.setdefault(a.semana, []).append((estado, base))
        por_lote.setdefault((a.lote_codigo, a.lote_id), []).append((estado, base))
    return CumplimientoPlan(
        anio=anio,
        hasta_semana=hasta,
        total=FilaCumplimiento(**_fila(pares)),
        semanas=[
            CumplimientoSemana(semana=semana, **_fila(estados))
            for semana, estados in sorted(por_semana.items())
        ],
        lotes=[
            CumplimientoLote(lote_id=lote_id, lote_codigo=codigo, **_fila(estados))
            for (codigo, lote_id), estados in sorted(por_lote.items(), key=lambda x: x[0][0])
        ],
    )


@router.get(
    "/cambios",
    response_model=list[CambioLeer],
    summary="Historial de cambios del plan del predio",
    description="Reprogramaciones, cambios de responsable y eliminaciones del plan del predio "
    "(las 500 más recientes), con quién los hizo y por qué. Cualquier rol con el predio asignado.",
    responses={**ERROR_401, **ERROR_404},
)
async def historial_predio(
    predio_id: uuid.UUID, usuario: UsuarioActualDep, session: SessionDep
) -> list[CambioLeer]:
    await exigir_predio(session, usuario, predio_id)
    return await _cambios(session, PlanCambio.predio_id == predio_id)


@router.post(
    "/visita-adicional",
    response_model=ActividadLeer,
    status_code=status.HTTP_201_CREATED,
    summary="Programar una visita adicional desde una lectura con capturas",
    description="Responde a un hallazgo en campo: crea una visita de monitoreo al lote de la "
    "trampa (con su ruta), por defecto en la semana siguiente a la lectura y con quien la "
    "registró como responsable. La actividad guarda la lectura de origen. Reenviar el mismo "
    "`id` devuelve la visita ya creada con 200.",
    responses={
        200: {"description": "La visita con ese `id` ya existía"},
        **ERROR_401,
        **ERROR_403,
        **ERROR_404,
        **ERROR_409,
        422: {
            "description": "La lectura no tiene capturas o está rechazada, el lote no tiene ruta, "
            "la semana no existe o el responsable no está asignado"
        },
    },
)
async def visita_adicional(
    entrada: VisitaAdicional, usuario: GestionDep, session: SessionDep, response: Response
) -> ActividadLeer:
    fila = (
        await session.execute(
            select(LecturaTrampa, Trampa.codigo_ica, Trampa.lote_id)
            .join(Trampa, Trampa.id == LecturaTrampa.trampa_id)
            .where(LecturaTrampa.id == entrada.lectura_id, LecturaTrampa.deleted_at.is_(None))
        )
    ).first()
    no_existe = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lectura no encontrada")
    if fila is None:
        raise no_existe
    lectura, codigo_ica, lote_id = fila
    try:
        lote = await exigir_lote(session, usuario, lote_id, escribir=True)
    except HTTPException as error:
        if error.status_code == status.HTTP_404_NOT_FOUND:
            raise no_existe from error
        raise

    if entrada.id is not None and (existente := await session.get(PlanActividad, entrada.id)):
        if existente.deleted_at is not None or existente.lectura_origen_id != lectura.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Ese id ya está en uso"
            )
        response.status_code = status.HTTP_200_OK
        [leida] = await _leer_ids(session, [existente.id])
        return leida

    capturas = lectura.capitata_machos + lectura.capitata_hembras + lectura.anastrepha
    if lectura.estado == "rechazada" or capturas == 0:
        raise _no_valida("La visita adicional se programa desde una lectura válida con capturas")
    siguiente = (lectura.fecha + timedelta(weeks=1)).isocalendar()
    anio = entrada.anio or siguiente.year
    semana = entrada.semana or (siguiente.week if anio == siguiente.year else 1)
    _exigir_semana(anio, semana)
    responsable_id = entrada.responsable_id or lectura.responsable_id
    await _exigir_responsable(session, lote.predio_id, responsable_id)
    ruta_id = await session.scalar(
        select(Ruta.id).where(Ruta.lote_id == lote.id, Ruta.deleted_at.is_(None))
    )
    if ruta_id is None:
        raise _no_valida(
            f"El lote {lote.codigo} no tiene ruta: defínala antes de programar visitas"
        )

    actividad = PlanActividad(
        predio_id=lote.predio_id,
        lote_id=lote.id,
        tipo="visita_monitoreo",
        ruta_id=ruta_id,
        anio=anio,
        semana=semana,
        responsable_id=responsable_id,
        lectura_origen_id=lectura.id,
        notas=f"Visita adicional por {capturas} capturas en {codigo_ica} "
        f"({lectura.fecha:%d/%m/%Y})",
    )
    if entrada.id is not None:
        actividad.id = entrada.id
    session.add(actividad)
    await session.flush()
    [leida] = await _leer_ids(session, [actividad.id])
    await session.commit()
    return leida


@router.post(
    "",
    response_model=list[ActividadLeer],
    status_code=status.HTTP_201_CREATED,
    summary="Programar una actividad",
    description="Programa una actividad del lote en una semana ISO; con `repetir`, la serie "
    "cada N semanas hasta la semana indicada del mismo año. Una visita de monitoreo se liga a "
    "la ruta vigente del lote. Devuelve las actividades creadas. Reenviar el mismo `id` "
    "devuelve las ya creadas con 200.",
    responses={
        200: {"description": "La actividad (o serie) con ese `id` ya existía"},
        **ERROR_401,
        **ERROR_403,
        **ERROR_404,
        **ERROR_409,
        **ERROR_422,
    },
)
async def programar(
    entrada: ActividadCrear, usuario: GestionDep, session: SessionDep, response: Response
) -> list[ActividadLeer]:
    lote = await exigir_lote(session, usuario, entrada.lote_id, escribir=True)
    semanas = (
        semanas_repetidas(
            entrada.semana, entrada.repetir.cada_semanas, entrada.repetir.hasta_semana
        )
        if entrada.repetir
        else [entrada.semana]
    )
    # La semana (o la última de la repetición) debe existir en el año: 52 o 53 semanas ISO.
    _exigir_semana(
        entrada.anio, entrada.repetir.hasta_semana if entrada.repetir else entrada.semana
    )
    serie_id = entrada.id or uuid.uuid4()
    ids = ids_de_serie(serie_id, len(semanas))

    if entrada.id is not None and (existente := await session.get(PlanActividad, entrada.id)):
        return await _ya_programada(session, existente, entrada, ids, response)

    await _exigir_responsable(session, lote.predio_id, entrada.responsable_id)
    ruta_id = None
    if entrada.tipo == "visita_monitoreo":
        ruta_id = await session.scalar(
            select(Ruta.id).where(Ruta.lote_id == lote.id, Ruta.deleted_at.is_(None))
        )
        if ruta_id is None:
            raise _no_valida(
                f"El lote {lote.codigo} no tiene ruta: defínala antes de programar visitas"
            )
    session.add_all(
        PlanActividad(
            id=actividad_id,
            predio_id=lote.predio_id,
            lote_id=lote.id,
            tipo=entrada.tipo,
            labor=entrada.labor,
            tipo_trampa=entrada.tipo_trampa,
            ruta_id=ruta_id,
            anio=entrada.anio,
            semana=semana,
            responsable_id=entrada.responsable_id,
            serie_id=serie_id if entrada.repetir else None,
            notas=entrada.notas,
        )
        for actividad_id, semana in zip(ids, semanas, strict=True)
    )
    try:
        await session.flush()
    except IntegrityError:
        # Dos envíos simultáneos del mismo `id`: el segundo responde como reenvío.
        await session.rollback()
        existente = await session.get(PlanActividad, entrada.id) if entrada.id else None
        if existente is None:
            raise
        return await _ya_programada(session, existente, entrada, ids, response)
    creadas = await _leer_ids(session, ids)
    await session.commit()
    return creadas


@router.patch(
    "/{actividad_id}",
    response_model=ActividadLeer,
    summary="Cambiar el responsable o las notas",
    description="Para moverla de semana use la reprogramación (HU-23).",
    responses={**ERROR_401, **ERROR_403, **ERROR_404, **ERROR_422},
)
async def actualizar_actividad(
    actividad_id: uuid.UUID, entrada: ActividadActualizar, usuario: GestionDep, session: SessionDep
) -> ActividadLeer:
    actividad = await _exigir_actividad(session, usuario, actividad_id, escribir=True)
    cambios = entrada.model_dump(exclude_unset=True)
    if "responsable_id" in cambios:
        await _exigir_responsable(session, actividad.predio_id, cambios["responsable_id"])
        if cambios["responsable_id"] != actividad.responsable_id:
            _registrar(
                session,
                actividad,
                usuario,
                "responsable",
                responsable_anterior_id=actividad.responsable_id,
                responsable_nuevo_id=cambios["responsable_id"],
            )
    for campo, valor in cambios.items():
        setattr(actividad, campo, valor)
    actividad.updated_at = func.now()
    await session.flush()
    [leida] = await _leer_ids(session, [actividad.id])
    await session.commit()
    return leida


@router.delete(
    "/{actividad_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar una actividad",
    description="Borrado lógico. Con `serie=true`, también las siguientes de su serie.",
    responses={**ERROR_401, **ERROR_403, **ERROR_404},
)
async def eliminar_actividad(
    actividad_id: uuid.UUID, usuario: GestionDep, session: SessionDep, serie: bool = False
) -> None:
    actividad = await _exigir_actividad(session, usuario, actividad_id, escribir=True)
    condicion = PlanActividad.id == actividad.id
    if serie and actividad.serie_id is not None:
        condicion = (
            (PlanActividad.serie_id == actividad.serie_id)
            & (PlanActividad.semana >= actividad.semana)
            & (PlanActividad.predio_id == actividad.predio_id)
        )
    eliminadas = await session.scalars(
        select(PlanActividad).where(condicion, PlanActividad.deleted_at.is_(None))
    )
    for eliminada in eliminadas:
        _registrar(session, eliminada, usuario, "eliminada")
        eliminada.deleted_at = func.now()
    await session.commit()


@router.post(
    "/{actividad_id}/reprogramar",
    response_model=ActividadLeer,
    summary="Reprogramar una actividad",
    description="Mueve la actividad a otra semana ISO (de este u otro año) con un motivo "
    "obligatorio, p. ej. un aumento de capturas. Queda en estado `reprogramada` y el cambio "
    "se guarda en el historial. Reenviar el mismo `id` de cambio no la mueve dos veces.",
    responses={**ERROR_401, **ERROR_403, **ERROR_404, **ERROR_409, **ERROR_422},
)
async def reprogramar(
    actividad_id: uuid.UUID, entrada: Reprogramacion, usuario: GestionDep, session: SessionDep
) -> ActividadLeer:
    actividad = await _exigir_actividad(session, usuario, actividad_id, escribir=True)
    if entrada.id is not None and (previo := await session.get(PlanCambio, entrada.id)):
        if previo.actividad_id != actividad.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Ese id ya está en uso"
            )
        [leida] = await _leer_ids(session, [actividad.id])
        return leida
    _exigir_semana(entrada.anio, entrada.semana)
    if (entrada.anio, entrada.semana) == (actividad.anio, actividad.semana):
        raise _no_valida("La actividad ya está en esa semana: elija otra")
    cambio = _registrar(
        session,
        actividad,
        usuario,
        "reprogramada",
        anio_nuevo=entrada.anio,
        semana_nueva=entrada.semana,
        motivo=entrada.motivo,
    )
    if entrada.id is not None:
        cambio.id = entrada.id
    actividad.anio, actividad.semana = entrada.anio, entrada.semana
    actividad.estado = "reprogramada"
    actividad.updated_at = func.now()
    await session.flush()
    [leida] = await _leer_ids(session, [actividad.id])
    await session.commit()
    return leida


@router.get(
    "/{actividad_id}/historial",
    response_model=list[CambioLeer],
    summary="Historial de una actividad",
    description="Cambios de la actividad, del más reciente al más antiguo.",
    responses={**ERROR_401, **ERROR_404},
)
async def historial_actividad(
    actividad_id: uuid.UUID, usuario: UsuarioActualDep, session: SessionDep
) -> list[CambioLeer]:
    actividad = await _exigir_actividad(session, usuario, actividad_id)
    return await _cambios(session, PlanCambio.actividad_id == actividad.id)


@router.post(
    "/{actividad_id}/cumplimiento",
    response_model=ActividadLeer,
    summary="Marcar una labor cultural como cumplida",
    description="Las labores culturales no dejan lecturas: las marca cumplidas (o las desmarca) "
    "su responsable, el agrónomo o el administrador. Las visitas de monitoreo y los cambios de "
    "atrayente se cumplen solos con las lecturas de su semana.",
    responses={
        401: {"description": "Sin sesión o sesión inválida"},
        403: {"description": "El técnico solo marca las labores de las que es responsable"},
        404: {"description": "Actividad no encontrada (o no asignada)"},
        422: {"description": "No es una labor cultural"},
    },
)
async def marcar_cumplimiento(
    actividad_id: uuid.UUID,
    entrada: Cumplimiento,
    usuario: Annotated[Usuario, Depends(requiere_rol(*ROLES_CAMPO))],
    session: SessionDep,
) -> ActividadLeer:
    actividad = await _exigir_actividad(session, usuario, actividad_id)
    await exigir_predio(
        session, usuario, actividad.predio_id, escribir=True, roles_escritura=ROLES_CAMPO
    )
    if usuario.rol not in ROLES_GESTION and actividad.responsable_id != usuario.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el responsable, el agrónomo o el administrador marcan esta labor",
        )
    if actividad.tipo != "labor_cultural":
        raise _no_valida(
            "Las visitas y los cambios de atrayente se cumplen con las lecturas de su semana"
        )
    if entrada.cumplida and actividad.estado != "cumplida":
        actividad.estado = "cumplida"
        actividad.cumplida_por_id = usuario.id
        actividad.cumplida_en = func.now()
    elif not entrada.cumplida and actividad.estado == "cumplida":
        reprogramada = await session.scalar(
            select(PlanCambio.id).where(
                PlanCambio.actividad_id == actividad.id, PlanCambio.accion == "reprogramada"
            )
        )
        actividad.estado = "reprogramada" if reprogramada else "programada"
        actividad.cumplida_por_id = None
        actividad.cumplida_en = None
    await session.flush()
    await session.refresh(actividad)
    [leida] = await _leer_ids(session, [actividad.id])
    await session.commit()
    return leida


def _fila(estados: list[tuple[str, str]]) -> dict:
    """Conteos de (estado calculado, estado base) de las actividades que ya debían hacerse."""
    programadas = [e for e in estados if e[0] != "cancelada"]
    cumplidas = sum(1 for e, _ in programadas if e == "cumplida")
    return {
        "programadas": len(programadas),
        "cumplidas": cumplidas,
        "vencidas": sum(1 for e, _ in programadas if e == "vencida"),
        "reprogramadas": sum(1 for _, base in programadas if base == "reprogramada"),
        "porcentaje": round(cumplidas / len(programadas) * 100, 1) if programadas else None,
    }
