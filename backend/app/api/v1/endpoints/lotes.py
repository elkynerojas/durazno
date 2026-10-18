import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.acceso import ROLES_GESTION, exigir_lote, exigir_predio
from app.api.deps import SessionDep, UsuarioActualDep, requiere_rol
from app.models.lote import Lote
from app.models.predio import Predio
from app.models.trampa import Trampa
from app.models.usuario import Usuario
from app.schemas.geo import PoligonoGeoJSON, a_geometria
from app.schemas.lote import LoteActualizar, LoteCrear, LoteGuardado, LoteLeer
from app.services.geo import UMBRAL_M2, area_fuera_m2, calcular_area_ha, motivo_invalidez
from app.services.lotes import lotes_traslapados
from app.services.trampas import trampas_fuera

router = APIRouter(prefix="/lotes", tags=["lotes"])

GestionDep = Annotated[Usuario, Depends(requiere_rol(*ROLES_GESTION))]

ERROR_401 = {401: {"description": "Sin sesión o sesión inválida"}}
ERROR_403 = {403: {"description": "Solo el agrónomo o el administrador gestionan los lotes"}}
ERROR_404 = {404: {"description": "Lote o predio no encontrado (o no asignado al usuario)"}}
ERROR_409 = {
    409: {
        "description": "Código repetido en el predio, `id` en uso o trampas que quedarían "
        "fuera del lote"
    }
}
ERROR_422 = {422: {"description": "Datos inválidos o polígono que se cruza consigo mismo"}}

CODIGO_REPETIDO = "Ya existe un lote con ese código en el predio"
ID_EN_USO = "El id ya pertenece a otro lote"


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


def _m2(valor: float) -> str:
    return f"{valor:,.0f} m²".replace(",", ".")


async def _con_advertencias(session: SessionDep, lote: Lote) -> LoteGuardado:
    guardado = LoteGuardado.model_validate(lote)
    guardado.advertencias = [
        f"Se traslapa con el lote {t.codigo} ({_m2(t.area_m2)} en común)"
        for t in await lotes_traslapados(
            session, lote.geom, excluir_id=lote.id, predio_id=lote.predio_id
        )
    ]
    limite = await session.scalar(select(Predio.limite).where(Predio.id == lote.predio_id))
    if limite is not None:
        fuera = await area_fuera_m2(session, lote.geom, limite)
        if fuera > UMBRAL_M2:
            guardado.advertencias.append(f"El lote sale del límite del predio ({_m2(fuera)})")
    return guardado


@router.get(
    "",
    response_model=list[LoteLeer],
    summary="Listar lotes",
    description="Lotes vigentes del predio ordenados por código, con su polígono en GeoJSON.",
    responses={**ERROR_401, **ERROR_404},
)
async def listar_lotes(
    predio_id: uuid.UUID, usuario: UsuarioActualDep, session: SessionDep
) -> list[Lote]:
    await exigir_predio(session, usuario, predio_id)
    consulta = (
        select(Lote)
        .where(Lote.predio_id == predio_id, Lote.deleted_at.is_(None))
        .order_by(Lote.codigo)
    )
    return list(await session.scalars(consulta))


@router.get(
    "/{lote_id}",
    response_model=LoteLeer,
    summary="Obtener un lote",
    responses={**ERROR_401, **ERROR_404},
)
async def obtener_lote(lote_id: uuid.UUID, usuario: UsuarioActualDep, session: SessionDep) -> Lote:
    return await exigir_lote(session, usuario, lote_id)


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
    entrada: LoteCrear, usuario: GestionDep, session: SessionDep, response: Response
) -> LoteGuardado:
    await exigir_predio(session, usuario, entrada.predio_id, escribir=True)
    if entrada.id is not None:
        existente = await session.get(Lote, entrada.id)
        if existente is not None:
            if (
                existente.deleted_at is not None
                or existente.codigo != entrada.codigo
                or existente.predio_id != entrada.predio_id
            ):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ID_EN_USO)
            response.status_code = status.HTTP_200_OK
            return await _con_advertencias(session, existente)

    lote = Lote(
        predio_id=entrada.predio_id,
        codigo=entrada.codigo,
        nombre=entrada.nombre,
        color=entrada.color,
    )
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
    "área. `nombre: null` borra el nombre y `color: null` vuelve al color de la aplicación; "
    "los demás campos no admiten `null`.",
    responses={**ERROR_401, **ERROR_403, **ERROR_404, **ERROR_409, **ERROR_422},
)
async def actualizar_lote(
    lote_id: uuid.UUID, entrada: LoteActualizar, usuario: GestionDep, session: SessionDep
) -> LoteGuardado:
    lote = await exigir_lote(session, usuario, lote_id, escribir=True)
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
async def eliminar_lote(lote_id: uuid.UUID, usuario: GestionDep, session: SessionDep) -> None:
    lote = await exigir_lote(session, usuario, lote_id, escribir=True)
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
