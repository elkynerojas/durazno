"""Estado de monitoreo de una trampa según los días desde su última revisión (HU-18).

Mientras no existan lecturas (HU-25), la referencia es la fecha de instalación.
"""

from datetime import date, datetime
from typing import Literal
from zoneinfo import ZoneInfo

ZONA = ZoneInfo("America/Bogota")
# Revisión semanal de las trampas (Manual Técnico de Trampeo del ICA). Umbrales provisionales:
# acordarlos con el agrónomo de Icota.
DIAS_REVISION = 7
DIAS_VENCIDA = 14

EstadoMonitoreo = Literal["al_dia", "pendiente", "vencida"]


def hoy_bogota() -> date:
    return datetime.now(ZONA).date()


def estado_monitoreo(dias: int) -> EstadoMonitoreo:
    """Al día antes de cumplir la semana, pendiente en la semana de revisión, vencida después."""
    if dias < DIAS_REVISION:
        return "al_dia"
    if dias < DIAS_VENCIDA:
        return "pendiente"
    return "vencida"


def monitoreo_trampa(
    estado_trampa: str, fecha_instalacion: date, ultima_lectura: date | None, hoy: date
) -> tuple[EstadoMonitoreo | None, int | None]:
    """Estado de monitoreo y días sin revisión; solo las trampas activas se monitorean."""
    if estado_trampa != "activa":
        return None, None
    referencia = ultima_lectura or fecha_instalacion
    dias = max(0, (hoy - referencia).days)
    return estado_monitoreo(dias), dias
