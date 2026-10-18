"""Índice MTD (moscas/trampa/día) del Manual Técnico de Trampeo del ICA (HU-28).

    MTD = M / (T × D)

M = moscas de la especie capturadas en el periodo; T = trampas revisadas en el periodo; D = días
promedio de exposición por trampa revisada. Se calcula por especie con su tipo de trampa
(*C. capitata* en Jackson, *Anastrepha* en McPhail) y nunca se mezclan. Funciones puras: las
lecturas llegan ya filtradas (vigentes y no rechazadas).
"""

import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

Especie = Literal["capitata", "anastrepha"]
# Tipo de trampa que vigila cada especie.
TRAMPA_DE = {"capitata": "jackson", "anastrepha": "mcphail"}


def calcular_mtd(moscas: int, trampas: int, dias_promedio: float) -> float | None:
    """M / (T × D); `None` si T × D = 0 (el MTD no está definido: nunca se divide por cero)."""
    denominador = trampas * dias_promedio
    if denominador == 0:
        return None
    return moscas / denominador


@dataclass(frozen=True)
class LecturaMtd:
    trampa_id: uuid.UUID
    tipo_trampa: str
    fecha: date
    capitata: int
    anastrepha: int
    dias_exposicion: int
    validada: bool


@dataclass(frozen=True)
class FilaMtd:
    especie: Especie
    anio: int
    semana: int
    moscas: int
    trampas: int
    dias_promedio: float
    mtd: float | None
    pendientes: int  # lecturas usadas que aún no se validan (HU-26)


def resumir(
    especie: Especie, lecturas: list[LecturaMtd], anio: int = 0, semana: int = 0
) -> FilaMtd:
    """M, T, D y MTD de una especie con las lecturas de su tipo de trampa en el periodo."""
    propias = [lec for lec in lecturas if lec.tipo_trampa == TRAMPA_DE[especie]]
    moscas = sum(getattr(lec, especie) for lec in propias)
    trampas = len({lec.trampa_id for lec in propias})
    # D: días de exposición por trampa revisada. Si una trampa se leyó dos veces en el periodo,
    # sus días se suman: T × D son los trampa-días reales.
    dias_promedio = sum(lec.dias_exposicion for lec in propias) / trampas if trampas else 0.0
    return FilaMtd(
        especie=especie,
        anio=anio,
        semana=semana,
        moscas=moscas,
        trampas=trampas,
        dias_promedio=dias_promedio,
        mtd=calcular_mtd(moscas, trampas, dias_promedio),
        pendientes=sum(1 for lec in propias if not lec.validada),
    )


def semanas_entre(desde: date, hasta: date) -> list[tuple[int, int]]:
    """Semanas ISO (año, número) que tocan el rango, en orden; respeta los años de 53 semanas."""
    semanas, dia = [], desde - timedelta(days=desde.isoweekday() - 1)
    while dia <= hasta:
        iso = dia.isocalendar()
        semanas.append((iso.year, iso.week))
        dia += timedelta(days=7)
    return semanas


def mtd_por_semana(
    lecturas: Iterable[LecturaMtd], desde: date, hasta: date, especies: Iterable[Especie]
) -> list[FilaMtd]:
    """Una fila por especie y semana ISO del rango, también las semanas sin lecturas (sin dato)."""
    por_semana: dict[tuple[int, int], list[LecturaMtd]] = {}
    for lectura in lecturas:
        iso = lectura.fecha.isocalendar()
        por_semana.setdefault((iso.year, iso.week), []).append(lectura)
    return [
        resumir(especie, por_semana.get((anio, semana), []), anio, semana)
        for especie in especies
        for anio, semana in semanas_entre(desde, hasta)
    ]
