import json
import re
import uuid

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import func, select

from app.api.deps import SessionDep, UsuarioActualDep
from app.models.lote import Lote
from app.models.predio import Predio
from app.models.trampa import Trampa
from app.services.exportar import LoteExportado, TrampaExportada, a_geojson, a_kml

router = APIRouter(prefix="/export", tags=["exportar"])

# 7 decimales ≈ 1 cm: más que suficiente para trampas ubicadas con GPS de teléfono.
DECIMALES = 7
RESPUESTAS = {
    401: {"description": "Sin sesión o sesión inválida"},
    404: {"description": "Lote no encontrado"},
}


async def _datos(
    session: SessionDep, lote_id: uuid.UUID | None
) -> tuple[list[LoteExportado], list[TrampaExportada], str]:
    consulta_lotes = select(
        Lote.id,
        Lote.codigo,
        Lote.nombre,
        Lote.area_ha,
        func.ST_AsGeoJSON(Lote.geom, DECIMALES),
        func.ST_AsKML(Lote.geom, DECIMALES),
    ).where(Lote.deleted_at.is_(None))
    if lote_id is not None:
        consulta_lotes = consulta_lotes.where(Lote.id == lote_id)
    filas = (await session.execute(consulta_lotes.order_by(Lote.codigo))).all()
    if lote_id is not None and not filas:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lote no encontrado")
    lotes = [LoteExportado(str(f[0]), f[1], f[2], float(f[3]), f[4], f[5]) for f in filas]

    consulta_trampas = (
        select(
            Trampa.id,
            Trampa.codigo_ica,
            Trampa.codigo_qr,
            Trampa.tipo,
            Trampa.atrayente,
            Trampa.estado,
            Trampa.fecha_instalacion,
            Trampa.precision_m,
            Lote.codigo,
            func.ST_AsGeoJSON(Trampa.geom, DECIMALES),
            func.ST_AsKML(Trampa.geom, DECIMALES),
        )
        .join(Lote, Lote.id == Trampa.lote_id)
        .where(Trampa.deleted_at.is_(None), Lote.deleted_at.is_(None))
        .order_by(Trampa.codigo_ica)
    )
    if lote_id is not None:
        consulta_trampas = consulta_trampas.where(Trampa.lote_id == lote_id)
    trampas = [
        TrampaExportada(
            str(f[0]),
            f[1],
            f[2],
            f[3],
            f[4],
            f[5],
            f[6].isoformat(),
            None if f[7] is None else float(f[7]),
            f[8],
            f[9],
            f[10],
        )
        for f in await session.execute(consulta_trampas)
    ]

    predio = await session.scalar(select(Predio.nombre).where(Predio.deleted_at.is_(None)))
    nombre = predio or "predio"
    titulo = f"{nombre} · lote {lotes[0].codigo}" if lote_id is not None else nombre
    return lotes, trampas, titulo


def _archivo(titulo: str, extension: str) -> str:
    # El nombre lo arma el usuario (predio y lote): solo caracteres seguros.
    base = re.sub(r"[^A-Za-z0-9_-]+", "-", titulo.replace(" · ", "_")).strip("-")
    return f"{base or 'predio'}.{extension}"


@router.get(
    "/geojson",
    summary="Exportar lotes y trampas en GeoJSON",
    description="FeatureCollection RFC 7946 (WGS 84, `[longitud, latitud]`) con los lotes "
    "(polígonos) y las trampas (puntos) vigentes y sus propiedades; `properties.elemento` "
    "distingue `lote` de `trampa`. Con `lote_id`, solo ese lote y sus trampas.",
    response_class=Response,
    responses={200: {"content": {"application/geo+json": {}}}, **RESPUESTAS},
)
async def exportar_geojson(
    _usuario: UsuarioActualDep, session: SessionDep, lote_id: uuid.UUID | None = None
) -> Response:
    lotes, trampas, titulo = await _datos(session, lote_id)
    return Response(
        content=json.dumps(a_geojson(lotes, trampas), ensure_ascii=False),
        media_type="application/geo+json",
        headers={"Content-Disposition": f'attachment; filename="{_archivo(titulo, "geojson")}"'},
    )


@router.get(
    "/kml",
    summary="Exportar lotes y trampas en KML",
    description="Documento KML 2.2 para Google Earth con una carpeta de lotes y otra de "
    "trampas (estilo por tipo). Con `lote_id`, solo ese lote y sus trampas.",
    response_class=Response,
    responses={200: {"content": {"application/vnd.google-earth.kml+xml": {}}}, **RESPUESTAS},
)
async def exportar_kml(
    _usuario: UsuarioActualDep, session: SessionDep, lote_id: uuid.UUID | None = None
) -> Response:
    lotes, trampas, titulo = await _datos(session, lote_id)
    return Response(
        content=a_kml(lotes, trampas, titulo),
        media_type="application/vnd.google-earth.kml+xml",
        headers={"Content-Disposition": f'attachment; filename="{_archivo(titulo, "kml")}"'},
    )
