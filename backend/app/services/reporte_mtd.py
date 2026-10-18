"""Reporte del MTD para el ICA (HU-29): consolidado semanal del predio en CSV y PDF.

Formato provisional mientras se acuerda el del convenio con el ICA: por especie y semana ISO,
M, T, D, MTD y lecturas sin validar, más el consolidado del periodo. Sin datos personales del
personal (Ley 1581).
"""

import csv
import io
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.services.historial import celda_segura, decimal_es
from app.services.monitoreo import ZONA
from app.services.mtd import TRAMPA_DE, Especie, FilaMtd

NOMBRE_ESPECIE = {"capitata": "Ceratitis capitata", "anastrepha": "Anastrepha spp."}
TRAMPA_ESPECIE = {"jackson": "Jackson + trimedlure", "mcphail": "McPhail + proteína hidrolizada"}


@dataclass(frozen=True)
class DatosReporte:
    predio: str
    registro_ica: str | None
    vereda: str
    municipio: str
    desde: date
    hasta: date
    generado_en: datetime


def fechas_semana(fila: FilaMtd, desde: date, hasta: date) -> tuple[date, date]:
    """Días de la semana ISO que caen en el periodo: la primera y la última pueden ir recortadas."""
    lunes = date.fromisocalendar(fila.anio, fila.semana, 1)
    domingo = date.fromisocalendar(fila.anio, fila.semana, 7)
    return max(lunes, desde), min(domingo, hasta)


def _dias(valor: float) -> str:
    return f"{valor:.2f}".replace(".", ",")


ENCABEZADO_CSV = [
    "Predio",
    "Registro ICA",
    "Municipio",
    "Vereda",
    "Año",
    "Semana",
    "Desde",
    "Hasta",
    "Especie",
    "Trampa y atrayente",
    "M (moscas)",
    "T (trampas revisadas)",
    "D (días promedio)",
    "MTD",
    "Lecturas sin validar",
]


def a_csv(datos: DatosReporte, semanas: Iterable[FilaMtd]) -> str:
    """Una fila por especie y semana, para Excel en español (como el CSV del historial): «;»,
    coma decimal y BOM UTF-8. El MTD va vacío si T × D = 0 (sin dato)."""
    salida = io.StringIO()
    salida.write("﻿")
    escritor = csv.writer(salida, delimiter=";", lineterminator="\r\n")
    escritor.writerow(ENCABEZADO_CSV)
    for f in semanas:
        inicio, fin = fechas_semana(f, datos.desde, datos.hasta)
        escritor.writerow(
            [
                celda_segura(datos.predio),
                celda_segura(datos.registro_ica or ""),
                celda_segura(datos.municipio),
                celda_segura(datos.vereda),
                f.anio,
                f.semana,
                f"{inicio:%d/%m/%Y}",
                f"{fin:%d/%m/%Y}",
                NOMBRE_ESPECIE[f.especie],
                TRAMPA_ESPECIE[TRAMPA_DE[f.especie]],
                f.moscas,
                f.trampas,
                _dias(f.dias_promedio),
                decimal_es(f.mtd),
                f.pendientes,
            ]
        )
    return salida.getvalue()


def _mtd_pdf(fila: FilaMtd) -> str:
    return "sin dato" if fila.mtd is None else decimal_es(fila.mtd)


GRIS = colors.Color(0.93, 0.93, 0.93)
ESTILO_TABLA = TableStyle(
    [
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8),
        ("FONT", (0, 1), (-1, -1), "Helvetica", 8),
        ("BACKGROUND", (0, 0), (-1, 0), GRIS),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]
)


def a_pdf(datos: DatosReporte, semanas: list[FilaMtd], periodo: list[FilaMtd]) -> bytes:
    """Carta vertical: encabezado del predio, consolidado del periodo y, por especie, la tabla
    semanal. Las semanas sin lecturas se muestran «sin dato»."""
    estilos = getSampleStyleSheet()
    salida = io.BytesIO()
    documento = SimpleDocTemplate(
        salida,
        pagesize=letter,
        leftMargin=1.8 * cm,
        rightMargin=1.8 * cm,
        topMargin=1.6 * cm,
        bottomMargin=1.6 * cm,
        title=f"Reporte MTD {datos.predio}",
        author="Durazno Icota",
    )
    celda = ParagraphStyle("celda", parent=estilos["BodyText"], fontSize=8, leading=10)
    # Los textos del predio van escapados: el Paragraph de reportlab interpreta marcado.
    registro = f" · Registro ICA {escape(datos.registro_ica)}" if datos.registro_ica else ""
    partes = [
        Paragraph("Reporte del índice MTD (moscas/trampa/día)", estilos["Title"]),
        Paragraph(
            f"<b>{escape(datos.predio)}</b>{registro}<br/>Vereda {escape(datos.vereda)}, "
            f"{escape(datos.municipio)}<br/>"
            f"Periodo: {datos.desde:%d/%m/%Y} a {datos.hasta:%d/%m/%Y} · Generado el "
            f"{datos.generado_en.astimezone(ZONA):%d/%m/%Y %H:%M}",
            estilos["Normal"],
        ),
        Spacer(1, 0.3 * cm),
        Paragraph(
            "MTD = M ÷ (T × D). M: moscas de la especie capturadas; T: trampas revisadas; "
            "D: días promedio de exposición por trampa revisada (Manual Técnico de Trampeo, ICA). "
            "Consolidado del predio por especie, sin lecturas rechazadas.",
            estilos["BodyText"],
        ),
        Spacer(1, 0.3 * cm),
        Paragraph("Consolidado del periodo", estilos["Heading2"]),
        _tabla(
            ["Especie", "Trampa", "M", "T", "D", "MTD", "Sin validar"],
            [
                [
                    Paragraph(f"<i>{NOMBRE_ESPECIE[f.especie]}</i>", celda),
                    TRAMPA_ESPECIE[TRAMPA_DE[f.especie]],
                    f.moscas,
                    f.trampas,
                    _dias(f.dias_promedio),
                    _mtd_pdf(f),
                    f.pendientes,
                ]
                for f in periodo
            ],
            [4 * cm, 4.6 * cm, 1.4 * cm, 1.4 * cm, 1.6 * cm, 2 * cm, 1.9 * cm],
        ),
    ]
    especies: list[Especie] = [f.especie for f in periodo]
    for especie in especies:
        filas = [f for f in semanas if f.especie == especie]
        partes += [
            Spacer(1, 0.4 * cm),
            Paragraph(f"<i>{NOMBRE_ESPECIE[especie]}</i> por semana", estilos["Heading2"]),
            _tabla(
                ["Semana", "Fechas", "M", "T", "D", "MTD", "Sin validar"],
                [
                    [
                        f"{f.anio}-S{f.semana:02d}",
                        "{:%d/%m} a {:%d/%m/%Y}".format(
                            *fechas_semana(f, datos.desde, datos.hasta)
                        ),
                        f.moscas,
                        f.trampas,
                        _dias(f.dias_promedio),
                        _mtd_pdf(f),
                        f.pendientes,
                    ]
                    for f in filas
                ],
                [2.2 * cm, 4.4 * cm, 1.6 * cm, 1.6 * cm, 1.8 * cm, 2.4 * cm, 2.4 * cm],
            ),
        ]
    pendientes = sum(f.pendientes for f in periodo)
    if pendientes:
        partes += [
            Spacer(1, 0.3 * cm),
            Paragraph(
                f"Incluye {pendientes} {'lectura' if pendientes == 1 else 'lecturas'} sin validar "
                "por el agrónomo.",
                estilos["Italic"],
            ),
        ]
    documento.build(partes, onFirstPage=_pie, onLaterPages=_pie)
    return salida.getvalue()


def _pie(canvas: Canvas, documento: SimpleDocTemplate) -> None:
    canvas.setFont("Helvetica", 7)
    canvas.drawRightString(
        documento.pagesize[0] - documento.rightMargin, 1 * cm, f"Página {documento.page}"
    )


def _tabla(encabezado: list[str], filas: list[list], anchos: list[float]) -> Table:
    tabla = Table([encabezado, *filas], colWidths=anchos, repeatRows=1)
    tabla.setStyle(ESTILO_TABLA)
    return tabla


def nombre_archivo(predio: str, desde: date, hasta: date, extension: str) -> str:
    seguro = "".join(c if c.isascii() and c.isalnum() else "-" for c in predio).strip("-")
    return f"mtd-{seguro or 'predio'}-{desde:%Y%m%d}-{hasta:%Y%m%d}.{extension}"
