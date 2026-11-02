"""Reglas del módulo Inspección (E9) sin HTTP."""

from collections.abc import Iterable
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

ZONA = ZoneInfo("America/Bogota")
MAX_EVIDENCIAS = 6
PENDIENTES = {"programada", "reprogramada", "vencida"}


def rango_bogota(desde: date | None, hasta: date | None) -> tuple[datetime | None, datetime | None]:
    """Límites `[inicio, fin)` en hora de Bogotá para filtrar por días completos."""
    inicio = datetime.combine(desde, time.min, ZONA) if desde else None
    fin = datetime.combine(hasta + timedelta(days=1), time.min, ZONA) if hasta else None
    return inicio, fin


def estado_hallazgo(estados: Iterable[str]) -> tuple[str, bool]:
    """Estado de un hallazgo (HU-42) a partir de los estados calculados de sus actividades de
    atención en el plan: `atendido` si alguna se cumplió, `en_atencion` si alguna está pendiente
    y `abierto` si no tiene (o todas se cancelaron). El segundo valor indica que la atención
    pendiente ya está vencida (su semana pasó)."""
    estados = set(estados)
    if "cumplida" in estados:
        return "atendido", False
    if pendientes := estados & PENDIENTES:
        return "en_atencion", pendientes == {"vencida"}
    return "abierto", False
