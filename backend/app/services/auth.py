"""Hash de claves y tokens JWT de sesión."""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.core.config import get_settings

_hasher = PasswordHash.recommended()

# Se verifica contra este hash cuando el usuario no existe, para que el tiempo de
# respuesta no revele qué correos están registrados.
HASH_FICTICIO = _hasher.hash("clave-ficticia")


def hashear_clave(clave: str) -> str:
    return _hasher.hash(clave)


def verificar_clave(clave: str, clave_hash: str) -> bool:
    return _hasher.verify(clave, clave_hash)


TIPO_ACCESO = "acceso"
TIPO_RENOVACION = "renovacion"


@dataclass(frozen=True)
class DatosToken:
    usuario_id: uuid.UUID
    # Momento de emisión (`iat`): permite revocar los tokens anteriores a un cambio de clave.
    emitido: datetime


def _firmar(datos: dict, expira: datetime) -> str:
    settings = get_settings()
    # `iat` con fracción de segundo (RFC 7519 lo permite): la revocación de sesiones compara
    # contra el instante exacto del cambio de clave, no contra su segundo.
    ahora = datetime.now(UTC).timestamp()
    return jwt.encode(
        {**datos, "iat": ahora, "exp": expira},
        settings.secret_key,
        algorithm=settings.jwt_algoritmo,
    )


def crear_token(usuario_id: uuid.UUID, rol: str, minutos: int | None = None) -> str:
    minutos = get_settings().token_minutos if minutos is None else minutos
    expira = datetime.now(UTC) + timedelta(minutes=minutos)
    return _firmar({"sub": str(usuario_id), "rol": rol, "tipo": TIPO_ACCESO}, expira)


def crear_token_renovacion(
    usuario_id: uuid.UUID, dias: int | None = None, inicio: datetime | None = None
) -> str:
    """Token de renovación. `inicio` es el momento del inicio de sesión original: la cadena de
    renovaciones nunca pasa de `sesion_max_dias` desde ahí."""
    settings = get_settings()
    dias = settings.renovacion_dias if dias is None else dias
    ahora = datetime.now(UTC)
    inicio = inicio or ahora
    expira = min(ahora + timedelta(days=dias), inicio + timedelta(days=settings.sesion_max_dias))
    datos = {"sub": str(usuario_id), "tipo": TIPO_RENOVACION, "auth_time": int(inicio.timestamp())}
    return _firmar(datos, expira)


def _decodificar(token: str, tipo: str, requeridos: tuple[str, ...] = ()) -> dict | None:
    settings = get_settings()
    try:
        datos = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.jwt_algoritmo],
            options={"require": ["exp", "iat", "sub", "tipo", *requeridos]},
        )
    except jwt.InvalidTokenError:
        return None
    return datos if datos["tipo"] == tipo else None


def _datos(datos: dict) -> DatosToken:
    return DatosToken(uuid.UUID(datos["sub"]), datetime.fromtimestamp(datos["iat"], UTC))


def decodificar_token(token: str) -> DatosToken | None:
    """Usuario y emisión de un token de acceso, o `None` si es inválido, expiró o es de otro
    tipo."""
    datos = _decodificar(token, TIPO_ACCESO)
    try:
        return None if datos is None else _datos(datos)
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def decodificar_renovacion(token: str) -> tuple[DatosToken, datetime] | None:
    """Datos de un token de renovación y momento del inicio de sesión original, o `None`."""
    datos = _decodificar(token, TIPO_RENOVACION, ("auth_time",))
    try:
        if datos is None:
            return None
        return _datos(datos), datetime.fromtimestamp(datos["auth_time"], UTC)
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def sesion_vigente(sesion_valida_desde: datetime | None, emitido: datetime) -> bool:
    """`False` si el token se emitió antes de la última revocación de sesiones del usuario."""
    return sesion_valida_desde is None or emitido >= sesion_valida_desde
