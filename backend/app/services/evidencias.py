"""Fotos de evidencia de los hallazgos (HU-41): validar, reducir y guardar sin metadatos.

Funciones síncronas (Pillow y disco): los endpoints las llaman con `run_in_threadpool`.
"""

import io
import os
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_BYTES = 8 * 1024 * 1024
FORMATOS = {"JPEG", "PNG", "WEBP"}
LADO_MAXIMO = 1920
LADO_MINIATURA = 400
CALIDAD = 82
# Evita bombas de descompresión: una foto de teléfono ronda los 50 megapíxeles como mucho. Pillow
# solo avisa entre 1× y 2× este límite, por eso también se rechaza antes de decodificar.
Image.MAX_IMAGE_PIXELS = 80_000_000


class ImagenInvalida(ValueError):
    """El archivo no es una imagen JPEG, PNG o WebP legible."""


@dataclass(frozen=True)
class FotoGuardada:
    archivo: str
    ancho: int
    alto: int
    bytes: int


def ruta_archivo(directorio: str, archivo: str, miniatura: bool = False) -> Path:
    ruta = Path(directorio) / archivo
    return ruta.with_name(f"{ruta.stem}_min{ruta.suffix}") if miniatura else ruta


def _a_jpeg(imagen: Image.Image, lado: int) -> bytes:
    copia = imagen.copy()
    copia.thumbnail((lado, lado), Image.Resampling.LANCZOS)
    salida = io.BytesIO()
    # Sin `exif=`: Pillow no copia los metadatos (ni el GPS del teléfono) al guardar.
    copia.save(salida, "JPEG", quality=CALIDAD, optimize=True)
    return salida.getvalue()


def _escribir(ruta: Path, contenido: bytes) -> None:
    """Escritura atómica: un temporal en la misma carpeta y luego `os.replace`."""
    ruta.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporal = tempfile.mkstemp(dir=ruta.parent, suffix=".tmp")
    try:
        with os.fdopen(descriptor, "wb") as archivo:
            archivo.write(contenido)
        os.replace(temporal, ruta)
    except BaseException:
        Path(temporal).unlink(missing_ok=True)
        raise


def procesar_y_guardar(
    contenido: bytes, directorio: str, hallazgo_id: uuid.UUID, evidencia_id: uuid.UUID
) -> FotoGuardada:
    """Reduce la foto a `LADO_MAXIMO`, la endereza según el EXIF y la guarda en JPEG sin
    metadatos, con una miniatura de `LADO_MINIATURA`. El tipo se valida abriendo la imagen."""
    try:
        with Image.open(io.BytesIO(contenido)) as original:
            if original.format not in FORMATOS:
                raise ImagenInvalida
            if original.width * original.height > Image.MAX_IMAGE_PIXELS:
                raise ImagenInvalida
            original.load()
            imagen = ImageOps.exif_transpose(original).convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, SyntaxError) as e:
        raise ImagenInvalida from e

    foto = _a_jpeg(imagen, LADO_MAXIMO)
    miniatura = _a_jpeg(imagen, LADO_MINIATURA)
    archivo = f"{hallazgo_id}/{evidencia_id}.jpg"
    _escribir(ruta_archivo(directorio, archivo), foto)
    _escribir(ruta_archivo(directorio, archivo, miniatura=True), miniatura)
    with Image.open(io.BytesIO(foto)) as guardada:
        ancho, alto = guardada.size
    return FotoGuardada(archivo=archivo, ancho=ancho, alto=alto, bytes=len(foto))


def borrar(directorio: str, archivo: str) -> None:
    """Quita la foto y su miniatura (cuando no se pudo registrar la evidencia)."""
    for miniatura in (False, True):
        ruta_archivo(directorio, archivo, miniatura=miniatura).unlink(missing_ok=True)
