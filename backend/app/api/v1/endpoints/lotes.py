import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.deps import SessionDep, UsuarioActualDep, requiere_rol
from app.models.lote import Lote
from app.models.predio import Predio
from app.models.trampa import Trampa
from app.models.usuario import Usuario
from app.schemas.geo import PoligonoGeoJSON, a_geometria
from app.schemas.lote import LoteActualizar, LoteCrear, LoteGuardado, LoteLeer
from app.services.geo import motivo_invalidez
from app.services.lotes import calcular_area_ha, lotes_traslapados
from app.services.trampas import trampas_fuera

router = APIRouter(prefix="/lotes", tags=["lotes"])

AgronomoDep = Annotated[Usuario, Depends(requiere_rol("agronomo"))]

ERROR_401 = {401: {"description": "Sin sesión o sesión inválida"}}
ERROR_403 = {403: {"description": "Solo el agrónomo administra los lotes"}}
ERROR_404 = {404: {"description": "Lote no encontrado"}}
ERROR_409 = {
    409: {
        "description": "Código repetido, `id` en uso, predio sin registrar o trampas que "
        "quedarían fuera del lote"
    }
}
ERROR_422 = {422: {"description": "Datos inválidos o polígono que se cruza consigo mismo"}}

CODIGO_REPETIDO = "Ya existe un lote con ese código"
ID_EN_USO = "El id ya pertenece a otro lote"


async def _obtener(session: SessionDep, lote_id: uuid.UUID) -> Lote:
    lote = await session.scalar(select(Lote).where(Lote.id == lote_id, Lote.deleted_at.is_(None)))
    if lote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lote no encontrado")
    return lote


async def _aplicar_geometria(session: SessionDep, lote: Lote, geojson: PoligonoGeoJSON) -> None:
    geometria = a_geometria(geojson)
    if motivo := await motivo_invalidez(session, geometria):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=motivo)
    area_ha = await calcular_area_ha(session, geometria)
    if area_ha <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="El polígono es demasiado pequeño: su área no alcanza 0,01 ha",
        )
    if lote.id is not None and (fuera := await trampas_fuera(session, lote.id, geometria)):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Con esa forma quedarían por fuera del lote las trampas " + ", ".join(fuera),
        )
    lote.geom = geometria
    lote.area_ha = area_ha


async def _guardar(session: SessionDep, lote: Lote) -> LoteGuardado:
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        restriccion = getattr(getattr(error.orig, "diag", None), "constraint_name", None)
        detalle = ID_EN_USO if restriccion == "pk_lote" else CODIGO_REPETIDO
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detalle) from None
    await session.refresh(lote)
    return await _con_advertencias(session, lote)


async def _con_advertencias(session: SessionDep, lote: Lote) -> LoteGuardado:
    guardado = LoteGuardado.model_validate(lote)
    guardado.advertencias = [
        f"Se traslapa con el lote {t.codigo} ({t.area_m2:,.0f} m² en común)".replace(",", ".")
        for t in await lotes_traslapados(session, lote.geom, excluir_id=lote.id)
    ]
    return guardado


@router.get(
    "",
    response_model=list[LoteLeer],
    summary="Listar lotes",
    description="Lotes vigentes del predio ordenados por código, con su polígono en GeoJSON.",
    responses=ERROR_401,
)
async def listar_lotes(_usuario: UsuarioActualDep, session: SessionDep) -> list[Lote]:
    consulta = select(Lote).where(Lote.deleted_at.is_(None)).order_by(Lote.codigo)
    return list(await session.scalars(consulta))


@router.get(
    "/{lote_id}",
    response_model=LoteLeer,
    summary="Obtener un lote",
    responses={**ERROR_401, **ERROR_404},
)
async def obtener_lote(lote_id: uuid.UUID, _usuario: UsuarioActualDep, session: SessionDep) -> Lote:
    return await _obtener(session, lote_id)


@router.post(
    "",
    response_model=LoteGuardado,
    status_code=status.HTTP_201_CREATED,
    summary="Crear un lote",
    description="Registra un lote del predio con su polígono en GeoJSON `[longitud, latitud]`. "
    "El servidor valida el polígono (`ST_IsValid`) y calcula el área en hectáreas. Si el lote "
    "se traslapa con otro, se guarda igual y la respuesta lo indica en `advertencias`. "
    "Reenviar el mismo `id` con el mismo código devuelve el lote existente con 200.",
    responses={
        200: {"description": "El lote con ese `id` ya existía", "model": LoteGuardado},
        **ERROR_401,
        **ERROR_403,
        **ERROR_409,
        **ERROR_422,
    },
)
async def crear_lote(
    entrada: LoteCrear, _agronomo: AgronomoDep, session: SessionDep, response: Response
) -> LoteGuardado:
    if entrada.id is not None:
        existente = await session.get(Lote, entrada.id)
        if existente is not None:
            if existente.deleted_at is not None or existente.codigo != entrada.codigo:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ID_EN_USO)
            response.status_code = status.HTTP_200_OK
            return await _con_advertencias(session, existente)

    predio_id = await session.scalar(select(Predio.id).where(Predio.deleted_at.is_(None)))
    if predio_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Registre primero los datos del predio",
        )
    lote = Lote(predio_id=predio_id, codigo=entrada.codigo, nombre=entrada.nombre)
    if entrada.id is not None:
        lote.id = entrada.id
    await _aplicar_geometria(session, lote, entrada.geom)
    session.add(lote)
    return await _guardar(session, lote)


@router.patch(
    "/{lote_id}",
    response_model=LoteGuardado,
    summary="Editar un lote",
    description="Cambia solo los campos enviados. Si cambia `geom`, se valida y se recalcula el "
    "área. `nombre: null` borra el nombre; los demás campos no admiten `null`.",
    responses={**ERROR_401, **ERROR_403, **ERROR_404, **ERROR_409, **ERROR_422},
)
async def actualizar_lote(
    lote_id: uuid.UUID, entrada: LoteActualizar, _agronomo: AgronomoDep, session: SessionDep
) -> LoteGuardado:
    lote = await _obtener(session, lote_id)
    cambios = entrada.model_dump(exclude_unset=True, exclude={"geom"})
    for campo, valor in cambios.items():
        setattr(lote, campo, valor)
    if entrada.geom is not None:
        await _aplicar_geometria(session, lote, entrada.geom)
    return await _guardar(session, lote)


@router.delete(
    "/{lote_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar un lote",
    description="Borrado lógico: el lote deja de aparecer, pero se conserva en la base.",
    responses={
        **ERROR_401,
        **ERROR_403,
        **ERROR_404,
        409: {"description": "El lote tiene trampas registradas"},
    },
)
async def eliminar_lote(lote_id: uuid.UUID, _agronomo: AgronomoDep, session: SessionDep) -> None:
    lote = await _obtener(session, lote_id)
    tiene_trampas = await session.scalar(
        select(Trampa.id).where(Trampa.lote_id == lote.id, Trampa.deleted_at.is_(None)).limit(1)
    )
    if tiene_trampas is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El lote tiene trampas registradas: muévalas o elimínelas antes de borrarlo",
        )
    lote.deleted_at = datetime.now(UTC)
    await session.commit()
