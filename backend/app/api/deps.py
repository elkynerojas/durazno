"""Dependencias reutilizables de FastAPI (estilo Annotated)."""

import uuid
from collections.abc import Awaitable, Callable
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

oauth2_esquema = OAuth2PasswordBearer(tokenUrl=f"{get_settings().api_v1_prefix}/auth/token")


async def cargar_usuario_activo(
    session: AsyncSession, usuario_id: uuid.UUID | None
) -> Usuario | None:
    """Usuario activo y no eliminado, o `None`. Se recarga en cada petición."""
    if usuario_id is None:
        return None
    return await session.scalar(
        select(Usuario).where(
            Usuario.id == usuario_id, Usuario.deleted_at.is_(None), Usuario.activo
        )
    )


async def obtener_usuario_actual(
    token: Annotated[str, Depends(oauth2_esquema)], session: SessionDep
) -> Usuario:
    no_autorizado = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sesión inválida o expirada",
        headers={"WWW-Authenticate": "Bearer"},
    )
    usuario = await cargar_usuario_activo(session, decodificar_token(token))
    if usuario is None:
        raise no_autorizado
    return usuario


UsuarioActualDep = Annotated[Usuario, Depends(obtener_usuario_actual)]


def requiere_rol(*roles: str) -> Callable[..., Awaitable[Usuario]]:
    """Dependencia que exige sesión (401) y uno de los roles indicados (403).

    Uso: `dependencies=[Depends(requiere_rol("agronomo"))]` o como parámetro
    `usuario: Annotated[Usuario, Depends(requiere_rol("agronomo", "tecnico"))]`.
    """

    async def _verificar(usuario: UsuarioActualDep) -> Usuario:
        if usuario.rol not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tiene permiso para realizar esta acción",
            )
        return usuario

    return _verificar
