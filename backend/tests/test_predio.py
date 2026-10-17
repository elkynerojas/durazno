"""Pruebas del registro del predio (HU-07)."""

import uuid

import pytest
from sqlalchemy import func, select, update

from app.models.predio import Predio
from tests.utilidades import encabezados

URL = "/api/v1/predio"

# Cuadrado de ~1 km en Cácota, en [longitud, latitud].
LIMITE = {
    "type": "Polygon",
    "coordinates": [
        [[-72.59, 7.26], [-72.58, 7.26], [-72.58, 7.27], [-72.59, 7.27], [-72.59, 7.26]]
    ],
}
# Corbatín: los bordes se cruzan.
LIMITE_INVALIDO = {
    "type": "Polygon",
    "coordinates": [
        [[-72.59, 7.26], [-72.58, 7.27], [-72.58, 7.26], [-72.59, 7.27], [-72.59, 7.26]]
    ],
}


def _datos(**cambios) -> dict:
    datos = {
        "nombre": "Finca Icota",
        "vereda": "Icota",
        "municipio": "Cácota",
        "registro_ica": "54125-ICA-001",
        "area_ha": 32.5,
    }
    return {**datos, **cambios}


@pytest.fixture(autouse=True)
async def _sin_predio(session):
    # La base de desarrollo puede tener el predio real; dentro de la transacción se oculta.
    await session.execute(update(Predio).values(deleted_at=func.now()))
    await session.flush()


@pytest.fixture
async def agronomo(crear_usuario):
    return await crear_usuario(f"agronomo.{uuid.uuid4().hex[:8]}@ejemplo.com", rol="agronomo")


async def test_sin_sesion_responde_401(cliente):
    assert (await cliente.get(URL)).status_code == 401
    assert (await cliente.put(URL, json=_datos())).status_code == 401


@pytest.mark.parametrize("rol", ["tecnico", "productor"])
async def test_solo_el_agronomo_registra_el_predio(cliente, crear_usuario, rol):
    otro = await crear_usuario(f"{rol}.{uuid.uuid4().hex[:8]}@ejemplo.com", rol=rol)
    assert (await cliente.put(URL, json=_datos(), headers=encabezados(otro))).status_code == 403


async def test_sin_predio_registrado_responde_404(cliente, agronomo):
    respuesta = await cliente.get(URL, headers=encabezados(agronomo))
    assert respuesta.status_code == 404
    assert respuesta.json()["detail"] == "El predio aún no se ha registrado"


async def test_registrar_y_consultar_con_cualquier_rol(cliente, agronomo, crear_usuario):
    creado = await cliente.put(URL, json=_datos(limite=LIMITE), headers=encabezados(agronomo))
    assert creado.status_code == 201
    cuerpo = creado.json()
    assert cuerpo["area_ha"] == 32.5
    assert cuerpo["limite"] == LIMITE

    productor = await crear_usuario(f"productor.{uuid.uuid4().hex[:8]}@ejemplo.com", "productor")
    consulta = await cliente.get(URL, headers=encabezados(productor))
    assert consulta.status_code == 200
    assert consulta.json() == cuerpo


async def test_limite_opcional_y_se_puede_quitar(cliente, agronomo):
    sin_limite = await cliente.put(URL, json=_datos(), headers=encabezados(agronomo))
    assert sin_limite.status_code == 201
    assert sin_limite.json()["limite"] is None

    con_limite = await cliente.put(URL, json=_datos(limite=LIMITE), headers=encabezados(agronomo))
    assert con_limite.json()["limite"] == LIMITE
    quitado = await cliente.put(URL, json=_datos(limite=None), headers=encabezados(agronomo))
    assert quitado.json()["limite"] is None


async def test_existe_un_unico_predio(cliente, agronomo, session):
    primero = await cliente.put(URL, json=_datos(), headers=encabezados(agronomo))
    segundo = await cliente.put(
        URL, json=_datos(nombre="Finca Icota Alta"), headers=encabezados(agronomo)
    )
    assert primero.status_code == 201
    assert segundo.status_code == 200
    assert segundo.json()["id"] == primero.json()["id"]
    assert segundo.json()["nombre"] == "Finca Icota Alta"
    activos = await session.scalar(
        select(func.count()).select_from(Predio).where(Predio.deleted_at.is_(None))
    )
    assert activos == 1

    otro_id = await cliente.put(
        URL, json=_datos(id=str(uuid.uuid4())), headers=encabezados(agronomo)
    )
    assert otro_id.status_code == 409


async def test_registrar_es_idempotente_por_id(cliente, agronomo):
    datos = _datos(id=str(uuid.uuid4()))
    primera = await cliente.put(URL, json=datos, headers=encabezados(agronomo))
    segunda = await cliente.put(URL, json=datos, headers=encabezados(agronomo))
    assert (primera.status_code, segunda.status_code) == (201, 200)
    assert primera.json()["id"] == segunda.json()["id"] == datos["id"]


async def test_poligono_que_se_cruza_responde_422(cliente, agronomo):
    respuesta = await cliente.put(
        URL, json=_datos(limite=LIMITE_INVALIDO), headers=encabezados(agronomo)
    )
    assert respuesta.status_code == 422
    assert respuesta.json()["detail"] == "El polígono no es válido: sus bordes se cruzan entre sí"


@pytest.mark.parametrize(
    "cambio",
    [
        {"area_ha": 0},
        {"nombre": "  "},
        {"municipio": None},
        {"rol": "agronomo"},
        {"limite": {"type": "Point", "coordinates": [-72.58, 7.26]}},
        # Anillo sin cerrar.
        {"limite": {"type": "Polygon", "coordinates": [LIMITE["coordinates"][0][:-1] * 2]}},
        {"limite": {"type": "Polygon", "coordinates": [[[-200, 7.26]] * 4]}},
    ],
)
async def test_datos_invalidos_responden_422(cliente, agronomo, cambio):
    respuesta = await cliente.put(URL, json=_datos(**cambio), headers=encabezados(agronomo))
    assert respuesta.status_code == 422


async def test_predio_borrado_no_se_consulta(cliente, agronomo, session):
    await cliente.put(URL, json=_datos(), headers=encabezados(agronomo))
    await session.execute(update(Predio).values(deleted_at=func.now()))
    await session.flush()
    assert (await cliente.get(URL, headers=encabezados(agronomo))).status_code == 404
