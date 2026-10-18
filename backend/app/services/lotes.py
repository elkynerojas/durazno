"""Cálculos espaciales de los lotes en PostGIS: traslapes (el área está en services/geo.py)."""

import uuid
from dataclasses import dataclass

from geoalchemy2 import Geography, WKBElement
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lote import Lote
from app.services.geo import UMBRAL_M2, como_poligono

# Área común mínima para avisar de un traslape (ver UMBRAL_M2 en services/geo.py).
UMBRAL_TRASLAPE_M2 = UMBRAL_M2


@dataclass(frozen=True)
class Traslape:
    id: uuid.UUID
    codigo: str
    area_m2: float


async def lotes_traslapados(
    session: AsyncSession,
    geometria: WKBElement,
    excluir_id: uuid.UUID | None = None,
    predio_id: uuid.UUID | None = None,
) -> list[Traslape]:
    """Lotes vigentes cuyo interior comparte más de `UMBRAL_TRASLAPE_M2` con `geometria`.

    `geometria` debe ser válida (ST_Intersection falla con polígonos inválidos). Un borde
    compartido no cuenta: su intersección es una línea, sin área.
    """
    poligono = como_poligono(geometria)
    area_comun = func.ST_Area(
        cast(func.ST_CollectionExtract(func.ST_Intersection(Lote.geom, poligono), 3), Geography)
    )
    consulta = (
        select(Lote.id, Lote.codigo, area_comun.label("area_m2"))
        .where(
            Lote.deleted_at.is_(None),
            func.ST_Intersects(Lote.geom, poligono),
            area_comun > UMBRAL_TRASLAPE_M2,
        )
        .order_by(Lote.codigo)
    )
    if excluir_id is not None:
        consulta = consulta.where(Lote.id != excluir_id)
    # Los lotes de otro predio no cuentan como traslape.
    if predio_id is not None:
        consulta = consulta.where(Lote.predio_id == predio_id)
    return [Traslape(f.id, f.codigo, f.area_m2) for f in await session.execute(consulta)]
