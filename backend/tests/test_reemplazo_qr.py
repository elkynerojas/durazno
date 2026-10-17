"""Pruebas de reimprimir y reemplazar la etiqueta QR de una trampa (HU-17)."""

import uuid
from datetime import date

import pypdfium2 as pdfium
import pytest
import zxingcpp
from sqlalchemy import func, update

from app.api.v1.endpoints import trampas as endpoints
from app.models.lote import Lote
from app.models.predio import Predio
from app.models.trampa import Trampa
from app.schemas.geo import PoligonoGeoJSON, PuntoGeoJSON, a_geometria
from app.services.qr import url_trampa
from tests.utilidades import encabezados, predio_de_lote

ANILLO = [[-72.640, 7.270], [-72.639, 7.270], [-72.639, 7.271], [-72.640, 7.271], [-72.640, 7.270]]


@pytest.fixture
async def trampa(session):
    for modelo in (Trampa, Lote, Predio):
        await session.execute(update(modelo).values(deleted_at=func.now()))
    predio = Predio(nombre="Finca Icota", vereda="Icota", municipio="Cácota", area_ha=30)
    session.add(predio)
    await session.flush()
    lote = Lote(
        predio_id=predio.id,
        codigo="L-03",
        area_ha=1.22,
        geom=a_geometria(PoligonoGeoJSON(type="Polygon", coordinates=[ANILLO])),
    )
    session.add(lote)
    await session.flush()
    trampa = Trampa(
        lote_id=lote.id,
        codigo_ica="ICA-0031",
        codigo_qr="VEJA2345",
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
async def tecnico(crear_usuario, session, trampa):
    return await crear_usuario(
        f"tecnico.{uuid.uuid4().hex[:8]}@ejemplo.com",
        rol="tecnico",
        predios=[await predio_de_lote(session, trampa.lote_id)],
    )


def _reemplazar(cliente, trampa, usuario, **cuerpo):
    return cliente.post(
        f"/api/v1/trampas/{trampa.id}/qr/reemplazar", json=cuerpo, headers=encabezados(usuario)
    )


async def test_reimprimir_conserva_el_codigo(cliente, trampa, tecnico):
    respuesta = await cliente.get(
        f"/api/v1/trampas/{trampa.id}/etiqueta.pdf", headers=encabezados(tecnico)
    )
    assert respuesta.status_code == 200
    assert respuesta.headers["content-type"] == "application/pdf"
    imagen = pdfium.PdfDocument(respuesta.content)[0].render(scale=200 / 72).to_pil()
    [leido] = zxingcpp.read_barcodes(imagen)
    assert leido.text == url_trampa("VEJA2345")


async def test_reemplazar_genera_codigo_nuevo_e_invalida_el_anterior(cliente, trampa, tecnico):
    respuesta = await _reemplazar(cliente, trampa, tecnico, motivo="Etiqueta borrosa por la lluvia")
    assert respuesta.status_code == 200
    nuevo = respuesta.json()["codigo_qr"]
    assert nuevo != "VEJA2345"

    anterior = await cliente.get("/api/v1/trampas/qr/VEJA2345", headers=encabezados(tecnico))
    assert anterior.status_code == 410
    assert anterior.json()["detail"].startswith("La etiqueta VEJA2345 fue reemplazada el ")
    assert "ICA-0031" in anterior.json()["detail"]
    vigente = await cliente.get(f"/api/v1/trampas/qr/{nuevo}", headers=encabezados(tecnico))
    assert vigente.json()["trampa"]["id"] == str(trampa.id)


async def test_queda_historial_de_los_reemplazos(cliente, trampa, tecnico):
    primero = (await _reemplazar(cliente, trampa, tecnico, motivo="Rota")).json()["codigo_qr"]
    segundo = (await _reemplazar(cliente, trampa, tecnico)).json()["codigo_qr"]

    historial = await cliente.get(
        f"/api/v1/trampas/{trampa.id}/qr/reemplazos", headers=encabezados(tecnico)
    )
    assert historial.status_code == 200
    filas = historial.json()
    assert [(f["codigo_anterior"], f["codigo_nuevo"]) for f in filas] == [
        (primero, segundo),
        ("VEJA2345", primero),
    ]
    assert filas[1]["motivo"] == "Rota"
    assert filas[0]["responsable"] == "Persona de Prueba"


async def test_reenviar_el_mismo_id_no_genera_otro_codigo(cliente, trampa, tecnico):
    id_cliente = str(uuid.uuid4())
    primera = (await _reemplazar(cliente, trampa, tecnico, id=id_cliente)).json()
    segunda = (await _reemplazar(cliente, trampa, tecnico, id=id_cliente)).json()
    assert primera["codigo_qr"] == segunda["codigo_qr"]


async def test_los_codigos_retirados_no_se_reutilizan(cliente, trampa, tecnico, monkeypatch):
    # El generador propone primero el código retirado; debe descartarlo.
    await _reemplazar(cliente, trampa, tecnico)
    propuestas = iter(["VEJA2345", "NUEV2345"])
    monkeypatch.setattr(endpoints, "generar_codigo", lambda: next(propuestas))
    respuesta = await _reemplazar(cliente, trampa, tecnico)
    assert respuesta.json()["codigo_qr"] == "NUEV2345"


async def test_el_productor_no_reemplaza_y_sin_sesion_401(session, cliente, crear_usuario, trampa):
    productor = await crear_usuario(
        f"p.{uuid.uuid4().hex[:8]}@ejemplo.com",
        rol="productor",
        predios=[await predio_de_lote(session, trampa.lote_id)],
    )
    assert (await _reemplazar(cliente, trampa, productor)).status_code == 403
    url = f"/api/v1/trampas/{trampa.id}/qr/reemplazar"
    assert (await cliente.post(url, json={})).status_code == 401


async def test_una_trampa_retirada_no_necesita_etiqueta_nueva(cliente, trampa, tecnico, session):
    trampa.estado = "retirada"
    await session.flush()
    respuesta = await _reemplazar(cliente, trampa, tecnico)
    assert respuesta.status_code == 409


async def test_trampa_inexistente_responde_404(cliente, tecnico, trampa):
    otra = uuid.uuid4()
    url = f"/api/v1/trampas/{otra}"
    assert (
        await cliente.post(f"{url}/qr/reemplazar", json={}, headers=encabezados(tecnico))
    ).status_code == 404
    assert (
        await cliente.get(f"{url}/qr/reemplazos", headers=encabezados(tecnico))
    ).status_code == 404
    assert (
        await cliente.get(f"{url}/etiqueta.pdf", headers=encabezados(tecnico))
    ).status_code == 404


async def test_motivo_demasiado_largo_responde_422(cliente, trampa, tecnico):
    respuesta = await _reemplazar(cliente, trampa, tecnico, motivo="x" * 201)
    assert respuesta.status_code == 422
    historial = await cliente.get(
        f"/api/v1/trampas/{trampa.id}/qr/reemplazos", headers=encabezados(tecnico)
    )
    assert historial.json() == []
