"""Pruebas de la exportación a GeoJSON y KML (HU-13)."""

import uuid
import xml.etree.ElementTree as ET
from datetime import date

import pytest
from sqlalchemy import func, update

from app.models.lote import Lote
from app.models.predio import Predio
from app.models.trampa import Trampa
from app.schemas.geo import PoligonoGeoJSON, PuntoGeoJSON, a_geometria
from app.services.qr import generar_codigo
from tests.utilidades import encabezados, predio_de_lote

KML = {"k": "http://www.opengis.net/kml/2.2"}
A = [[-72.640, 7.270], [-72.639, 7.270], [-72.639, 7.271], [-72.640, 7.271], [-72.640, 7.270]]
B = [[-72.630, 7.270], [-72.629, 7.270], [-72.629, 7.271], [-72.630, 7.271], [-72.630, 7.270]]


def _lote(predio, codigo, anillo, nombre=None):
    return Lote(
        predio_id=predio.id,
        codigo=codigo,
        nombre=nombre,
        area_ha=1.22,
        geom=a_geometria(PoligonoGeoJSON(type="Polygon", coordinates=[anillo])),
    )


@pytest.fixture
async def datos(session):
    for modelo in (Trampa, Lote, Predio):
        await session.execute(update(modelo).values(deleted_at=func.now()))
    predio = Predio(nombre="Finca Icota", vereda="Icota", municipio="Cácota", area_ha=30)
    session.add(predio)
    await session.flush()
    # Nombre con caracteres que romperían un XML sin escapar.
    lote_a = _lote(predio, "L-A", A, nombre='Alto <b>"&</b> ]]>')
    lote_b = _lote(predio, "L-B", B)
    session.add_all([lote_a, lote_b])
    await session.flush()
    trampa = Trampa(
        lote_id=lote_a.id,
        codigo_ica="ICA-0031",
        codigo_qr=generar_codigo(),
        tipo="jackson",
        atrayente="Trimedlure",
        fecha_instalacion=date(2026, 9, 3),
        estado="activa",
        precision_m=4.5,
        geom=a_geometria(PuntoGeoJSON(type="Point", coordinates=(-72.6395, 7.2705))),
    )
    borrada = Trampa(
        lote_id=lote_b.id,
        codigo_ica="ICA-BORRADA",
        codigo_qr=generar_codigo(),
        tipo="mcphail",
        atrayente="Proteína",
        fecha_instalacion=date(2026, 9, 3),
        estado="activa",
        geom=a_geometria(PuntoGeoJSON(type="Point", coordinates=(-72.6295, 7.2705))),
        deleted_at=func.now(),
    )
    session.add_all([trampa, borrada])
    await session.flush()
    return {"lote_a": lote_a, "lote_b": lote_b, "trampa": trampa}


@pytest.fixture
async def productor(crear_usuario, session, datos):
    return await crear_usuario(
        f"productor.{uuid.uuid4().hex[:8]}@ejemplo.com",
        rol="productor",
        predios=[await predio_de_lote(session, datos["lote_a"].id)],
    )


async def test_sin_sesion_responde_401(cliente, datos):
    assert (await cliente.get("/api/v1/export/geojson")).status_code == 401
    assert (await cliente.get("/api/v1/export/kml")).status_code == 401


async def test_geojson_del_predio_conforme_a_rfc_7946(cliente, datos, productor):
    respuesta = await cliente.get(
        "/api/v1/export/geojson",
        params={"predio_id": str(datos["lote_a"].predio_id)},
        headers=encabezados(productor),
    )
    assert respuesta.status_code == 200
    assert respuesta.headers["content-type"] == "application/geo+json"
    assert respuesta.headers["content-disposition"] == 'attachment; filename="Finca-Icota.geojson"'

    coleccion = respuesta.json()
    assert coleccion["type"] == "FeatureCollection"
    assert "crs" not in coleccion  # RFC 7946: siempre WGS 84, sin miembro crs
    lotes = [f for f in coleccion["features"] if f["properties"]["elemento"] == "lote"]
    trampas = [f for f in coleccion["features"] if f["properties"]["elemento"] == "trampa"]
    assert [lote["properties"]["codigo"] for lote in lotes] == ["L-A", "L-B"]
    assert lotes[0]["geometry"] == {"type": "Polygon", "coordinates": [A]}
    assert lotes[0]["properties"]["area_ha"] == 1.22
    [trampa] = trampas  # la borrada no se exporta
    assert trampa["geometry"] == {"type": "Point", "coordinates": [-72.6395, 7.2705]}
    esperado = {
        "codigo_ica": "ICA-0031",
        "tipo": "jackson",
        "estado": "activa",
        "lote": "L-A",
        "precision_m": 4.5,
        "fecha_instalacion": "2026-09-03",
    }
    assert {clave: trampa["properties"][clave] for clave in esperado} == esperado


async def test_geojson_de_un_lote(cliente, datos, productor):
    respuesta = await cliente.get(
        "/api/v1/export/geojson",
        params={"lote_id": str(datos["lote_b"].id)},
        headers=encabezados(productor),
    )
    elementos = respuesta.json()["features"]
    assert [f["properties"].get("codigo") for f in elementos] == ["L-B"]
    assert respuesta.headers["content-disposition"] == (
        'attachment; filename="Finca-Icota_lote-L-B.geojson"'
    )


async def test_kml_valido_con_carpetas_y_texto_escapado(cliente, datos, productor):
    respuesta = await cliente.get(
        "/api/v1/export/kml",
        params={"predio_id": str(datos["lote_a"].predio_id)},
        headers=encabezados(productor),
    )
    assert respuesta.status_code == 200
    assert respuesta.headers["content-type"] == "application/vnd.google-earth.kml+xml"

    raiz = ET.fromstring(respuesta.content)  # noqa: S314 - XML generado por la propia API
    carpetas = {c.find("k:name", KML).text: c for c in raiz.iterfind("k:Document/k:Folder", KML)}
    lotes = carpetas["Lotes"].findall("k:Placemark", KML)
    trampas = carpetas["Trampas"].findall("k:Placemark", KML)
    assert [p.find("k:name", KML).text for p in lotes] == ["L-A", "L-B"]
    assert [p.find("k:name", KML).text for p in trampas] == ["ICA-0031"]
    # El nombre con < > " & ]]> llega intacto como texto, sin romper el documento.
    assert lotes[0].find("k:description", KML).text.startswith('Alto <b>"&</b> ]]>')
    # KML también usa longitud,latitud.
    punto = trampas[0].find("k:Point/k:coordinates", KML).text
    assert punto.strip() == "-72.6395,7.2705"
    assert trampas[0].find("k:styleUrl", KML).text == "#trampa-jackson"


async def test_lote_inexistente_responde_404(cliente, datos, productor):
    for formato in ("geojson", "kml"):
        respuesta = await cliente.get(
            f"/api/v1/export/{formato}",
            params={"lote_id": str(uuid.uuid4())},
            headers=encabezados(productor),
        )
        assert respuesta.status_code == 404
