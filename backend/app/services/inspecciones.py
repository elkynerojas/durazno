"""Reglas del módulo Inspección (E9) sin HTTP."""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

ZONA = ZoneInfo("America/Bogota")
MAX_EVIDENCIAS = 6


def rango_bogota(desde: date | None, hasta: date | None) -> tuple[datetime | None, datetime | None]:
    """Límites `[inicio, fin)` en hora de Bogotá para filtrar por días completos."""
    inicio = datetime.combine(desde, time.min, ZONA) if desde else None
    fin = datetime.combine(hasta + timedelta(days=1), time.min, ZONA) if hasta else None
    return inicio, fin
