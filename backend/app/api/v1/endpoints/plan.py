import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from app.api.acceso import ROLES_GESTION, exigir_lote, exigir_predio
from app.api.deps import SessionDep, UsuarioActualDep, requiere_rol
from app.models.lote import Lote
from app.models.plan_actividad import PlanActividad
from app.models.predio_usuario import PredioUsuario
from app.models.ruta import Ruta
from app.models.usuario import Usuario
from app.schemas.plan import (
    ActividadActualizar,
    ActividadCrear,
    ActividadLeer,
    Anio,
    CatalogoPlan,
    OpcionCatalogo,
)
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


async def _leer_ids(session: SessionDep, ids: list[uuid.UUID]) -> list[ActividadLeer]:
    filas = await session.execute(
        _consulta().where(PlanActividad.id.in_(ids)).order_by(PlanActividad.semana)
    )
    return [_leer(*fila) for fila in filas]


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
    return [_leer(*fila) for fila in filas]


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
    await session.execute(
        update(PlanActividad)
        .where(condicion, PlanActividad.deleted_at.is_(None))
        .values(deleted_at=func.now())
    )
    await session.commit()
