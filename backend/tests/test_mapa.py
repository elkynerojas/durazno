"""Pruebas del mapa del predio con el estado de monitoreo (HU-18)."""

import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import func

from app.api.v1.endpoints import mapa
from app.models.lote import Lote
from app.models.predio import Predio
from app.models.trampa import Trampa
from app.schemas.geo import PoligonoGeoJSON, PuntoGeoJSON, a_geometria
from app.services.monitoreo import estado_monitoreo, monitoreo_trampa
from app.services.qr import generar_codigo
from tests.utilidades import encabezados

URL = "/api/v1/mapa"
HOY = date(2026, 11, 20)
A = [[-72.640, 7.270], [-72.639, 7.270], [-72.639, 7.271], [-72.640, 7.271], [-72.640, 7.270]]
B = [[-72.630, 7.270], [-72.629, 7.270], [-72.629, 7.271], [-72.630, 7.271], [-72.630, 7.270]]


# --- Cálculo del estado (casos a mano: revisión semanal, vencida desde 14 días) ---


@pytest.mark.parametrize(
    ("dias", "esperado"),
    [
        (0, "al_dia"),
        (6, "al_dia"),
        (7, "pendiente"),
        (13, "pendiente"),
        (14, "vencida"),
        (45, "vencida"),
    ],
)
def test_estado_por_dias_sin_revision(dias, esperado):
    assert estado_monitoreo(dias) == esperado


def test_la_ultima_lectura_manda_sobre_la_instalacion():
    # Instalada hace 30 días pero leída hace 2: al día.
    assert monitoreo_trampa("activa", HOY - timedelta(30), HOY - timedelta(2), HOY) == (
        "al_dia",
        2,
    )
    # Sin lecturas: cuenta desde la instalación.
    assert monitoreo_trampa("activa", HOY - timedelta(10), None, HOY) == ("pendiente", 10)


def test_instalacion_futura_cuenta_como_cero_dias():
    assert monitoreo_trampa("activa", HOY + timedelta(3), None, HOY) == ("al_dia", 0)


@pytest.mark.parametrize("estado", ["inactiva", "retirada"])
def test_las_trampas_no_activas_no_se_monitorean(estado):
    assert monitoreo_trampa(estado, HOY - timedelta(40), None, HOY) == (None, None)


# --- Endpoint ---


def _lote(predio, codigo, anillo, **extra):
    return Lote(
        predio_id=predio.id,
        codigo=codigo,
        area_ha=1.22,
        geom=a_geometria(PoligonoGeoJSON(type="Polygon", coordinates=[anillo])),
        **extra,
    )


def _trampa(lote, codigo, dias, estado="activa", tipo="jackson", **extra):
    return Trampa(
        lote_id=lote.id,
        codigo_ica=codigo,
        codigo_qr=generar_codigo(),
        tipo=tipo,
        atrayente="Trimedlure",
        fecha_instalacion=HOY - timedelta(days=dias),
        estado=estado,
        geom=a_geometria(PuntoGeoJSON(type="Point", coordinates=(-72.6395, 7.2705))),
        **extra,
    )


@pytest.fixture(autouse=True)
def _hoy_fijo(monkeypatch):
    monkeypatch.setattr(mapa, "hoy_bogota", lambda: HOY)


@pytest.fixture
async def datos(session, predio_vacio):
    lote_a = _lote(predio_vacio, "L-A", A, nombre="Alto", color="#4ade80")
    lote_b = _lote(predio_vacio, "L-B", B)
    borrado = _lote(predio_vacio, "L-X", B, deleted_at=func.now())
    session.add_all([lote_a, lote_b, borrado])
    await session.flush()
    session.add_all(
        [
            _trampa(lote_a, "ICA-01", 3),
            _trampa(lote_a, "ICA-02", 10, tipo="mcphail"),
            _trampa(lote_b, "ICA-03", 20),
            _trampa(lote_b, "ICA-04", 20, estado="inactiva"),
            _trampa(lote_b, "ICA-05", 20, deleted_at=func.now()),
        ]
    )
    await session.flush()
    return {"predio": predio_vacio, "lote_a": lote_a, "lote_b": lote_b}


@pytest.fixture
async def productor(crear_usuario, datos):
    return await crear_usuario(
        f"productor.{uuid.uuid4().hex[:8]}@ejemplo.com", rol="productor", predios=[datos["predio"]]
    )


def _por_elemento(coleccion, elemento):
    return [f for f in coleccion["features"] if f["properties"]["elemento"] == elemento]


async def test_sin_sesion_responde_401(cliente, datos):
    respuesta = await cliente.get(URL, params={"predio_id": str(datos["predio"].id)})
    assert respuesta.status_code == 401


async def test_sin_predio_ni_lote_responde_422(cliente, productor):
    assert (await cliente.get(URL, headers=encabezados(productor))).status_code == 422


async def test_mapa_del_predio_con_estado_de_monitoreo(cliente, datos, productor):
    respuesta = await cliente.get(
        URL, params={"predio_id": str(datos["predio"].id)}, headers=encabezados(productor)
    )
    assert respuesta.status_code == 200
    coleccion = respuesta.json()
    assert coleccion["type"] == "FeatureCollection"
    assert coleccion["fecha"] == "2026-11-20"
    assert coleccion["umbrales"] == {"dias_revision": 7, "dias_vencida": 14}

    lotes = _por_elemento(coleccion, "lote")
    assert [f["properties"]["codigo"] for f in lotes] == ["L-A", "L-B"]  # sin el borrado
    assert lotes[0]["properties"] == {
        "elemento": "lote",
        "id": str(datos["lote_a"].id),
        "codigo": "L-A",
        "nombre": "Alto",
        "area_ha": 1.22,
        "color": "#4ade80",
    }
    assert lotes[0]["geometry"] == {"type": "Polygon", "coordinates": [A]}

    trampas = {f["properties"]["codigo_ica"]: f for f in _por_elemento(coleccion, "trampa")}
    assert set(trampas) == {"ICA-01", "ICA-02", "ICA-03", "ICA-04"}  # sin la borrada
    estados = {
        codigo: (f["properties"]["monitoreo"], f["properties"]["dias_sin_revision"])
        for codigo, f in trampas.items()
    }
    assert estados == {
        "ICA-01": ("al_dia", 3),
        "ICA-02": ("pendiente", 10),
        "ICA-03": ("vencida", 20),
        "ICA-04": (None, None),
    }
    mcphail = trampas["ICA-02"]["properties"]
    assert (mcphail["tipo"], mcphail["lote_codigo"], mcphail["ultima_lectura"]) == (
        "mcphail",
        "L-A",
        None,
    )
    assert trampas["ICA-01"]["geometry"] == {"type": "Point", "coordinates": [-72.6395, 7.2705]}
    assert coleccion["resumen"] == {"al_dia": 1, "pendiente": 1, "vencida": 1, "no_activas": 1}


async def test_mapa_de_un_lote(cliente, datos, productor):
    respuesta = await cliente.get(
        URL, params={"lote_id": str(datos["lote_b"].id)}, headers=encabezados(productor)
    )
    coleccion = respuesta.json()
    assert [f["properties"]["codigo"] for f in _por_elemento(coleccion, "lote")] == ["L-B"]
    assert {f["properties"]["codigo_ica"] for f in _por_elemento(coleccion, "trampa")} == {
        "ICA-03",
        "ICA-04",
    }
    assert coleccion["resumen"] == {"al_dia": 0, "pendiente": 0, "vencida": 1, "no_activas": 1}


async def test_predio_o_lote_no_asignado_responde_404(cliente, crear_usuario, datos, session):
    otro = Predio(nombre="Otra finca", vereda="Icota", municipio="Cácota", area_ha=5)
    session.add(otro)
    await session.flush()
    ajeno = await crear_usuario(
        f"tecnico.{uuid.uuid4().hex[:8]}@ejemplo.com", rol="tecnico", predios=[otro]
    )
    por_predio = await cliente.get(
        URL, params={"predio_id": str(datos["predio"].id)}, headers=encabezados(ajeno)
    )
    por_lote = await cliente.get(
        URL, params={"lote_id": str(datos["lote_a"].id)}, headers=encabezados(ajeno)
    )
    assert (por_predio.status_code, por_lote.status_code) == (404, 404)


async def test_predio_sin_lotes(cliente, crear_usuario, predio_vacio):
    tecnico = await crear_usuario(
        f"tecnico.{uuid.uuid4().hex[:8]}@ejemplo.com", rol="tecnico", predios=[predio_vacio]
    )
    respuesta = await cliente.get(
        URL, params={"predio_id": str(predio_vacio.id)}, headers=encabezados(tecnico)
    )
    assert respuesta.status_code == 200
    assert respuesta.json()["features"] == []
