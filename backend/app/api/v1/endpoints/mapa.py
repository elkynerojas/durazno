import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.acceso import exigir_lote, exigir_predio
from app.api.deps import SessionDep, UsuarioActualDep
from app.models.lote import Lote
from app.models.ruta import Ruta
from app.models.trampa import Trampa
from app.schemas.geo import a_geojson
from app.schemas.mapa import (
    FeatureLote,
    FeatureTrampa,
    MapaPredio,
    PropiedadesLote,
    PropiedadesTrampa,
    ResumenMonitoreo,
    RutaDeLote,
    Umbrales,
)
from app.services.monitoreo import DIAS_REVISION, DIAS_VENCIDA, hoy_bogota, monitoreo_trampa

router = APIRouter(prefix="/mapa", tags=["mapa"])


@router.get(
    "",
    response_model=MapaPredio,
    summary="Mapa del predio con el estado de monitoreo",
    description="FeatureCollection RFC 7946 (WGS 84, `[longitud, latitud]`) con los lotes y las "
    "trampas vigentes del predio `predio_id` (con `lote_id`, solo ese lote). Cada trampa activa "
    "trae su estado de monitoreo según los días desde la última lectura (o desde la "
    f"instalación si aún no tiene): `al_dia` (menos de {DIAS_REVISION}), `pendiente` (desde "
    f"{DIAS_REVISION}) o `vencida` (desde {DIAS_VENCIDA}). Cualquier rol con el predio asignado.",
    responses={
        401: {"description": "Sin sesión o sesión inválida"},
        404: {"description": "Predio o lote no encontrado (o no asignado al usuario)"},
        422: {"description": "Falta `predio_id` o `lote_id`"},
    },
)
async def obtener_mapa(
    usuario: UsuarioActualDep,
    session: SessionDep,
    predio_id: uuid.UUID | None = None,
    lote_id: uuid.UUID | None = None,
) -> MapaPredio:
    if predio_id is None and lote_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Indique el predio (predio_id) o el lote (lote_id)",
        )
    if lote_id is not None:
        predio_id = (await exigir_lote(session, usuario, lote_id)).predio_id
    predio = await exigir_predio(session, usuario, predio_id)

    consulta_lotes = select(Lote).where(Lote.predio_id == predio.id, Lote.deleted_at.is_(None))
    if lote_id is not None:
        consulta_lotes = consulta_lotes.where(Lote.id == lote_id)
    lotes = (await session.scalars(consulta_lotes.order_by(Lote.codigo))).all()
    codigos = {lote.id: lote.codigo for lote in lotes}
    rutas = {
        ruta.lote_id: ruta
        for ruta in await session.scalars(
            select(Ruta).where(Ruta.lote_id.in_(list(codigos)), Ruta.deleted_at.is_(None))
        )
    }

    trampas = (
        await session.scalars(
            select(Trampa)
            .where(Trampa.lote_id.in_(list(codigos)), Trampa.deleted_at.is_(None))
            .order_by(Trampa.codigo_ica)
        )
    ).all()

    hoy = hoy_bogota()
    resumen = ResumenMonitoreo()
    features: list[FeatureLote | FeatureTrampa] = [
        FeatureLote(
            geometry=a_geojson(lote.geom),
            properties=PropiedadesLote(
                id=lote.id,
                codigo=lote.codigo,
                nombre=lote.nombre,
                area_ha=float(lote.area_ha),
                color=lote.color,
                ruta=(
                    RutaDeLote(
                        id=ruta.id,
                        requiere_revision=ruta.requiere_revision,
                        motivo_revision=ruta.motivo_revision,
                    )
                    if (ruta := rutas.get(lote.id))
                    else None
                ),
            ),
        )
        for lote in lotes
    ]
    for trampa in trampas:
        # Sin lecturas todavía (HU-25): la referencia es la instalación.
        monitoreo, dias = monitoreo_trampa(trampa.estado, trampa.fecha_instalacion, None, hoy)
        if monitoreo is None:
            resumen.no_activas += 1
        else:
            setattr(resumen, monitoreo, getattr(resumen, monitoreo) + 1)
        features.append(
            FeatureTrampa(
                geometry=a_geojson(trampa.geom),
                properties=PropiedadesTrampa(
                    id=trampa.id,
                    lote_id=trampa.lote_id,
                    lote_codigo=codigos[trampa.lote_id],
                    codigo_ica=trampa.codigo_ica,
                    codigo_qr=trampa.codigo_qr,
                    tipo=trampa.tipo,
                    atrayente=trampa.atrayente,
                    estado=trampa.estado,
                    fecha_instalacion=trampa.fecha_instalacion,
                    precision_m=None if trampa.precision_m is None else float(trampa.precision_m),
                    dias_sin_revision=dias,
                    monitoreo=monitoreo,
                ),
            )
        )
    return MapaPredio(
        features=features,
        predio_id=predio.id,
        fecha=hoy,
        umbrales=Umbrales(dias_revision=DIAS_REVISION, dias_vencida=DIAS_VENCIDA),
        resumen=resumen,
    )
