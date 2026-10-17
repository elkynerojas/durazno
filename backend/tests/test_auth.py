"""Pruebas de autenticación (servicio y endpoints)."""

import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import jwt
import pytest
from fastapi import APIRouter, Depends, HTTPException, Response
from httpx import AsyncClient

from app.api.deps import requiere_rol
from app.api.v1.endpoints.auth import iniciar_sesion
from app.core.config import Settings, get_settings
from app.main import app
from app.services.auth import (
    crear_token,
    crear_token_renovacion,
    decodificar_renovacion,
    decodificar_token,
    hashear_clave,
    sesion_vigente,
    verificar_clave,
)
from tests.utilidades import CLAVE, encabezados

ERROR_CREDENCIALES = "Correo o contraseña incorrectos"


def test_hash_y_verificacion_de_clave():
    clave_hash = hashear_clave(CLAVE)
    assert clave_hash.startswith("$argon2id$")
    assert verificar_clave(CLAVE, clave_hash)
    assert not verificar_clave("otra-clave", clave_hash)


def test_token_valido_devuelve_id():
    usuario_id = uuid.uuid4()
    datos = decodificar_token(crear_token(usuario_id, "tecnico"))
    assert datos.usuario_id == usuario_id
    assert abs((datetime.now(UTC) - datos.emitido).total_seconds()) < 5


def test_token_expirado_o_alterado_es_invalido():
    usuario_id = uuid.uuid4()
    assert decodificar_token(crear_token(usuario_id, "tecnico", minutos=-1)) is None
    assert decodificar_token(crear_token(usuario_id, "tecnico") + "x") is None
    assert decodificar_token("no-es-un-token") is None


def test_token_sin_tipo_o_sin_vencimiento_es_invalido():
    settings = get_settings()
    usuario_id = str(uuid.uuid4())
    sin_tipo = jwt.encode({"sub": usuario_id, "exp": 4102444800}, settings.secret_key)
    sin_exp = jwt.encode({"sub": usuario_id, "tipo": "acceso"}, settings.secret_key)
    assert decodificar_token(sin_tipo) is None
    assert decodificar_token(sin_exp) is None


def test_tokens_de_acceso_y_renovacion_no_se_intercambian():
    usuario_id = uuid.uuid4()
    acceso = crear_token(usuario_id, "tecnico")
    renovacion = crear_token_renovacion(usuario_id)
    assert decodificar_token(renovacion) is None
    assert decodificar_renovacion(acceso) is None
    assert decodificar_renovacion(renovacion)[0].usuario_id == usuario_id
    assert decodificar_renovacion(crear_token_renovacion(usuario_id, dias=-1)) is None


def test_renovacion_conserva_el_inicio_y_no_pasa_del_tope_de_sesion():
    usuario_id = uuid.uuid4()
    inicio = datetime.now(UTC) - timedelta(days=10)
    _, inicio_leido = decodificar_renovacion(crear_token_renovacion(usuario_id, inicio=inicio))
    assert inicio_leido == inicio.replace(microsecond=0)

    tope = get_settings().sesion_max_dias
    vencido = datetime.now(UTC) - timedelta(days=tope, seconds=1)
    assert decodificar_renovacion(crear_token_renovacion(usuario_id, inicio=vencido)) is None

    por_vencer = datetime.now(UTC) - timedelta(days=tope - 1)
    datos = jwt.decode(
        crear_token_renovacion(usuario_id, inicio=por_vencer),
        options={"verify_signature": False},
    )
    assert datos["exp"] <= int((por_vencer + timedelta(days=tope)).timestamp())


async def _login(cliente: AsyncClient, correo: str, clave: str):
    return await cliente.post("/api/v1/auth/token", data={"username": correo, "password": clave})


async def test_login_correcto_y_usuario_actual(cliente, crear_usuario):
    await crear_usuario("prueba.ok@ejemplo.com")

    respuesta = await _login(cliente, " Prueba.OK@Ejemplo.com ", CLAVE)
    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["token_type"] == "bearer"
    # En el navegador la renovación no viaja en el cuerpo sino en una cookie HttpOnly.
    assert datos["refresh_token"] is None
    cookie = respuesta.headers["set-cookie"]
    assert cookie.startswith("icota_renovacion=")
    assert "HttpOnly" in cookie
    assert "SameSite=strict" in cookie
    assert "Path=/api/v1/auth" in cookie
    assert datos["expires_in"] > 0

    yo = await cliente.get(
        "/api/v1/auth/yo", headers={"Authorization": f"Bearer {datos['access_token']}"}
    )
    assert yo.status_code == 200
    assert yo.json()["correo"] == "prueba.ok@ejemplo.com"
    assert "clave_hash" not in yo.json()


async def test_login_clave_incorrecta_y_correo_inexistente_responden_igual(cliente, crear_usuario):
    await crear_usuario("prueba.clave@ejemplo.com")
    clave_mala = await _login(cliente, "prueba.clave@ejemplo.com", "incorrecta")
    inexistente = await _login(cliente, f"{uuid.uuid4().hex}@ejemplo.com", CLAVE)
    assert clave_mala.status_code == inexistente.status_code == 401
    assert clave_mala.json() == inexistente.json() == {"detail": ERROR_CREDENCIALES}


async def test_login_usuario_inactivo(cliente, crear_usuario):
    await crear_usuario("prueba.inactivo@ejemplo.com", activo=False)
    respuesta = await _login(cliente, "prueba.inactivo@ejemplo.com", CLAVE)
    assert respuesta.status_code == 401
    assert respuesta.json()["detail"] == ERROR_CREDENCIALES


async def test_usuario_actual_sin_token_invalido_o_vencido(cliente, crear_usuario):
    usuario = await crear_usuario("prueba.vencido@ejemplo.com")
    vencido = crear_token(usuario.id, usuario.rol, minutos=-1)
    assert (await cliente.get("/api/v1/auth/yo")).status_code == 401
    for token in ("token-falso", vencido, crear_token_renovacion(usuario.id)):
        respuesta = await cliente.get(
            "/api/v1/auth/yo", headers={"Authorization": f"Bearer {token}"}
        )
        assert respuesta.status_code == 401


async def test_token_emitido_permite_consultar_usuario(cliente, crear_usuario):
    usuario = await crear_usuario("prueba.token@ejemplo.com", rol="agronomo")
    respuesta = await cliente.get("/api/v1/auth/yo", headers=encabezados(usuario))
    assert respuesta.status_code == 200
    assert respuesta.json()["rol"] == "agronomo"


async def test_renovar_con_la_cookie_rota_el_token_y_conserva_el_inicio(cliente, crear_usuario):
    await crear_usuario("prueba.renovar@ejemplo.com")
    login = await _login(cliente, "prueba.renovar@ejemplo.com", CLAVE)
    original = login.cookies["icota_renovacion"]

    # El navegador no manda cuerpo: la cookie viaja sola.
    respuesta = await cliente.post("/api/v1/auth/renovar")
    assert respuesta.status_code == 200
    rotada = respuesta.cookies["icota_renovacion"]
    assert respuesta.json()["refresh_token"] is None
    assert decodificar_renovacion(rotada)[1] == decodificar_renovacion(original)[1]
    nuevo = respuesta.json()["access_token"]
    yo = await cliente.get("/api/v1/auth/yo", headers={"Authorization": f"Bearer {nuevo}"})
    assert yo.status_code == 200


async def test_cliente_movil_recibe_y_envia_la_renovacion_en_el_cuerpo(cliente, crear_usuario):
    await crear_usuario("prueba.movil@ejemplo.com")
    movil = {"X-Cliente": "movil"}
    login = await cliente.post(
        "/api/v1/auth/token",
        data={"username": "prueba.movil@ejemplo.com", "password": CLAVE},
        headers=movil,
    )
    assert "set-cookie" not in login.headers
    renovacion = login.json()["refresh_token"]
    assert decodificar_renovacion(renovacion) is not None

    respuesta = await cliente.post(
        "/api/v1/auth/renovar", json={"refresh_token": renovacion}, headers=movil
    )
    assert respuesta.status_code == 200
    assert respuesta.json()["refresh_token"]
    assert "set-cookie" not in respuesta.headers


async def test_salir_borra_la_cookie(cliente, crear_usuario):
    await crear_usuario("prueba.salir@ejemplo.com")
    await _login(cliente, "prueba.salir@ejemplo.com", CLAVE)
    respuesta = await cliente.post("/api/v1/auth/salir")
    assert respuesta.status_code == 204
    assert 'icota_renovacion=""' in respuesta.headers["set-cookie"]
    assert (await cliente.post("/api/v1/auth/renovar")).status_code == 401


def test_cookie_segura_fuera_de_desarrollo():
    assert not Settings(environment="development").cookie_segura
    produccion = Settings(
        environment="production", secret_key="x" * 40, qr_url_base="https://icota.co"
    )
    assert produccion.cookie_segura


def test_sesion_vigente_compara_contra_el_instante_de_la_revocacion():
    revocada = datetime(2026, 10, 17, 12, 0, 0, 700_000, tzinfo=UTC)
    assert sesion_vigente(None, revocada)
    assert sesion_vigente(revocada, revocada + timedelta(milliseconds=1))
    # Emitido en el mismo segundo pero antes del cambio: ya no vale.
    assert not sesion_vigente(revocada, revocada - timedelta(milliseconds=100))


def test_iat_conserva_la_fraccion_de_segundo():
    datos = jwt.decode(crear_token(uuid.uuid4(), "tecnico"), options={"verify_signature": False})
    assert isinstance(datos["iat"], float)


async def test_renovar_rechaza_token_de_acceso_vencido_o_usuario_desactivado(
    cliente, crear_usuario, session
):
    usuario = await crear_usuario("prueba.revocar@ejemplo.com")
    invalidos = [
        crear_token(usuario.id, usuario.rol),
        crear_token_renovacion(usuario.id, dias=-1),
        crear_token_renovacion(usuario.id, inicio=datetime.now(UTC) - timedelta(days=31)),
        "token-falso",
    ]
    for token in invalidos:
        respuesta = await cliente.post("/api/v1/auth/renovar", json={"refresh_token": token})
        assert respuesta.status_code == 401

    vigente = crear_token_renovacion(usuario.id)
    usuario.activo = False
    await session.flush()
    respuesta = await cliente.post("/api/v1/auth/renovar", json={"refresh_token": vigente})
    assert respuesta.status_code == 401


async def test_renovar_sin_cookie_ni_cuerpo_responde_401(cliente):
    assert (await cliente.post("/api/v1/auth/renovar")).status_code == 401
    assert (await cliente.post("/api/v1/auth/renovar", json={})).status_code == 401


async def test_limite_de_intentos_bloquea_y_se_reinicia_tras_exito(cliente, crear_usuario):
    await crear_usuario("prueba.intentos@ejemplo.com")
    for _ in range(4):
        assert (await _login(cliente, "prueba.intentos@ejemplo.com", "mala")).status_code == 401
    assert (await _login(cliente, "prueba.intentos@ejemplo.com", CLAVE)).status_code == 200

    for _ in range(5):
        assert (await _login(cliente, "prueba.intentos@ejemplo.com", "mala")).status_code == 401
    bloqueado = await _login(cliente, "PRUEBA.intentos@ejemplo.com", CLAVE)
    assert bloqueado.status_code == 429
    assert int(bloqueado.headers["Retry-After"]) > 0


async def test_limite_de_intentos_aplica_a_correos_inexistentes(cliente):
    correo = f"{uuid.uuid4().hex}@ejemplo.com"
    for _ in range(5):
        assert (await _login(cliente, correo, CLAVE)).status_code == 401
    assert (await _login(cliente, correo, CLAVE)).status_code == 429


class _SesionLenta:
    """Sesión simulada que cede el control al consultar, como haría la base real."""

    async def scalar(self, _consulta):
        await asyncio.sleep(0.01)


_PETICION = SimpleNamespace(client=SimpleNamespace(host="203.0.113.7"))


async def test_limite_de_intentos_resiste_rafagas_concurrentes():
    formulario = SimpleNamespace(username=f"{uuid.uuid4().hex}@ejemplo.com", password="mala")

    async def intentar() -> int:
        try:
            await iniciar_sesion(formulario, _SesionLenta(), _PETICION, Response())
        except HTTPException as error:
            return error.status_code
        return 200

    codigos = sorted(await asyncio.gather(*(intentar() for _ in range(12))))
    assert codigos == [401] * 5 + [429] * 7


async def test_correo_o_clave_demasiado_largos_responden_401(cliente):
    largo = "a" * 300 + "@ejemplo.com"
    respuesta = await _login(cliente, largo, CLAVE)
    assert respuesta.status_code == 401
    assert respuesta.json()["detail"] == ERROR_CREDENCIALES
    assert (await _login(cliente, "a@ejemplo.com", "x" * 129)).status_code == 401


# Ruta de prueba protegida por rol, montada solo durante estas pruebas.
_router_rol = APIRouter()


@_router_rol.get("/prueba-rol", dependencies=[Depends(requiere_rol("agronomo"))])
async def _ruta_solo_agronomo() -> dict[str, bool]:
    return {"ok": True}


@pytest.fixture
def ruta_protegida():
    cantidad = len(app.router.routes)
    app.include_router(_router_rol, prefix="/api/v1")
    yield "/api/v1/prueba-rol"
    del app.router.routes[cantidad:]


async def test_requiere_rol(cliente, crear_usuario, ruta_protegida):
    tecnico = await crear_usuario("prueba.tecnico@ejemplo.com", rol="tecnico")
    agronomo = await crear_usuario("prueba.agronomo@ejemplo.com", rol="agronomo")

    assert (await cliente.get(ruta_protegida)).status_code == 401
    prohibido = await cliente.get(ruta_protegida, headers=encabezados(tecnico))
    assert prohibido.status_code == 403
    assert prohibido.json()["detail"] == "No tiene permiso para realizar esta acción"
    permitido = await cliente.get(ruta_protegida, headers=encabezados(agronomo))
    assert permitido.status_code == 200
