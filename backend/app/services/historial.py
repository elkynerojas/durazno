"""Historial de capturas (HU-27): filas para la tabla y el CSV."""

import csv
import io
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime

from app.services.monitoreo import ZONA


@dataclass(frozen=True)
class FilaHistorial:
    observado_en: datetime
    lote_codigo: str
    trampa_codigo_ica: str
    tipo: str
    capitata_machos: int
    capitata_hembras: int
    anastrepha: int
    dias_exposicion: int
    estado: str


def mtd_de_la_lectura(fila: FilaHistorial) -> float | None:
    """MTD de una trampa en una lectura: moscas de la especie que vigila ÷ (1 × días). `None` si
    no hubo días de exposición."""
    if fila.dias_exposicion == 0:
        return None
    moscas = (
        fila.capitata_machos + fila.capitata_hembras if fila.tipo == "jackson" else fila.anastrepha
    )
    return moscas / fila.dias_exposicion


def _decimal(valor: float | None) -> str:
    # Excel en español espera coma decimal.
    return "" if valor is None else f"{valor:.4f}".replace(".", ",")


ENCABEZADO = [
    "Fecha y hora",
    "Lote",
    "Trampa (código ICA)",
    "Tipo",
    "C. capitata machos",
    "C. capitata hembras",
    "Anastrepha spp.",
    "Días de exposición",
    "MTD de la trampa",
    "Estado de la lectura",
]


def a_csv(filas: Iterable[FilaHistorial]) -> str:
    """CSV para Excel en español: separador «;», coma decimal y BOM UTF-8 (tildes). Sin datos
    personales del personal (Ley 1581)."""
    salida = io.StringIO()
    salida.write("﻿")
    escritor = csv.writer(salida, delimiter=";", lineterminator="\r\n")
    escritor.writerow(ENCABEZADO)
    for f in filas:
        escritor.writerow(
            [
                f.observado_en.astimezone(ZONA).strftime("%d/%m/%Y %H:%M"),
                f.lote_codigo,
                f.trampa_codigo_ica,
                "Jackson" if f.tipo == "jackson" else "McPhail",
                f.capitata_machos,
                f.capitata_hembras,
                f.anastrepha,
                f.dias_exposicion,
                _decimal(mtd_de_la_lectura(f)),
                f.estado,
            ]
        )
    return salida.getvalue()


def nombre_archivo(ambito: str, desde: date, hasta: date) -> str:
    seguro = "".join(c if c.isalnum() or c in "-_" else "-" for c in ambito).strip("-")
    return f"historial-{seguro or 'predio'}-{desde:%Y%m%d}-{hasta:%Y%m%d}.csv"
