"""Reglas de la sincronización con la app móvil (HU-32), sin HTTP ni base de datos."""

from datetime import datetime, timedelta
from typing import Literal

# `updated_at` toma la hora de inicio de su transacción: un cambio que se confirma después de una
# sincronización puede quedar con una hora anterior a ella. El traslape lo recoge en la siguiente.
TRASLAPE = timedelta(minutes=5)
# Lecturas que viajan a la app: las de los últimos días (el historial completo es en línea).
DIAS_LECTURAS = 60

Clase = Literal["creado", "modificado", "borrado"]


def clasificar(
    creado_en: datetime, borrado_en: datetime | None, desde: datetime | None
) -> Clase | None:
    """Qué es una fila para un cliente que sincronizó por última vez en `desde` (`None`: carga
    completa, donde las borradas no viajan). Una borrada se informa aunque se haya creado después
    de `desde`: por el traslape, el cliente pudo recibirla; descartar un id que no tiene no hace
    daño."""
    if borrado_en is not None:
        return None if desde is None else "borrado"
    if desde is None or creado_en > desde:
        return "creado"
    return "modificado"


def siguiente_desde(servidor_en: datetime) -> datetime:
    return servidor_en - TRASLAPE
