"""Ayudas para las pruebas que no son fixtures."""

from app.models.lote import Lote
from app.models.predio import Predio
from app.models.usuario import Usuario
from app.services.auth import crear_token

CLAVE = "clave-segura-123"


def encabezados(usuario: Usuario) -> dict[str, str]:
    """Encabezado `Authorization` con un token válido para el usuario."""
    return {"Authorization": f"Bearer {crear_token(usuario.id, usuario.rol)}"}


async def predio_de_lote(session, lote_id) -> Predio:
    """El predio de un lote, para asignar usuarios de prueba a él."""
    lote = await session.get(Lote, lote_id)
    return await session.get(Predio, lote.predio_id)
