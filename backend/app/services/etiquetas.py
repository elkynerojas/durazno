"""PDF de etiquetas QR de las trampas de un lote, para imprimir en papel adhesivo."""

import io
from dataclasses import dataclass

from reportlab.lib.colors import Color, black
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import cm
from reportlab.pdfgen.canvas import Canvas

from app.services.qr import crear_qr

# Papel carta con 2 × 4 etiquetas. El margen exterior deja el borde sin imprimir que exigen las
# hojas adhesivas, y la separación entre etiquetas permite cortarlas sin tocar el QR.
MARGEN = 1.5 * cm
SEPARACION = 0.6 * cm
COLUMNAS, FILAS = 2, 4
POR_PAGINA = COLUMNAS * FILAS
# Lado del QR sin su zona de silencio: más de 3 cm para leerlo a 30 cm con un teléfono.
LADO_QR = 3.6 * cm
# Deja alrededor del QR la zona en blanco de 4 módulos (~5 mm) que piden los lectores.
RELLENO = 0.6 * cm
GRIS_GUIA = Color(0.6, 0.6, 0.6)


@dataclass(frozen=True)
class Etiqueta:
    codigo_ica: str
    codigo_qr: str
    lote: str
    tipo: str


def _ajustar_fuente(
    canvas: Canvas, texto: str, fuente: str, tamano: float, ancho: float, minimo: float = 6
) -> float:
    """Reduce el tamaño hasta que el texto quepa en `ancho` (códigos ICA largos)."""
    while tamano > minimo and canvas.stringWidth(texto, fuente, tamano) > ancho:
        tamano -= 0.5
    return tamano


def _encabezado(canvas: Canvas, predio: str, fuente: str, tamano: float, ancho: float) -> str:
    """«PREDIO · PNMF» en el ancho de la etiqueta: si aun con la letra mínima no cabe, se recorta
    el nombre del predio con «…» y se conserva «· PNMF»."""
    sufijo = " · PNMF"
    nombre = predio.upper()
    if canvas.stringWidth(nombre + sufijo, fuente, tamano) <= ancho:
        return nombre + sufijo
    while nombre and canvas.stringWidth(nombre.rstrip() + "…" + sufijo, fuente, tamano) > ancho:
        nombre = nombre[:-1]
    return nombre.rstrip() + "…" + sufijo


def _dibujar_qr(canvas: Canvas, codigo: str, x: float, y: float) -> None:
    # Módulos como rectángulos vectoriales: nítidos a cualquier resolución de impresora.
    matriz = crear_qr(codigo).matrix
    modulo = LADO_QR / len(matriz)
    canvas.setFillColor(black)
    for fila, valores in enumerate(matriz):
        columna = 0
        while columna < len(valores):
            if not valores[columna]:
                columna += 1
                continue
            inicio = columna
            while columna < len(valores) and valores[columna]:
                columna += 1
            canvas.rect(
                x + inicio * modulo,
                y + LADO_QR - (fila + 1) * modulo,
                (columna - inicio) * modulo,
                modulo,
                stroke=0,
                fill=1,
            )


def _dibujar_etiqueta(
    canvas: Canvas, etiqueta: Etiqueta, predio: str, x: float, y: float, ancho: float, alto: float
) -> None:
    canvas.setStrokeColor(GRIS_GUIA)
    canvas.setLineWidth(0.5)
    canvas.setDash(3, 3)
    canvas.rect(x, y, ancho, alto, stroke=1, fill=0)
    canvas.setDash()

    _dibujar_qr(canvas, etiqueta.codigo_qr, x + RELLENO, y + (alto - LADO_QR) / 2)

    texto_x = x + RELLENO * 2 + LADO_QR
    texto_ancho = x + ancho - RELLENO - texto_x
    arriba = y + alto - RELLENO

    canvas.setFillColor(GRIS_GUIA)
    encabezado = f"{predio} · PNMF".upper()
    tamano = _ajustar_fuente(canvas, encabezado, "Helvetica-Bold", 6.5, texto_ancho, minimo=5)
    canvas.setFont("Helvetica-Bold", tamano)
    canvas.drawString(
        texto_x,
        arriba - 0.3 * cm,
        _encabezado(canvas, predio, "Helvetica-Bold", tamano, texto_ancho),
    )

    canvas.setFillColor(black)
    tamano = _ajustar_fuente(canvas, etiqueta.codigo_ica, "Courier-Bold", 15, texto_ancho, minimo=5)
    canvas.setFont("Courier-Bold", tamano)
    canvas.drawString(texto_x, arriba - 1.2 * cm, etiqueta.codigo_ica)

    texto_lote = f"Lote {etiqueta.lote}"
    canvas.setFont("Helvetica", _ajustar_fuente(canvas, texto_lote, "Helvetica", 9, texto_ancho))
    canvas.drawString(texto_x, arriba - 1.9 * cm, texto_lote)
    tamano = _ajustar_fuente(canvas, etiqueta.tipo, "Helvetica", 9, texto_ancho)
    canvas.setFont("Helvetica", tamano)
    canvas.drawString(texto_x, arriba - 2.4 * cm, etiqueta.tipo)

    # Para escribirlo a mano si el QR se daña (página /t/<código>).
    canvas.setFont("Helvetica", 7)
    canvas.drawString(texto_x, y + RELLENO + 0.45 * cm, "Código de la etiqueta")
    canvas.setFont("Courier-Bold", 11)
    canvas.drawString(texto_x, y + RELLENO, etiqueta.codigo_qr)


def generar_pdf(etiquetas: list[Etiqueta], predio: str, lote: str) -> bytes:
    """PDF carta con 8 etiquetas por hoja, en el orden recibido."""
    ancho_pagina, alto_pagina = letter
    ancho = (ancho_pagina - 2 * MARGEN - (COLUMNAS - 1) * SEPARACION) / COLUMNAS
    alto = (alto_pagina - 2 * MARGEN - (FILAS - 1) * SEPARACION) / FILAS
    paginas = max(1, -(-len(etiquetas) // POR_PAGINA))

    salida = io.BytesIO()
    canvas = Canvas(salida, pagesize=letter, pageCompression=1)
    canvas.setTitle(f"Etiquetas QR · lote {lote}")
    canvas.setAuthor("PERSICA")
    for pagina in range(paginas):
        lote_pagina = etiquetas[pagina * POR_PAGINA : (pagina + 1) * POR_PAGINA]
        for i, etiqueta in enumerate(lote_pagina):
            fila, columna = divmod(i, COLUMNAS)
            x = MARGEN + columna * (ancho + SEPARACION)
            y = alto_pagina - MARGEN - (fila + 1) * alto - fila * SEPARACION
            _dibujar_etiqueta(canvas, etiqueta, predio, x, y, ancho, alto)
        canvas.setFillColor(GRIS_GUIA)
        canvas.setFont("Helvetica", 7)
        canvas.drawCentredString(
            ancho_pagina / 2,
            MARGEN / 2,
            f"Lote {lote} · hoja {pagina + 1} de {paginas} · recorte por las líneas punteadas",
        )
        canvas.showPage()
    canvas.save()
    return salida.getvalue()
