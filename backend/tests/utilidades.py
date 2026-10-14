"""Ayudas para las pruebas que no son fixtures."""

from app.models.usuario import Usuario
from app.services.auth import crear_token

CLAVE = "clave-segura-123"


def encabezados(usuario: Usuario) -> dict[str, str]:
    """Encabezado `Authorization` con un token válido para el usuario."""
    return {"Authorization": f"Bearer {crear_token(usuario.id, usuario.rol)}"}
