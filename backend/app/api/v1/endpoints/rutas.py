import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from app.api.acceso import ROLES_GESTION, exigir_lote, exigir_predio
from app.api.deps import SessionDep, UsuarioActualDep, requiere_rol
from app.models.lote import Lote
from app.models.ruta import Ruta, RutaTrampa
from app.models.trampa import Trampa
from app.models.usuario import Usuario
from app.schemas.geo import a_geojson
from app.schemas.ruta import ParadaRuta, RutaActualizar, RutaCrear, RutaLeer, RutaPropuesta
from app.services.rutas import errores_de_orden, matriz_distancias, vecino_mas_cercano

router = APIRouter(prefix="/rutas", tags=["rutas"])

GestionDep = Annotated[Usuario, Depends(requiere_rol(*ROLES_GESTION))]
ERROR_401 = {401: {"description": "Sin sesión o sesión inválida"}}
ERROR_403 = {403: {"description": "Solo el agrónomo o el administrador definen las rutas"}}
ERROR_404 = {404: {"description": "Ruta o lote no encontrado (o no asignado al usuario)"}}
ERROR_409 = {409: {"description": "El lote ya tiene una ruta, o el `id` ya se usó"}}
ERROR_422 = {
    422: {
        "description": "Orden incompleto: omite trampas activas, repite alguna o incluye "
        "trampas que no están activas en el lote"
    }
}
NO_ENCONTRADA = "Ruta no encontrada"


async def _trampas_activas(session: SessionDep, lote_id: uuid.UUID) -> dict[uuid.UUID, Trampa]:
    trampas = await session.scalars(
        select(Trampa).where(
            Trampa.lote_id == lote_id, Trampa.estado == "activa", Trampa.deleted_at.is_(None)
        )
    )
    return {t.id: t for t in trampas}


async def _paradas(session: SessionDep, trampas: list[Trampa]) -> tuple[list[ParadaRuta], float]:
    distancias = await matriz_distancias(session, [t.id for t in trampas])
    paradas, total, anterior = [], 0.0, None
    for orden, trampa in enumerate(trampas, start=1):
        tramo = None if anterior is None else distancias[anterior.id, trampa.id]
        total += tramo or 0
        paradas.append(
            ParadaRuta(
                orden=orden,
                trampa_id=trampa.id,
                codigo_ica=trampa.codigo_ica,
                tipo=trampa.tipo,
                estado=trampa.estado,
                geom=a_geojson(trampa.geom),
                distancia_desde_anterior_m=None if tramo is None else round(tramo, 1),
            )
        )
        anterior = trampa
    return paradas, round(total, 1)


async def _leer(session: SessionDep, ruta: Ruta) -> RutaLeer:
    lote = await session.get(Lote, ruta.lote_id)
    # Las paradas guardadas, aunque la trampa ya no esté activa (HU-20 avisa esos casos).
    trampas = list(
        await session.scalars(
            select(Trampa)
            .join(RutaTrampa, RutaTrampa.trampa_id == Trampa.id)
            .where(
                RutaTrampa.ruta_id == ruta.id,
                RutaTrampa.deleted_at.is_(None),
                Trampa.deleted_at.is_(None),
            )
            .order_by(RutaTrampa.orden)
        )
    )
    paradas, total = await _paradas(session, trampas)
    return RutaLeer(
        id=ruta.id,
        lote_id=ruta.lote_id,
        lote_codigo=lote.codigo,
        requiere_revision=ruta.requiere_revision,
        motivo_revision=ruta.motivo_revision,
        paradas=paradas,
        distancia_total_m=total,
        created_at=ruta.created_at,
        updated_at=ruta.updated_at,
    )


async def _validar_orden(session: SessionDep, lote_id: uuid.UUID, orden: list[uuid.UUID]) -> None:
    activas = await _trampas_activas(session, lote_id)
    errores = errores_de_orden(orden, {i: t.codigo_ica for i, t in activas.items()})
    if errores:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="La ruta debe incluir todas las trampas activas del lote una sola vez. "
            + ". ".join(errores)
            + ".",
        )


def _agregar_paradas(session: SessionDep, ruta: Ruta, orden: list[uuid.UUID]) -> None:
    session.add_all(
        RutaTrampa(ruta_id=ruta.id, trampa_id=trampa_id, orden=posicion)
        for posicion, trampa_id in enumerate(orden, start=1)
    )


async def _exigir_ruta(
    session: SessionDep, usuario: Usuario, ruta_id: uuid.UUID, *, escribir: bool = False
) -> Ruta:
    ruta = await session.scalar(select(Ruta).where(Ruta.id == ruta_id, Ruta.deleted_at.is_(None)))
    lote = await session.get(Lote, ruta.lote_id) if ruta else None
    if ruta is None or lote is None or lote.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=NO_ENCONTRADA)
    await exigir_predio(
        session, usuario, lote.predio_id, escribir=escribir, detalle_404=NO_ENCONTRADA
    )
    return ruta


async def _guardar(session: SessionDep, ruta: Ruta) -> RutaLeer:
    try:
        await session.flush()
    except IntegrityError as error:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="El lote ya tiene una ruta"
        ) from error
    await session.refresh(ruta)
    leida = await _leer(session, ruta)
    await session.commit()
    return leida


@router.get(
    "",
    response_model=list[RutaLeer],
    summary="Listar rutas",
    description="Rutas vigentes del predio `predio_id` o del lote `lote_id`, ordenadas por "
    "código de lote. Cualquier rol con el predio asignado.",
    responses={**ERROR_401, **ERROR_404, 422: {"description": "Falta `predio_id` o `lote_id`"}},
)
async def listar_rutas(
    usuario: UsuarioActualDep,
    session: SessionDep,
    predio_id: uuid.UUID | None = None,
    lote_id: uuid.UUID | None = None,
) -> list[RutaLeer]:
    if lote_id is not None:
        predio_id = (await exigir_lote(session, usuario, lote_id)).predio_id
    elif predio_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Indique el predio (predio_id) o el lote (lote_id)",
        )
    await exigir_predio(session, usuario, predio_id)
    consulta = (
        select(Ruta)
        .join(Lote, Lote.id == Ruta.lote_id)
        .where(Lote.predio_id == predio_id, Ruta.deleted_at.is_(None), Lote.deleted_at.is_(None))
        .order_by(Lote.codigo)
    )
    if lote_id is not None:
        consulta = consulta.where(Ruta.lote_id == lote_id)
    return [await _leer(session, ruta) for ruta in await session.scalars(consulta)]


@router.get(
    "/propuesta",
    response_model=RutaPropuesta,
    summary="Proponer una ruta por vecino más cercano",
    description="Ordena las trampas activas del lote yendo siempre a la más cercana (distancia "
    "geodésica). Sin `inicio_id` prueba a partir de cada trampa y devuelve el recorrido más "
    "corto; con `inicio_id`, empieza en esa trampa. No guarda nada: la propuesta se puede "
    "editar y guardar con `POST` o `PUT /rutas`.",
    responses={
        **ERROR_401,
        **ERROR_404,
        422: {"description": "`inicio_id` no es una trampa activa del lote"},
    },
)
async def proponer_ruta(
    lote_id: uuid.UUID,
    usuario: UsuarioActualDep,
    session: SessionDep,
    inicio_id: uuid.UUID | None = None,
) -> RutaPropuesta:
    await exigir_lote(session, usuario, lote_id)
    activas = await _trampas_activas(session, lote_id)
    if inicio_id is not None and inicio_id not in activas:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="La trampa de inicio no es una trampa activa del lote",
        )
    # Orden estable de partida (por código) para que los empates siempre den lo mismo.
    ids = sorted(activas, key=lambda i: activas[i].codigo_ica)
    distancias = await matriz_distancias(session, ids)
    # Cálculo en Python: fuera del bucle de eventos para no frenar las demás peticiones.
    orden = await run_in_threadpool(vecino_mas_cercano, ids, distancias, inicio_id)
    paradas, total = await _paradas(session, [activas[i] for i in orden])
    return RutaPropuesta(lote_id=lote_id, paradas=paradas, distancia_total_m=total)


@router.get(
    "/{ruta_id}",
    response_model=RutaLeer,
    summary="Obtener una ruta",
    description="Paradas en orden con la distancia de cada tramo. `requiere_revision` avisa si "
    "las trampas del lote cambiaron desde que se guardó.",
    responses={**ERROR_401, **ERROR_404},
)
async def obtener_ruta(
    ruta_id: uuid.UUID, usuario: UsuarioActualDep, session: SessionDep
) -> RutaLeer:
    return await _leer(session, await _exigir_ruta(session, usuario, ruta_id))


@router.post(
    "",
    response_model=RutaLeer,
    status_code=status.HTTP_201_CREATED,
    summary="Definir la ruta de un lote",
    description="Guarda el orden de visita de las trampas del lote. El servidor exige que "
    "incluya todas las trampas activas del lote, sin omisiones ni duplicados, y calcula la "
    "distancia geodésica de cada tramo. Un lote tiene una sola ruta: para cambiarla, `PUT`. "
    "Reenviar el mismo `id` para el mismo lote devuelve la ruta existente con 200.",
    responses={
        200: {"description": "La ruta con ese `id` ya existía", "model": RutaLeer},
        **ERROR_401,
        **ERROR_403,
        **ERROR_404,
        **ERROR_409,
        **ERROR_422,
    },
)
async def crear_ruta(
    entrada: RutaCrear, usuario: GestionDep, session: SessionDep, response: Response
) -> RutaLeer:
    await exigir_lote(session, usuario, entrada.lote_id, escribir=True)
    if entrada.id is not None:
        existente = await session.get(Ruta, entrada.id)
        if existente is not None:
            if existente.deleted_at is not None or existente.lote_id != entrada.lote_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT, detail="Ese id ya está en uso"
                )
            response.status_code = status.HTTP_200_OK
            return await _leer(session, existente)
    await _validar_orden(session, entrada.lote_id, entrada.trampas)
    ruta = Ruta(lote_id=entrada.lote_id)
    if entrada.id is not None:
        ruta.id = entrada.id
    session.add(ruta)
    try:
        await session.flush()
    except IntegrityError as error:
        await session.rollback()
        # Dos envíos simultáneos del mismo `id`: el segundo devuelve la ruta del primero.
        existente = entrada.id and await session.get(Ruta, entrada.id)
        if existente and existente.lote_id == entrada.lote_id and existente.deleted_at is None:
            response.status_code = status.HTTP_200_OK
            return await _leer(session, existente)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El lote ya tiene una ruta: modifíquela en lugar de crear otra",
        ) from error
    _agregar_paradas(session, ruta, entrada.trampas)
    return await _guardar(session, ruta)


@router.put(
    "/{ruta_id}",
    response_model=RutaLeer,
    summary="Cambiar el orden de una ruta",
    description="Reemplaza el orden de visita con las mismas reglas que al crearla. Las paradas "
    "anteriores quedan en el historial (borrado lógico). Guardar la ruta quita la marca "
    "`requiere_revision`; enviar el mismo orden solo confirma la ruta revisada.",
    responses={**ERROR_401, **ERROR_403, **ERROR_404, **ERROR_422},
)
async def actualizar_ruta(
    ruta_id: uuid.UUID, entrada: RutaActualizar, usuario: GestionDep, session: SessionDep
) -> RutaLeer:
    ruta = await _exigir_ruta(session, usuario, ruta_id, escribir=True)
    await _validar_orden(session, ruta.lote_id, entrada.trampas)
    actual = list(
        await session.scalars(
            select(RutaTrampa.trampa_id)
            .where(RutaTrampa.ruta_id == ruta.id, RutaTrampa.deleted_at.is_(None))
            .order_by(RutaTrampa.orden)
        )
    )
    if actual != entrada.trampas:
        await session.execute(
            update(RutaTrampa)
            .where(RutaTrampa.ruta_id == ruta.id, RutaTrampa.deleted_at.is_(None))
            .values(deleted_at=func.now())
        )
        _agregar_paradas(session, ruta, entrada.trampas)
    # Guardarla, aun con el mismo orden, es la revisión que pedía el aviso (HU-20).
    if actual != entrada.trampas or ruta.requiere_revision:
        ruta.requiere_revision = False
        ruta.motivo_revision = None
        ruta.updated_at = func.now()
    return await _guardar(session, ruta)


@router.delete(
    "/{ruta_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar una ruta",
    description="Borrado lógico: la ruta y sus paradas se conservan en la base.",
    responses={**ERROR_401, **ERROR_403, **ERROR_404},
)
async def eliminar_ruta(ruta_id: uuid.UUID, usuario: GestionDep, session: SessionDep) -> None:
    ruta = await _exigir_ruta(session, usuario, ruta_id, escribir=True)
    await session.execute(
        update(RutaTrampa)
        .where(RutaTrampa.ruta_id == ruta.id, RutaTrampa.deleted_at.is_(None))
        .values(deleted_at=func.now())
    )
    ruta.deleted_at = func.now()
    await session.commit()
