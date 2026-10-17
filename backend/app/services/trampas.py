"""Reglas espaciales entre trampas y lotes, resueltas en PostGIS."""

import uuid

from geoalchemy2 import Geometry, WKBElement
from sqlalchemy import func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lote import Lote
from app.models.trampa import Trampa


async def punto_en_lote(session: AsyncSession, lote_id: uuid.UUID, punto: WKBElement) -> bool:
    """`True` si el lote vigente contiene el punto (`ST_Contains`; el borde no cuenta)."""
    return bool(
        await session.scalar(
            select(func.ST_Contains(Lote.geom, literal(punto, Geometry("POINT", srid=4326)))).where(
                Lote.id == lote_id, Lote.deleted_at.is_(None)
            )
        )
    )


async def trampas_fuera(
    session: AsyncSession, lote_id: uuid.UUID, poligono: WKBElement
) -> list[str]:
    """Códigos ICA de las trampas vigentes del lote que quedarían fuera de `poligono`."""
    consulta = (
        select(Trampa.codigo_ica)
        .where(
            Trampa.lote_id == lote_id,
            Trampa.deleted_at.is_(None),
            ~func.ST_Contains(literal(poligono, Geometry("POLYGON", srid=4326)), Trampa.geom),
        )
        .order_by(Trampa.codigo_ica)
    )
    return list(await session.scalars(consulta))
