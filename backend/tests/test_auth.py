"""Pruebas de autenticación (servicio y endpoints)."""

import uuid

from httpx import AsyncClient

from app.services.auth import crear_token, decodificar_token, hashear_clave, verificar_clave
from tests.utilidades import CLAVE, encabezados


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


async def _login(cliente: AsyncClient, usuario: str, clave: str):
    return await cliente.post("/api/v1/auth/login", data={"username": usuario, "password": clave})


async def test_login_correcto_y_usuario_actual(cliente, crear_usuario):
    await crear_usuario("prueba_ok")

    respuesta = await _login(cliente, "Prueba_OK ", CLAVE)
    assert respuesta.status_code == 200
    token = respuesta.json()["access_token"]

    yo = await cliente.get("/api/v1/auth/yo", headers={"Authorization": f"Bearer {token}"})
    assert yo.status_code == 200
    assert yo.json()["nombre_usuario"] == "prueba_ok"
    assert "clave_hash" not in yo.json()


async def test_login_clave_incorrecta(cliente, crear_usuario):
    await crear_usuario("prueba_clave")
    respuesta = await _login(cliente, "prueba_clave", "incorrecta")
    assert respuesta.status_code == 401
    assert respuesta.json()["detail"] == "Usuario o contraseña incorrectos"


async def test_login_usuario_inexistente(cliente):
    respuesta = await _login(cliente, f"no_existe_{uuid.uuid4().hex}", CLAVE)
    assert respuesta.status_code == 401


async def test_login_usuario_inactivo(cliente, crear_usuario):
    await crear_usuario("prueba_inactivo", activo=False)
    respuesta = await _login(cliente, "prueba_inactivo", CLAVE)
    assert respuesta.status_code == 401


async def test_usuario_actual_sin_token_o_invalido(cliente):
    assert (await cliente.get("/api/v1/auth/yo")).status_code == 401
    respuesta = await cliente.get(
        "/api/v1/auth/yo", headers={"Authorization": "Bearer token-falso"}
    )
    assert respuesta.status_code == 401


async def test_token_emitido_permite_consultar_usuario(cliente, crear_usuario):
    usuario = await crear_usuario("prueba_token", rol="agronomo")
    respuesta = await cliente.get("/api/v1/auth/yo", headers=encabezados(usuario))
    assert respuesta.status_code == 200
    assert respuesta.json()["rol"] == "agronomo"
