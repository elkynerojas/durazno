"""Validaciones geoespaciales que se resuelven en PostGIS."""

from decimal import Decimal

from geoalchemy2 import Geography, Geometry, WKBElement
from sqlalchemy import Numeric, cast, func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

# Área mínima que se considera al comparar polígonos dibujados a mano (traslapes entre lotes o lote
# por fuera del límite del predio): ignora vértices y bordes que no coinciden por centímetros.
UMBRAL_M2 = 1.0


def como_poligono(geometria: WKBElement):
    return literal(geometria, Geometry("POLYGON", srid=4326))


async def calcular_area_ha(session: AsyncSession, geometria: WKBElement) -> Decimal:
    """Área geodésica en hectáreas, redondeada a dos decimales."""
    area_m2 = func.ST_Area(cast(como_poligono(geometria), Geography))
    return await session.scalar(select(func.round(cast(area_m2 / 10000, Numeric), 2)))


async def area_fuera_m2(session: AsyncSession, geometria, limite) -> float:
    """Metros cuadrados de `geometria` que quedan por fuera de `limite` (geodésico)."""
    diferencia = func.ST_CollectionExtract(func.ST_Difference(geometria, limite), 3)
    return float(await session.scalar(select(func.ST_Area(cast(diferencia, Geography)))) or 0)


async def motivo_invalidez(session: AsyncSession, geometria: WKBElement) -> str | None:
    """Mensaje en español si `ST_IsValid` rechaza la geometría, o `None` si es válida."""
    valida, motivo = (
        await session.execute(select(func.ST_IsValid(geometria), func.ST_IsValidReason(geometria)))
    ).one()
    if valida:
        return None
    if motivo.startswith(("Self-intersection", "Ring Self-intersection")):
        return "El polígono no es válido: sus bordes se cruzan entre sí"
    return f"El polígono no es válido ({motivo})"
