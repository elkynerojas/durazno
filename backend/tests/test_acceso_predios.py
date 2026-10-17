"""Aislamiento entre predios (HU-39): un usuario no ve ni modifica nada de un predio que no
tiene asignado, aunque conozca los ids o el código QR. Todas las rutas responden 404 (no 403),
para no revelar que el recurso existe."""

import uuid
from datetime import date

import pytest

from app.models.lote import Lote
from app.models.predio import Predio
from app.models.trampa import Trampa
from app.schemas.geo import PoligonoGeoJSON, PuntoGeoJSON, a_geometria
from tests.utilidades import encabezados

ANILLO = [[-72.640, 7.270], [-72.639, 7.270], [-72.639, 7.271], [-72.640, 7.271], [-72.640, 7.270]]


@pytest.fixture
async def ajeno(session, predio_vacio, crear_usuario):
    """Trampa en `predio_vacio` y un agrónomo asignado solo a otro predio."""
    lote = Lote(
        predio_id=predio_vacio.id,
        codigo="L-1",
        area_ha=1.22,
        geom=a_geometria(PoligonoGeoJSON(type="Polygon", coordinates=[ANILLO])),
    )
    session.add(lote)
    await session.flush()
    trampa = Trampa(
        lote_id=lote.id,
        codigo_ica="ICA-SECRETA",
        codigo_qr="SEKR2345",
        tipo="jackson",
        atrayente="Trimedlure",
        fecha_instalacion=date(2026, 9, 3),
        estado="activa",
        geom=a_geometria(PuntoGeoJSON(type="Point", coordinates=(-72.6395, 7.2705))),
    )
    otro = Predio(nombre="Otra finca", vereda="X", municipio="Y", area_ha=5)
    session.add_all([trampa, otro])
    await session.flush()
    usuario = await crear_usuario(
        f"ajeno.{uuid.uuid4().hex[:8]}@ejemplo.com", rol="agronomo", predios=[otro]
    )
    return {"predio": predio_vacio, "lote": lote, "trampa": trampa, "usuario": usuario}


async def test_ningun_recurso_de_otro_predio_es_visible(cliente, ajeno):
    predio, lote, trampa = ajeno["predio"], ajeno["lote"], ajeno["trampa"]
    cabeceras = encabezados(ajeno["usuario"])
    v1 = "/api/v1"
    lecturas = [
        f"{v1}/predios/{predio.id}",
        f"{v1}/lotes?predio_id={predio.id}",
        f"{v1}/lotes/{lote.id}",
        f"{v1}/lotes/{lote.id}/trampas",
        f"{v1}/lotes/{lote.id}/etiquetas.pdf",
        f"{v1}/trampas?predio_id={predio.id}",
        f"{v1}/trampas/{trampa.id}",
        f"{v1}/trampas/{trampa.id}/qr.png",
        f"{v1}/trampas/{trampa.id}/qr.svg",
        f"{v1}/trampas/{trampa.id}/etiqueta.pdf",
        f"{v1}/trampas/{trampa.id}/qr/reemplazos",
        f"{v1}/trampas/qr/SEKR2345",
        f"{v1}/export/geojson?predio_id={predio.id}",
        f"{v1}/export/kml?lote_id={lote.id}",
    ]
    for url in lecturas:
        respuesta = await cliente.get(url, headers=cabeceras)
        assert respuesta.status_code == 404, url
        assert "ICA-SECRETA" not in respuesta.text, url


async def test_ninguna_escritura_sobre_otro_predio(cliente, ajeno):
    predio, lote, trampa = ajeno["predio"], ajeno["lote"], ajeno["trampa"]
    cabeceras = encabezados(ajeno["usuario"])
    v1 = "/api/v1"
    escrituras = [
        (
            "put",
            f"{v1}/predios/{predio.id}",
            {"nombre": "X", "vereda": "X", "municipio": "X", "area_ha": 1},
        ),
        ("patch", f"{v1}/lotes/{lote.id}", {"nombre": "X"}),
        ("delete", f"{v1}/lotes/{lote.id}", None),
        ("patch", f"{v1}/trampas/{trampa.id}", {"estado": "retirada"}),
        ("delete", f"{v1}/trampas/{trampa.id}", None),
        ("post", f"{v1}/trampas/{trampa.id}/qr/reemplazar", {}),
    ]
    for metodo, url, cuerpo in escrituras:
        argumentos = {"headers": cabeceras} | ({"json": cuerpo} if cuerpo is not None else {})
        respuesta = await getattr(cliente, metodo)(url, **argumentos)
        assert respuesta.status_code == 404, (metodo, url)


async def test_el_administrador_ve_todos_los_predios(cliente, ajeno, crear_usuario):
    admin = await crear_usuario(f"admin.{uuid.uuid4().hex[:8]}@ejemplo.com", rol="administrador")
    cabeceras = encabezados(admin)
    trampa = ajeno["trampa"]
    assert (await cliente.get(f"/api/v1/trampas/{trampa.id}", headers=cabeceras)).status_code == 200
    resuelta = await cliente.get("/api/v1/trampas/qr/SEKR2345", headers=cabeceras)
    assert resuelta.json()["trampa"]["codigo_ica"] == "ICA-SECRETA"
