"""Prepara las imágenes del manual (docs/manual/img/) a partir de las capturas del spec.

    docker run --rm -v "$PWD:/repo" -w /repo python:3.13-slim sh -c \
      "pip -q install pillow pypdfium2 && python docs/manual/preparar-imagenes.py"

Entrada: frontend/test-results/manual/ (capturas PNG, logo.png, etiquetas.pdf y reporte-mtd.pdf).
"""

from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image

ORIGEN = Path("frontend/test-results/manual")
DESTINO = Path("docs/manual/img")
# Las capturas del teléfono más altas que esto (proporción alto/ancho) van en dos o más tramos.
PROPORCION_MAXIMA = 2.25


def guardar(imagen: Image.Image, nombre: str, ancho: int) -> None:
    if imagen.width > ancho:
        imagen = imagen.resize((ancho, round(imagen.height * ancho / imagen.width)), Image.LANCZOS)
    imagen.convert("RGB").save(DESTINO / f"{nombre}.jpg", quality=82)


def tramos(nombre: str) -> None:
    imagen = Image.open(DESTINO / f"{nombre}.jpg")
    alto_maximo = int(imagen.width * PROPORCION_MAXIMA)
    if imagen.height <= alto_maximo:
        return
    partes = -(-imagen.height // alto_maximo)
    paso = imagen.height // partes
    for i in range(partes):
        # Un poco de traslape para no cortar una línea de texto por la mitad.
        arriba = max(0, i * paso - 40)
        abajo = min(imagen.height, (i + 1) * paso)
        imagen.crop((0, arriba, imagen.width, abajo)).save(
            DESTINO / f"{nombre}-p{i + 1}.jpg", quality=82
        )


def main() -> None:
    DESTINO.mkdir(parents=True, exist_ok=True)
    for archivo in sorted(ORIGEN.glob("[0-9]*.png")):
        telefono = archivo.stem.startswith("3")
        guardar(Image.open(archivo), archivo.stem, 900 if telefono else 1800)
        if telefono:
            tramos(archivo.stem)
    for pdf, nombre in (("etiquetas.pdf", "23-etiquetas-pdf"), ("reporte-mtd.pdf", "24-reporte-mtd-pdf")):
        pagina = pdfium.PdfDocument(ORIGEN / pdf)[0].render(scale=2).to_pil()
        guardar(pagina, nombre, 900)
    etiquetas = Image.open(DESTINO / "23-etiquetas-pdf.jpg")
    etiquetas.crop((0, 0, etiquetas.width, int(etiquetas.height * 0.52))).save(
        DESTINO / "23-etiquetas-pdf-recorte.jpg", quality=85
    )
    Image.open(ORIGEN / "logo.png").save(DESTINO / "logo.png")
    print(f"Imágenes en {DESTINO}: {len(list(DESTINO.iterdir()))}")


if __name__ == "__main__":
    main()
