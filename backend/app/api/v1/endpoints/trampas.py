import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.deps import SessionDep, UsuarioActualDep, requiere_rol
from app.models.lote import Lote
from app.models.trampa import Trampa
from app.models.usuario import Usuario
from app.schemas.geo import a_geometria
from app.schemas.trampa import EstadoTrampa, TrampaActualizar, TrampaCrear, TrampaLeer
from app.services.trampas import punto_en_lote

router = APIRouter(tags=["trampas"])

AgronomoDep = Annotated[Usuario, Depends(requiere_rol("agronomo"))]

ERROR_401 = {401: {"description": "Sin sesión o sesión inválida"}}
ERROR_403 = {403: {"description": "Solo el agrónomo administra las trampas"}}
ERROR_404 = {404: {"description": "Trampa o lote no encontrado"}}
ERROR_409 = {409: {"description": "Código ICA repetido o `id` en uso"}}
ERROR_422 = {422: {"description": "Datos inválidos o punto fuera del polígono de su lote"}}

CODIGO_REPETIDO = "Ya existe una trampa con ese código ICA"
ID_EN_USO = "El id ya pertenece a otra trampa"
FUERA_DEL_LOTE = "La ubicación de la trampa debe quedar dentro del polígono de su lote"


async def _obtener(session: SessionDep, trampa_id: uuid.UUID) -> Trampa:
    trampa = await session.scalar(
        select(Trampa).where(Trampa.id == trampa_id, Trampa.deleted_at.is_(None))
    )
    if trampa is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trampa no encontrada")
    return trampa


async def _exigir_lote(session: SessionDep, lote_id: uuid.UUID) -> None:
    existe = await session.scalar(
        select(Lote.id).where(Lote.id == lote_id, Lote.deleted_at.is_(None))
    )
    if existe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lote no encontrado")


async def _exigir_ubicacion(session: SessionDep, trampa: Trampa) -> None:
    if not await punto_en_lote(session, trampa.lote_id, trampa.geom):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=FUERA_DEL_LOTE
        )


async def _guardar(session: SessionDep, trampa: Trampa) -> Trampa:
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        restriccion = getattr(getattr(error.orig, "diag", None), "constraint_name", None)
        detalle = ID_EN_USO if restriccion == "pk_trampa" else CODIGO_REPETIDO
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detalle) from None
    await session.refresh(trampa)
    return trampa


@router.get(
    "/trampas",
    response_model=list[TrampaLeer],
    summary="Listar trampas",
    description="Trampas vigentes ordenadas por código ICA. Filtros opcionales por lote y estado.",
    responses=ERROR_401,
)
async def listar_trampas(
    _usuario: UsuarioActualDep,
    session: SessionDep,
    lote_id: uuid.UUID | None = None,
    estado: EstadoTrampa | None = None,
) -> list[Trampa]:
    consulta = select(Trampa).where(Trampa.deleted_at.is_(None))
    if lote_id is not None:
        consulta = consulta.where(Trampa.lote_id == lote_id)
    if estado is not None:
        consulta = consulta.where(Trampa.estado == estado)
    return list(await session.scalars(consulta.order_by(Trampa.codigo_ica)))


@router.get(
    "/lotes/{lote_id}/trampas",
    response_model=list[TrampaLeer],
    summary="Listar las trampas de un lote",
    responses={**ERROR_401, 404: {"description": "Lote no encontrado"}},
)
async def listar_trampas_del_lote(
    lote_id: uuid.UUID, _usuario: UsuarioActualDep, session: SessionDep
) -> list[Trampa]:
    await _exigir_lote(session, lote_id)
    consulta = (
        select(Trampa)
        .where(Trampa.lote_id == lote_id, Trampa.deleted_at.is_(None))
        .order_by(Trampa.codigo_ica)
    )
    return list(await session.scalars(consulta))


@router.get(
    "/trampas/{trampa_id}",
    response_model=TrampaLeer,
    summary="Obtener una trampa",
    responses={**ERROR_401, **ERROR_404},
)
async def obtener_trampa(
    trampa_id: uuid.UUID, _usuario: UsuarioActualDep, session: SessionDep
) -> Trampa:
    return await _obtener(session, trampa_id)


@router.post(
    "/trampas",
    response_model=TrampaLeer,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar una trampa",
    description="Ubica la trampa con un punto GeoJSON `[longitud, latitud]`, que debe quedar "
    "dentro del polígono de su lote (`ST_Contains`). `precision_m` se envía cuando la "
    "coordenada viene del GPS. Reenviar el mismo `id` con el mismo código ICA devuelve la "
    "trampa existente con 200.",
    responses={
        200: {"description": "La trampa con ese `id` ya existía", "model": TrampaLeer},
        **ERROR_401,
        **ERROR_403,
        **ERROR_404,
        **ERROR_409,
        **ERROR_422,
    },
)
async def crear_trampa(
    entrada: TrampaCrear, _agronomo: AgronomoDep, session: SessionDep, response: Response
) -> Trampa:
    if entrada.id is not None:
        existente = await session.get(Trampa, entrada.id)
        if existente is not None:
            if existente.deleted_at is not None or existente.codigo_ica != entrada.codigo_ica:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ID_EN_USO)
            response.status_code = status.HTTP_200_OK
            return existente

    await _exigir_lote(session, entrada.lote_id)
    trampa = Trampa(**entrada.model_dump(exclude={"id", "geom"}), geom=a_geometria(entrada.geom))
    if entrada.id is not None:
        trampa.id = entrada.id
    await _exigir_ubicacion(session, trampa)
    session.add(trampa)
    return await _guardar(session, trampa)


@router.patch(
    "/trampas/{trampa_id}",
    response_model=TrampaLeer,
    summary="Editar o mover una trampa",
    description="Cambia solo los campos enviados. Mover la trampa (nuevo `geom` o `lote_id`) "
    "conserva su `id` y su historial de lecturas; la nueva ubicación debe quedar dentro del "
    "lote. Un `geom` nuevo sin `precision_m` borra la precisión anterior. Para retirarla del "
    "campo use `estado: retirada`.",
    responses={**ERROR_401, **ERROR_403, **ERROR_404, **ERROR_409, **ERROR_422},
)
async def actualizar_trampa(
    trampa_id: uuid.UUID, entrada: TrampaActualizar, _agronomo: AgronomoDep, session: SessionDep
) -> Trampa:
    trampa = await _obtener(session, trampa_id)
    cambios = entrada.model_dump(exclude_unset=True, exclude={"geom"})
    if "lote_id" in cambios:
        await _exigir_lote(session, cambios["lote_id"])
    for campo, valor in cambios.items():
        setattr(trampa, campo, valor)
    if entrada.geom is not None:
        trampa.geom = a_geometria(entrada.geom)
        # La precisión del GPS describe el punto anterior: sin una nueva, deja de aplicar.
        if "precision_m" not in cambios:
            trampa.precision_m = None
    if entrada.geom is not None or "lote_id" in cambios:
        await _exigir_ubicacion(session, trampa)
    return await _guardar(session, trampa)


@router.delete(
    "/trampas/{trampa_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar una trampa",
    description="Borrado lógico, para registros hechos por error. Una trampa que se quita del "
    "campo se marca `estado: retirada` y conserva su historial.",
    responses={**ERROR_401, **ERROR_403, **ERROR_404},
)
async def eliminar_trampa(
    trampa_id: uuid.UUID, _agronomo: AgronomoDep, session: SessionDep
) -> None:
    trampa = await _obtener(session, trampa_id)
    trampa.deleted_at = datetime.now(UTC)
    await session.commit()
