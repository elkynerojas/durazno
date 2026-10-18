"""Plan anual de actividades por semana ISO (HU-21)."""

import uuid
from datetime import date


def semanas_del_anio(anio: int) -> int:
    """52 o 53: el 28 de diciembre siempre cae en la última semana ISO del año."""
    return date(anio, 12, 28).isocalendar().week


def semanas_repetidas(inicio: int, cada: int, hasta: int) -> list[int]:
    """Semanas de una actividad que se repite cada `cada` semanas, de `inicio` a `hasta`."""
    return list(range(inicio, hasta + 1, cada))


def ids_de_serie(serie_id: uuid.UUID, cantidad: int) -> list[uuid.UUID]:
    """Ids deterministas de las actividades de una serie: reenviar la misma serie (mismo `id`)
    no la duplica. La primera usa el id de la serie."""
    return [serie_id, *(uuid.uuid5(serie_id, str(i)) for i in range(1, cantidad))]
