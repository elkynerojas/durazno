"""Hash de claves y tokens JWT de sesión."""

import uuid
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.core.config import get_settings

_hasher = PasswordHash.recommended()

# Se verifica contra este hash cuando el usuario no existe, para que el tiempo de
# respuesta no revele qué nombres de usuario están registrados.
HASH_FICTICIO = _hasher.hash("clave-ficticia")


def hashear_clave(clave: str) -> str:
    return _hasher.hash(clave)


def verificar_clave(clave: str, clave_hash: str) -> bool:
    return _hasher.verify(clave, clave_hash)


def crear_token(usuario_id: uuid.UUID, rol: str, minutos: int | None = None) -> str:
    settings = get_settings()
    expira = datetime.now(UTC) + timedelta(minutes=minutos or settings.token_minutos)
    datos = {"sub": str(usuario_id), "rol": rol, "exp": expira}
    return jwt.encode(datos, settings.secret_key, algorithm=settings.jwt_algoritmo)


def decodificar_token(token: str) -> uuid.UUID | None:
    """Devuelve el id del usuario o `None` si el token es inválido o expiró."""
    settings = get_settings()
    try:
        datos = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algoritmo])
        return uuid.UUID(datos["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        return None
