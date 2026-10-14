import asyncio
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select

from app.api.deps import SessionDep, UsuarioActualDep, cargar_usuario_activo
from app.core.config import get_settings
from app.models.usuario import Usuario
from app.schemas.auth import RenovarEntrada, Token, UsuarioLeer
from app.services.auth import (
    HASH_FICTICIO,
    crear_token,
    crear_token_renovacion,
    decodificar_renovacion,
    verificar_clave,
)
from app.services.intentos import LimiteIntentos

router = APIRouter(prefix="/auth", tags=["auth"])

ERROR_401 = {401: {"description": "Credenciales o sesión inválidas"}}
ERROR_429 = {429: {"description": "Demasiados intentos fallidos; ver encabezado `Retry-After`"}}

MAX_CORREO = 254
MAX_CLAVE = 128

limite_intentos = LimiteIntentos(
    maximo=get_settings().intentos_maximos,
    ventana_s=get_settings().intentos_ventana_minutos * 60,
)


def _emitir_tokens(usuario: Usuario, inicio: datetime | None = None) -> Token:
    return Token(
        access_token=crear_token(usuario.id, usuario.rol),
        refresh_token=crear_token_renovacion(usuario.id, inicio=inicio),
        expires_in=get_settings().token_minutos * 60,
    )


@router.post(
    "/token",
    response_model=Token,
    summary="Iniciar sesión",
    description="Recibe el correo en `username` y la contraseña en `password` como formulario "
    "(OAuth2). Devuelve un token de acceso Bearer de corta duración para el encabezado "
    "`Authorization` y un token de renovación para `POST /auth/renovar`.",
    responses={**ERROR_401, **ERROR_429},
)
async def iniciar_sesion(
    formulario: Annotated[OAuth2PasswordRequestForm, Depends()], session: SessionDep
) -> Token:
    correo = formulario.username.strip().lower()
    no_autorizado = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Correo o contraseña incorrectos",
        headers={"WWW-Authenticate": "Bearer"},
    )
    # Ningún usuario válido supera estas longitudes; se rechaza sin tocar el límite ni Argon2.
    if len(correo) > MAX_CORREO or len(formulario.password) > MAX_CLAVE:
        raise no_autorizado
    espera = limite_intentos.segundos_bloqueo(correo)
    if espera:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos. Intente de nuevo en unos minutos.",
            headers={"Retry-After": str(espera)},
        )
    # El intento se cuenta antes de cualquier await para que una ráfaga concurrente no pase
    # completa la comprobación; si resulta correcto, se reinicia abajo.
    limite_intentos.registrar_fallo(correo)
    usuario = await session.scalar(
        select(Usuario).where(Usuario.correo == correo, Usuario.deleted_at.is_(None))
    )
    clave_hash = HASH_FICTICIO if usuario is None else usuario.clave_hash
    clave_correcta = await asyncio.to_thread(verificar_clave, formulario.password, clave_hash)
    if usuario is None or not clave_correcta or not usuario.activo:
        raise no_autorizado
    limite_intentos.reiniciar(correo)
    return _emitir_tokens(usuario)


@router.post(
    "/renovar",
    response_model=Token,
    summary="Renovar la sesión",
    description="Cambia un token de renovación vigente por un nuevo par de tokens. Falla si el "
    "usuario fue desactivado o eliminado, o si pasaron más de `SESION_MAX_DIAS` desde el inicio "
    "de sesión.",
    responses=ERROR_401,
)
async def renovar(entrada: RenovarEntrada, session: SessionDep) -> Token:
    renovacion = decodificar_renovacion(entrada.refresh_token)
    usuario_id, inicio = renovacion if renovacion else (None, None)
    usuario = await cargar_usuario_activo(session, usuario_id)
    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión inválida o expirada",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _emitir_tokens(usuario, inicio)


@router.get(
    "/yo",
    response_model=UsuarioLeer,
    summary="Usuario de la sesión actual",
    responses=ERROR_401,
)
async def yo(usuario: UsuarioActualDep) -> Usuario:
    return usuario
