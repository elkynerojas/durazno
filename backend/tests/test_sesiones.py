"""Revocación de sesiones y política de contraseñas (HU-08.7, auditorías HU-05 y HU-06)."""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app import main
from app.api.origen import origen_permitido
from app.core.config import Settings
from app.main import app
from app.services.claves import motivo_clave_debil
from tests.utilidades import CLAVE, encabezados

URL = "/api/v1/usuarios"
CLAVE_NUEVA = "Durazno-en-flor-26"


async def _login(cliente, correo, clave=CLAVE):
    return await cliente.post("/api/v1/auth/token", data={"username": correo, "password": clave})


@pytest.fixture
async def agronomo(crear_usuario):
    return await crear_usuario(f"agronomo.{uuid.uuid4().hex[:8]}@ejemplo.com", rol="agronomo")


@pytest.fixture
async def tecnico(crear_usuario):
    return await crear_usuario(f"tecnico.{uuid.uuid4().hex[:8]}@ejemplo.com")


# --- Política de contraseñas ---


@pytest.mark.parametrize(
    "clave",
    ["12345678", "Password", "aaaaaaaaaa", "abababab", "abcdefghij", "9876543210", "qwertyuiop"],
)
def test_claves_triviales_se_rechazan(clave):
    assert motivo_clave_debil(clave) is not None


def test_clave_que_contiene_el_correo_se_rechaza():
    assert motivo_clave_debil("luisperez2026", "LuisPerez@iser.edu.co") is not None
    assert motivo_clave_debil("luisperez2026", "otra@iser.edu.co") is None


@pytest.mark.parametrize("clave", [CLAVE, CLAVE_NUEVA, "Cacota-Icota-2026!", "trampa-jackson-7"])
def test_claves_razonables_se_aceptan(clave):
    assert motivo_clave_debil(clave, "tecnico@ejemplo.com") is None


async def test_crear_o_restablecer_con_clave_trivial_responde_422(cliente, agronomo, tecnico):
    nuevo = {
        "correo": f"{uuid.uuid4().hex[:10]}@ejemplo.com",
        "nombre_completo": "Técnico",
        "rol": "tecnico",
        "clave": "12345678",
        "autorizacion_datos": True,
    }
    creado = await cliente.post(URL, json=nuevo, headers=encabezados(agronomo))
    assert creado.status_code == 422
    assert creado.json()["detail"] == (
        "La contraseña es demasiado común; use una frase o combinación propia"
    )
    restablecida = await cliente.patch(
        f"{URL}/{tecnico.id}", json={"clave": "qwertyuiop"}, headers=encabezados(agronomo)
    )
    assert restablecida.status_code == 422


# --- Revocación de sesiones ---


async def test_restablecer_la_clave_cierra_las_sesiones_abiertas(cliente, agronomo, tecnico):
    sesion = await _login(cliente, tecnico.correo)
    acceso = {"Authorization": f"Bearer {sesion.json()['access_token']}"}
    cliente.cookies.clear()
    renovacion = sesion.cookies["icota_renovacion"]

    respuesta = await cliente.patch(
        f"{URL}/{tecnico.id}", json={"clave": CLAVE_NUEVA}, headers=encabezados(agronomo)
    )
    assert respuesta.status_code == 200

    # El token robado ya no sirve, ni para consultar ni para renovarse.
    assert (await cliente.get("/api/v1/auth/yo", headers=acceso)).status_code == 401
    cliente.cookies.set("icota_renovacion", renovacion, path="/api/v1/auth")
    assert (await cliente.post("/api/v1/auth/renovar")).status_code == 401
    cliente.cookies.clear()

    assert (await _login(cliente, tecnico.correo)).status_code == 401
    nueva = await _login(cliente, tecnico.correo, CLAVE_NUEVA)
    assert nueva.status_code == 200
    yo = {"Authorization": f"Bearer {nueva.json()['access_token']}"}
    assert (await cliente.get("/api/v1/auth/yo", headers=yo)).status_code == 200


@pytest.mark.parametrize("cambios", [[{"rol": "productor"}], [{"activo": False}, {"activo": True}]])
async def test_cambiar_rol_o_reactivar_no_revive_sesiones_anteriores(
    cliente, agronomo, tecnico, cambios
):
    antiguo = encabezados(tecnico)
    for cambio in cambios:
        respuesta = await cliente.patch(
            f"{URL}/{tecnico.id}", json=cambio, headers=encabezados(agronomo)
        )
        assert respuesta.status_code == 200
    assert (await cliente.get("/api/v1/auth/yo", headers=antiguo)).status_code == 401


async def test_editar_el_nombre_no_cierra_sesiones(cliente, agronomo, tecnico):
    abierta = encabezados(tecnico)
    await cliente.patch(
        f"{URL}/{tecnico.id}", json={"nombre_completo": "Otro"}, headers=encabezados(agronomo)
    )
    assert (await cliente.get("/api/v1/auth/yo", headers=abierta)).status_code == 200


# --- Clave propia ---


@pytest.mark.parametrize("clave_actual", [None, "no-es-la-clave"])
async def test_cambiar_la_propia_clave_exige_la_actual(cliente, agronomo, clave_actual):
    cuerpo = {"clave": CLAVE_NUEVA} | ({"clave_actual": clave_actual} if clave_actual else {})
    respuesta = await cliente.patch(
        f"{URL}/{agronomo.id}", json=cuerpo, headers=encabezados(agronomo)
    )
    assert respuesta.status_code == 403
    assert respuesta.json()["detail"] == (
        "Para cambiar su propia contraseña escriba la contraseña actual"
    )


async def test_cambiar_la_propia_clave_con_la_actual_cierra_las_sesiones(cliente, agronomo):
    abierta = encabezados(agronomo)
    respuesta = await cliente.patch(
        f"{URL}/{agronomo.id}",
        json={"clave": CLAVE_NUEVA, "clave_actual": CLAVE},
        headers=abierta,
    )
    assert respuesta.status_code == 200
    assert (await cliente.get("/api/v1/auth/yo", headers=abierta)).status_code == 401
    assert (await _login(cliente, agronomo.correo, CLAVE_NUEVA)).status_code == 200


async def test_el_agronomo_restablece_la_clave_de_otro_sin_la_actual(cliente, agronomo, tecnico):
    respuesta = await cliente.patch(
        f"{URL}/{tecnico.id}", json={"clave": CLAVE_NUEVA}, headers=encabezados(agronomo)
    )
    assert respuesta.status_code == 200


# --- Auditoría de HU-08 ---


async def test_un_navegador_no_obtiene_la_renovacion_en_el_cuerpo(cliente, tecnico):
    # Un script inyectado que agregue X-Cliente: movil no cambia la cookie por un token legible.
    await _login(cliente, tecnico.correo)
    respuesta = await cliente.post("/api/v1/auth/renovar", headers={"X-Cliente": "movil"})
    assert respuesta.status_code == 401
    assert "refresh_token" not in respuesta.json()


async def test_un_cliente_movil_no_usa_la_cookie(cliente, tecnico):
    login = await _login(cliente, tecnico.correo)
    assert login.cookies["icota_renovacion"]
    # Con la cookie pero sin cuerpo, el cliente móvil no se renueva.
    sin_cuerpo = await cliente.post("/api/v1/auth/renovar", json={}, headers={"X-Cliente": "movil"})
    assert sin_cuerpo.status_code == 401


async def test_fallos_desde_otra_ip_no_bloquean_al_dueno(cliente, tecnico):
    atacante = AsyncClient(
        transport=ASGITransport(app=app, client=("198.51.100.9", 4444)), base_url="http://test"
    )
    async with atacante:
        for _ in range(5):
            await _login(atacante, tecnico.correo, "clave-equivocada")
        assert (await _login(atacante, tecnico.correo)).status_code == 429
    assert (await _login(cliente, tecnico.correo)).status_code == 200


async def test_muchas_ip_contra_una_cuenta_la_frenan(cliente, tecnico):
    for i in range(20):
        ip = AsyncClient(
            transport=ASGITransport(app=app, client=(f"198.51.100.{i + 1}", 4444)),
            base_url="http://test",
        )
        async with ip:
            await _login(ip, tecnico.correo, "clave-equivocada")
    assert (await _login(cliente, tecnico.correo)).status_code == 429


async def test_clave_actual_erronea_tiene_limite_de_intentos(cliente, agronomo):
    for _ in range(5):
        respuesta = await cliente.patch(
            f"{URL}/{agronomo.id}",
            json={"clave": CLAVE_NUEVA, "clave_actual": "no-es"},
            headers=encabezados(agronomo),
        )
        assert respuesta.status_code == 403
    bloqueado = await cliente.patch(
        f"{URL}/{agronomo.id}",
        json={"clave": CLAVE_NUEVA, "clave_actual": CLAVE},
        headers=encabezados(agronomo),
    )
    assert bloqueado.status_code == 429


def test_origen_ajeno_se_rechaza_en_produccion():
    produccion = Settings(
        environment="production",
        secret_key="x" * 40,
        qr_url_base="https://icota.co",
        cors_origins="https://icota.co",
    )
    assert not origen_permitido("POST", "https://evil.example", produccion)
    assert origen_permitido("POST", "https://icota.co", produccion)
    assert origen_permitido("POST", None, produccion)  # app móvil o curl
    assert origen_permitido("GET", "https://evil.example", produccion)
    assert origen_permitido("POST", "https://evil.example", Settings(environment="development"))


async def test_el_middleware_responde_403_a_un_origen_ajeno(cliente, monkeypatch, tecnico):
    produccion = Settings(
        environment="production",
        secret_key="x" * 40,
        qr_url_base="https://icota.co",
        cors_origins="https://icota.co",
    )
    monkeypatch.setattr(main, "get_settings", lambda: produccion)
    ajeno = await cliente.post(
        "/api/v1/auth/token",
        data={"username": tecnico.correo, "password": CLAVE},
        headers={"Origin": "https://evil.example"},
    )
    assert ajeno.status_code == 403
    assert ajeno.json()["detail"] == "Origen no permitido"
    propio = await cliente.post(
        "/api/v1/auth/token",
        data={"username": tecnico.correo, "password": CLAVE},
        headers={"Origin": "https://icota.co"},
    )
    assert propio.status_code == 200
