"""Validaciones geoespaciales que se resuelven en PostGIS."""

from geoalchemy2 import WKBElement
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


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
