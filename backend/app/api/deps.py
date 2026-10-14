"""Dependencias reutilizables de FastAPI (estilo Annotated)."""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_session
from app.models.usuario import Usuario
from app.services.auth import decodificar_token

SessionDep = Annotated[AsyncSession, Depends(get_session)]

oauth2_esquema = OAuth2PasswordBearer(tokenUrl=f"{get_settings().api_v1_prefix}/auth/login")


async def obtener_usuario_actual(
    token: Annotated[str, Depends(oauth2_esquema)], session: SessionDep
) -> Usuario:
    no_autorizado = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sesión inválida o expirada",
        headers={"WWW-Authenticate": "Bearer"},
    )
    usuario_id = decodificar_token(token)
    if usuario_id is None:
        raise no_autorizado
    usuario = await session.scalar(
        select(Usuario).where(
            Usuario.id == usuario_id, Usuario.deleted_at.is_(None), Usuario.activo
        )
    )
    if usuario is None:
        raise no_autorizado
    return usuario


UsuarioActualDep = Annotated[Usuario, Depends(obtener_usuario_actual)]
