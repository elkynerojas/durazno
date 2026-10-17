"""Cálculos espaciales de los lotes en PostGIS: área geodésica y traslapes."""

import uuid
from dataclasses import dataclass
from decimal import Decimal

from geoalchemy2 import Geography, Geometry, WKBElement
from sqlalchemy import Numeric, cast, func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lote import Lote

# Área común mínima para avisar de un traslape: ignora vértices compartidos dibujados a mano.
UMBRAL_TRASLAPE_M2 = 1.0


@dataclass(frozen=True)
class Traslape:
    id: uuid.UUID
    codigo: str
    area_m2: float


def _poligono(geometria: WKBElement):
    return literal(geometria, Geometry("POLYGON", srid=4326))


async def calcular_area_ha(session: AsyncSession, geometria: WKBElement) -> Decimal:
    """Área geodésica en hectáreas, redondeada a dos decimales."""
    area_m2 = func.ST_Area(cast(_poligono(geometria), Geography))
    return await session.scalar(select(func.round(cast(area_m2 / 10000, Numeric), 2)))


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
    poligono = _poligono(geometria)
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
