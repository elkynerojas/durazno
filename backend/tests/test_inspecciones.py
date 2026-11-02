"""Pruebas del módulo Inspección (E9): tipos de hallazgo (HU-40)."""

import uuid

import pytest

from tests.utilidades import encabezados

URL_TIPOS = "/api/v1/inspecciones/tipos"
POR_DEFECTO = [
    "Hongo o enfermedad",
    "Plaga",
    "Árbol enfermo o dañado",
    "Deficiencia nutricional",
    "Daño por clima",
    "Otra irregularidad",
]


def _correo(prefijo: str) -> str:
    return f"{prefijo}.{uuid.uuid4().hex[:8]}@ejemplo.com"


@pytest.fixture
async def admin(crear_usuario):
    return await crear_usuario(_correo("admin"), rol="administrador")


@pytest.fixture
async def agronomo(crear_usuario):
    return await crear_usuario(_correo("agronomo"), rol="agronomo")


async def test_tipos_por_defecto_para_cualquier_rol(cliente, crear_usuario):
    for rol in ("tecnico", "productor", "agronomo", "administrador"):
        usuario = await crear_usuario(_correo(rol), rol=rol)
        r = await cliente.get(URL_TIPOS, headers=encabezados(usuario))
        assert r.status_code == 200
        nombres = [t["nombre"] for t in r.json()]
        assert nombres[: len(POR_DEFECTO)] == POR_DEFECTO
        assert all(t["activo"] and t["color"].startswith("#") for t in r.json())


async def test_tipos_sin_sesion(cliente):
    assert (await cliente.get(URL_TIPOS)).status_code == 401
    assert (
        await cliente.post(URL_TIPOS, json={"nombre": "X", "color": "#000000"})
    ).status_code == 401


async def test_solo_el_administrador_crea_y_actualiza(cliente, agronomo, admin):
    datos = {"nombre": "Gomosis", "color": "#8E44AD"}
    r = await cliente.post(URL_TIPOS, json=datos, headers=encabezados(agronomo))
    assert r.status_code == 403

    r = await cliente.post(URL_TIPOS, json=datos, headers=encabezados(admin))
    assert r.status_code == 201
    tipo = r.json()
    assert tipo["nombre"] == "Gomosis" and tipo["color"] == "#8e44ad" and tipo["activo"]

    url = f"{URL_TIPOS}/{tipo['id']}"
    assert (
        await cliente.patch(url, json={"color": "#000000"}, headers=encabezados(agronomo))
    ).status_code == 403
    r = await cliente.patch(url, json={"nombre": "Gomosis del tronco"}, headers=encabezados(admin))
    assert r.status_code == 200 and r.json()["nombre"] == "Gomosis del tronco"


async def test_nombre_repetido_sin_distinguir_mayusculas(cliente, admin):
    r = await cliente.post(
        URL_TIPOS, json={"nombre": "plaga", "color": "#000000"}, headers=encabezados(admin)
    )
    assert r.status_code == 409
    assert r.json()["detail"] == "Ya existe un tipo de hallazgo con ese nombre"

    r = await cliente.post(
        URL_TIPOS, json={"nombre": "Ácaros", "color": "#000000"}, headers=encabezados(admin)
    )
    r = await cliente.patch(
        f"{URL_TIPOS}/{r.json()['id']}", json={"nombre": " PLAGA "}, headers=encabezados(admin)
    )
    assert r.status_code == 409


async def test_desactivar_lo_quita_de_la_lista(cliente, admin, agronomo):
    r = await cliente.post(
        URL_TIPOS, json={"nombre": "Temporal", "color": "#123456"}, headers=encabezados(admin)
    )
    url = f"{URL_TIPOS}/{r.json()['id']}"
    r = await cliente.patch(url, json={"activo": False}, headers=encabezados(admin))
    assert r.status_code == 200 and r.json()["activo"] is False

    visibles = await cliente.get(URL_TIPOS, headers=encabezados(agronomo))
    assert "Temporal" not in [t["nombre"] for t in visibles.json()]
    # `todos` solo aplica al administrador.
    visibles = await cliente.get(URL_TIPOS, params={"todos": True}, headers=encabezados(agronomo))
    assert "Temporal" not in [t["nombre"] for t in visibles.json()]
    todos = await cliente.get(URL_TIPOS, params={"todos": True}, headers=encabezados(admin))
    assert "Temporal" in [t["nombre"] for t in todos.json()]


async def test_crear_tipo_idempotente_por_id(cliente, admin):
    datos = {"id": str(uuid.uuid4()), "nombre": "Antracnosis", "color": "#334455"}
    primero = await cliente.post(URL_TIPOS, json=datos, headers=encabezados(admin))
    segundo = await cliente.post(URL_TIPOS, json=datos, headers=encabezados(admin))
    assert primero.status_code == 201 and segundo.status_code == 200
    assert primero.json()["id"] == segundo.json()["id"] == datos["id"]


async def test_datos_invalidos_y_tipo_inexistente(cliente, admin):
    for datos in (
        {"nombre": "", "color": "#000000"},
        {"nombre": "Sin color"},
        {"nombre": "Color malo", "color": "rojo"},
        {"nombre": "Campo extra", "color": "#000000", "activo": False},
    ):
        r = await cliente.post(URL_TIPOS, json=datos, headers=encabezados(admin))
        assert r.status_code == 422, datos
    r = await cliente.patch(
        f"{URL_TIPOS}/{uuid.uuid4()}", json={"activo": False}, headers=encabezados(admin)
    )
    assert r.status_code == 404
