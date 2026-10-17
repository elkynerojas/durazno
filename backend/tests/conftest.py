"""Fixtures compartidas.

Las pruebas que tocan la base usan una conexión con una transacción que se revierte al final,
así no dejan datos en la base de desarrollo.
"""

from collections.abc import AsyncIterator, Awaitable, Callable

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.api.v1.endpoints.auth import limite_intentos
from app.core.config import get_settings
from app.db.session import get_session
from app.main import app
from app.models.usuario import Usuario
from app.services.auth import hashear_clave
from tests.utilidades import CLAVE


@pytest.fixture(autouse=True)
def _reiniciar_intentos():
    limite_intentos.reiniciar()
    yield
    limite_intentos.reiniciar()


@pytest.fixture
async def session() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(get_settings().database_url, poolclass=NullPool)
    async with engine.connect() as conexion:
        transaccion = await conexion.begin()
        # expire_on_commit=False igual que SessionLocal, para que los commits de los endpoints
        # no expiren los objetos que la prueba ya tiene cargados.
        async with AsyncSession(
            bind=conexion, join_transaction_mode="create_savepoint", expire_on_commit=False
        ) as sesion:
            yield sesion
        await transaccion.rollback()
    await engine.dispose()


@pytest.fixture
async def cliente(session: AsyncSession) -> AsyncIterator[AsyncClient]:
    async def _sesion_de_prueba():
        yield session

    app.dependency_overrides[get_session] = _sesion_de_prueba
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def crear_usuario(session: AsyncSession) -> Callable[..., Awaitable[Usuario]]:
    """Fábrica: `await crear_usuario("correo@ejemplo.com", rol="agronomo", activo=True)`."""

    async def _crear(correo: str, rol: str = "tecnico", activo: bool = True) -> Usuario:
        usuario = Usuario(
            correo=correo,
            nombre_completo="Persona de Prueba",
            rol=rol,
            clave_hash=hashear_clave(CLAVE),
            activo=activo,
        )
        session.add(usuario)
        await session.flush()
        return usuario

    return _crear
