"""Códigos cortos de las trampas y sus imágenes QR (segno)."""

import io
import secrets

import segno

from app.core.config import get_settings

# Sin caracteres que se confunden al leerlos o escribirlos a mano: 0/O, 1/I/L.
ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
LONGITUD = 8


def generar_codigo() -> str:
    return "".join(secrets.choice(ALFABETO) for _ in range(LONGITUD))


def url_trampa(codigo: str) -> str:
    """Única información que lleva el QR: la URL corta que resuelve la trampa."""
    return f"{get_settings().qr_url_base.rstrip('/')}/t/{codigo}"


def _qr(codigo: str) -> segno.QRCode:
    # Nivel Q: el QR se sigue leyendo con hasta ~25 % de la etiqueta dañada o sucia.
    return segno.make_qr(url_trampa(codigo), error="q", boost_error=False)


def qr_svg(codigo: str) -> bytes:
    salida = io.BytesIO()
    _qr(codigo).save(salida, kind="svg", scale=10, border=4, xmldecl=False)
    return salida.getvalue()


def qr_png(codigo: str) -> bytes:
    salida = io.BytesIO()
    _qr(codigo).save(salida, kind="png", scale=10, border=4)
    return salida.getvalue()
