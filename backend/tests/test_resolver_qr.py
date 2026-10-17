"""Pruebas de la resolución del código QR leído en campo (HU-16)."""

import uuid
from datetime import date

import pytest
from sqlalchemy import func, update

from app.models.lote import Lote
from app.models.predio import Predio
from app.models.trampa import Trampa
from app.schemas.geo import PoligonoGeoJSON, PuntoGeoJSON, a_geometria
from tests.utilidades import encabezados

URL = "/api/v1/trampas/qr"
LOTE = {
    "type": "Polygon",
    "coordinates": [
        [[-72.640, 7.270], [-72.639, 7.270], [-72.639, 7.271], [-72.640, 7.271], [-72.640, 7.270]]
    ],
}


@pytest.fixture
async def trampa(session):
    for modelo in (Trampa, Lote, Predio):
        await session.execute(update(modelo).values(deleted_at=func.now()))
    predio = Predio(nombre="Finca", vereda="Icota", municipio="Cácota", area_ha=30)
    session.add(predio)
    await session.flush()
    lote = Lote(
        predio_id=predio.id,
        codigo="L-03",
        nombre="Rubidoux",
        area_ha=1.22,
        geom=a_geometria(PoligonoGeoJSON.model_validate(LOTE)),
    )
    session.add(lote)
    await session.flush()
    trampa = Trampa(
        lote_id=lote.id,
        codigo_ica="ICA-0031",
        codigo_qr="ABCD2345",
        tipo="jackson",
        atrayente="Trimedlure",
        fecha_instalacion=date(2026, 9, 3),
        estado="activa",
        geom=a_geometria(PuntoGeoJSON(type="Point", coordinates=(-72.6395, 7.2705))),
    )
    session.add(trampa)
    await session.flush()
    return trampa


@pytest.fixture
async def tecnico(crear_usuario):
    return await crear_usuario(f"tecnico.{uuid.uuid4().hex[:8]}@ejemplo.com", rol="tecnico")


async def test_sin_sesion_responde_401(cliente, trampa):
    assert (await cliente.get(f"{URL}/ABCD2345")).status_code == 401


@pytest.mark.parametrize("rol", ["tecnico", "productor", "agronomo"])
async def test_resuelve_trampa_y_lote_para_cualquier_rol(cliente, crear_usuario, trampa, rol):
    usuario = await crear_usuario(f"{rol}.{uuid.uuid4().hex[:8]}@ejemplo.com", rol=rol)
    respuesta = await cliente.get(f"{URL}/ABCD2345", headers=encabezados(usuario))
    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert cuerpo["trampa"]["id"] == str(trampa.id)
    assert cuerpo["trampa"]["codigo_ica"] == "ICA-0031"
    assert cuerpo["trampa"]["geom"] == {"type": "Point", "coordinates": [-72.6395, 7.2705]}
    assert cuerpo["lote"] == {"id": str(trampa.lote_id), "codigo": "L-03", "nombre": "Rubidoux"}
    # Se completan cuando existan las rutas (HU-19) y las lecturas (HU-25).
    assert cuerpo["ruta"] is None
    assert cuerpo["ultima_lectura"] is None


@pytest.mark.parametrize("codigo", ["abcd2345", " ABCD2345 ", "AbCd2345"])
async def test_no_distingue_mayusculas_ni_espacios(cliente, tecnico, trampa, codigo):
    respuesta = await cliente.get(f"{URL}/{codigo}", headers=encabezados(tecnico))
    assert respuesta.status_code == 200
    assert respuesta.json()["trampa"]["codigo_qr"] == "ABCD2345"


@pytest.mark.parametrize("codigo", ["ZZZZ2345", "ABCD234", "ABCD23450", "ABCD0345", "ABCD-345"])
async def test_codigo_inexistente_o_mal_formado_responde_404(cliente, tecnico, trampa, codigo):
    respuesta = await cliente.get(f"{URL}/{codigo}", headers=encabezados(tecnico))
    assert respuesta.status_code == 404
    assert respuesta.json()["detail"].startswith("No hay ninguna trampa con el código QR")


async def test_trampa_retirada_se_resuelve_e_indica_su_estado(cliente, tecnico, trampa, session):
    trampa.estado = "retirada"
    await session.flush()
    respuesta = await cliente.get(f"{URL}/ABCD2345", headers=encabezados(tecnico))
    assert respuesta.status_code == 200
    assert respuesta.json()["trampa"]["estado"] == "retirada"


async def test_trampa_eliminada_ya_no_se_resuelve(cliente, tecnico, trampa, session):
    trampa.deleted_at = func.now()
    await session.flush()
    respuesta = await cliente.get(f"{URL}/ABCD2345", headers=encabezados(tecnico))
    assert respuesta.status_code == 404


async def test_no_choca_con_la_ruta_por_id(cliente, tecnico, trampa):
    respuesta = await cliente.get(f"/api/v1/trampas/{trampa.id}", headers=encabezados(tecnico))
    assert respuesta.status_code == 200
    assert respuesta.json()["codigo_qr"] == "ABCD2345"
