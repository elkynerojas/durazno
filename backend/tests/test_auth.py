"""Pruebas de autenticación.

Las que tocan la base usan una conexión con una transacción que se revierte al final,
así no dejan usuarios en la base de desarrollo.
"""

import uuid
from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.db.session import get_session
from app.main import app
from app.models.usuario import Usuario
from app.services.auth import crear_token, decodificar_token, hashear_clave, verificar_clave

CLAVE = "clave-segura-123"


def test_hash_y_verificacion_de_clave():
    clave_hash = hashear_clave(CLAVE)
    assert clave_hash != CLAVE
    assert verificar_clave(CLAVE, clave_hash)
    assert not verificar_clave("otra-clave", clave_hash)


def test_token_valido_devuelve_id():
    usuario_id = uuid.uuid4()
    assert decodificar_token(crear_token(usuario_id, "tecnico")) == usuario_id


def test_token_expirado_o_alterado_es_invalido():
    usuario_id = uuid.uuid4()
    assert decodificar_token(crear_token(usuario_id, "tecnico", minutos=-1)) is None
    assert decodificar_token(crear_token(usuario_id, "tecnico") + "x") is None
    assert decodificar_token("no-es-un-token") is None


@pytest.fixture
async def session() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(get_settings().database_url, poolclass=NullPool)
    async with engine.connect() as conexion:
        transaccion = await conexion.begin()
        async with AsyncSession(bind=conexion, join_transaction_mode="create_savepoint") as sesion:
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


async def _crear_usuario(session: AsyncSession, nombre: str, activo: bool = True) -> Usuario:
    usuario = Usuario(
        nombre_usuario=nombre,
        nombre_completo="Persona de Prueba",
        rol="tecnico",
        clave_hash=hashear_clave(CLAVE),
        activo=activo,
    )
    session.add(usuario)
    await session.flush()
    return usuario


async def _login(cliente: AsyncClient, usuario: str, clave: str):
    return await cliente.post("/api/v1/auth/login", data={"username": usuario, "password": clave})


async def test_login_correcto_y_usuario_actual(cliente, session):
    await _crear_usuario(session, "prueba_ok")

    respuesta = await _login(cliente, "Prueba_OK ", CLAVE)
    assert respuesta.status_code == 200
    token = respuesta.json()["access_token"]

    yo = await cliente.get("/api/v1/auth/yo", headers={"Authorization": f"Bearer {token}"})
    assert yo.status_code == 200
    assert yo.json()["nombre_usuario"] == "prueba_ok"
    assert "clave_hash" not in yo.json()


async def test_login_clave_incorrecta(cliente, session):
    await _crear_usuario(session, "prueba_clave")
    respuesta = await _login(cliente, "prueba_clave", "incorrecta")
    assert respuesta.status_code == 401
    assert respuesta.json()["detail"] == "Usuario o contraseña incorrectos"


async def test_login_usuario_inexistente(cliente):
    respuesta = await _login(cliente, f"no_existe_{uuid.uuid4().hex}", CLAVE)
    assert respuesta.status_code == 401


async def test_login_usuario_inactivo(cliente, session):
    await _crear_usuario(session, "prueba_inactivo", activo=False)
    respuesta = await _login(cliente, "prueba_inactivo", CLAVE)
    assert respuesta.status_code == 401


async def test_usuario_actual_sin_token_o_invalido(cliente):
    assert (await cliente.get("/api/v1/auth/yo")).status_code == 401
    respuesta = await cliente.get(
        "/api/v1/auth/yo", headers={"Authorization": "Bearer token-falso"}
    )
    assert respuesta.status_code == 401
