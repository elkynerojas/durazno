from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select

from app.api.deps import SessionDep, UsuarioActualDep
from app.models.usuario import Usuario
from app.schemas.auth import Token, UsuarioLeer
from app.services.auth import HASH_FICTICIO, crear_token, verificar_clave

router = APIRouter(prefix="/auth", tags=["auth"])

ERROR_401 = {401: {"description": "Credenciales o sesión inválidas"}}


@router.post(
    "/login",
    response_model=Token,
    summary="Iniciar sesión",
    description="Recibe `username` y `password` como formulario (OAuth2) y devuelve un token "
    "Bearer para el encabezado `Authorization`.",
    responses=ERROR_401,
)
async def login(
    formulario: Annotated[OAuth2PasswordRequestForm, Depends()], session: SessionDep
) -> Token:
    usuario = await session.scalar(
        select(Usuario).where(
            Usuario.nombre_usuario == formulario.username.strip().lower(),
            Usuario.deleted_at.is_(None),
        )
    )
    if usuario is None:
        verificar_clave(formulario.password, HASH_FICTICIO)
    if (
        usuario is None
        or not verificar_clave(formulario.password, usuario.clave_hash)
        or not usuario.activo
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Token(access_token=crear_token(usuario.id, usuario.rol))


@router.get(
    "/yo",
    response_model=UsuarioLeer,
    summary="Usuario de la sesión actual",
    responses=ERROR_401,
)
async def yo(usuario: UsuarioActualDep) -> Usuario:
    return usuario
