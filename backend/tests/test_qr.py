"""Pruebas del QR de cada trampa (HU-14)."""

import io
import re
import uuid
from datetime import date

import pytest
import zxingcpp
from PIL import Image
from sqlalchemy import func, update
from sqlalchemy.exc import IntegrityError

from app.core.config import Settings
from app.models.lote import Lote
from app.models.predio import Predio
from app.models.trampa import Trampa
from app.schemas.geo import PoligonoGeoJSON, PuntoGeoJSON, a_geometria
from app.services import qr
from tests.utilidades import encabezados, predio_de_lote

URL = "/api/v1/trampas"
LOTE = {
    "type": "Polygon",
    "coordinates": [
        [[-72.640, 7.270], [-72.639, 7.270], [-72.639, 7.271], [-72.640, 7.271], [-72.640, 7.270]]
    ],
}
CODIGO_VALIDO = re.compile(r"^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$")


@pytest.fixture
async def lote(session):
    for modelo in (Trampa, Lote, Predio):
        await session.execute(update(modelo).values(deleted_at=func.now()))
    predio = Predio(nombre="Finca", vereda="Icota", municipio="Cácota", area_ha=30)
    session.add(predio)
    await session.flush()
    lote = Lote(
        predio_id=predio.id,
        codigo="L-A",
        area_ha=1.22,
        geom=a_geometria(PoligonoGeoJSON.model_validate(LOTE)),
    )
    session.add(lote)
    await session.flush()
    return lote


@pytest.fixture
async def agronomo(crear_usuario, session, lote):
    return await crear_usuario(
        f"agronomo.{uuid.uuid4().hex[:8]}@ejemplo.com",
        rol="agronomo",
        predios=[await predio_de_lote(session, lote.id)],
    )


async def _crear(cliente, agronomo, lote, **cambios):
    datos = {
        "lote_id": str(lote.id),
        "codigo_ica": f"ICA-{uuid.uuid4().hex[:6]}",
        "tipo": "jackson",
        "atrayente": "Trimedlure",
        "fecha_instalacion": "2026-10-15",
        "geom": {"type": "Point", "coordinates": [-72.6395, 7.2705]},
        **cambios,
    }
    respuesta = await cliente.post(URL, json=datos, headers=encabezados(agronomo))
    assert respuesta.status_code == 201, respuesta.text
    return respuesta.json()


def _decodificar_png(contenido: bytes) -> str:
    [resultado] = zxingcpp.read_barcodes(Image.open(io.BytesIO(contenido)))
    assert resultado.format == zxingcpp.BarcodeFormat.QRCode
    return resultado.text


# --- Servicio ---


def test_codigo_corto_sin_caracteres_ambiguos():
    codigos = {qr.generar_codigo() for _ in range(2000)}
    assert all(CODIGO_VALIDO.match(c) for c in codigos)
    assert not set("".join(codigos)) & set("01OIL")
    assert len(codigos) == 2000


def test_el_qr_codifica_solo_la_url_corta(monkeypatch):
    monkeypatch.setattr(
        qr, "get_settings", lambda: Settings(qr_url_base="https://icota.ejemplo.co/")
    )
    assert qr.url_trampa("ABCD2345") == "https://icota.ejemplo.co/t/ABCD2345"
    assert _decodificar_png(qr.qr_png("ABCD2345")) == "https://icota.ejemplo.co/t/ABCD2345"


def test_correccion_de_errores_nivel_q_o_superior():
    assert qr.crear_qr("ABCD2345").error in {"Q", "H"}


# --- API ---


async def test_crear_asigna_un_codigo_qr_unico(cliente, agronomo, lote):
    primera = await _crear(cliente, agronomo, lote)
    segunda = await _crear(cliente, agronomo, lote)
    assert CODIGO_VALIDO.match(primera["codigo_qr"])
    assert primera["codigo_qr"] != segunda["codigo_qr"]


async def test_el_cliente_no_puede_fijar_el_codigo_qr(cliente, agronomo, lote):
    datos = {
        "lote_id": str(lote.id),
        "codigo_ica": "ICA-QR",
        "tipo": "jackson",
        "atrayente": "Trimedlure",
        "fecha_instalacion": "2026-10-15",
        "geom": {"type": "Point", "coordinates": [-72.6395, 7.2705]},
        "codigo_qr": "AAAAAAAA",
    }
    respuesta = await cliente.post(URL, json=datos, headers=encabezados(agronomo))
    assert respuesta.status_code == 422
    url = f"{URL}/{uuid.uuid4()}"
    parche = await cliente.patch(url, json={"codigo_qr": "AAAAAAAA"}, headers=encabezados(agronomo))
    assert parche.status_code == 422


async def test_el_codigo_no_cambia_al_mover_la_trampa(cliente, agronomo, lote):
    trampa = await _crear(cliente, agronomo, lote)
    movida = await cliente.patch(
        f"{URL}/{trampa['id']}",
        json={"geom": {"type": "Point", "coordinates": [-72.6392, 7.2708]}},
        headers=encabezados(agronomo),
    )
    assert movida.status_code == 200
    assert movida.json()["codigo_qr"] == trampa["codigo_qr"]


async def test_reenviar_el_mismo_id_conserva_el_codigo(cliente, agronomo, lote):
    id_cliente = str(uuid.uuid4())
    primera = await _crear(cliente, agronomo, lote, id=id_cliente, codigo_ica="ICA-IDEM")
    segunda = await cliente.post(
        URL,
        json={
            "id": id_cliente,
            "lote_id": str(lote.id),
            "codigo_ica": "ICA-IDEM",
            "tipo": "jackson",
            "atrayente": "Trimedlure",
            "fecha_instalacion": "2026-10-15",
            "geom": {"type": "Point", "coordinates": [-72.6395, 7.2705]},
        },
        headers=encabezados(agronomo),
    )
    assert segunda.json()["codigo_qr"] == primera["codigo_qr"]


@pytest.mark.parametrize("rol", ["tecnico", "productor", "agronomo"])
async def test_descargar_png_que_se_decodifica_a_la_url(
    session, cliente, crear_usuario, agronomo, lote, rol
):
    trampa = await _crear(cliente, agronomo, lote)
    usuario = await crear_usuario(
        f"{rol}.{uuid.uuid4().hex[:8]}@ejemplo.com",
        rol=rol,
        predios=[await predio_de_lote(session, lote.id)],
    )
    respuesta = await cliente.get(f"{URL}/{trampa['id']}/qr.png", headers=encabezados(usuario))
    assert respuesta.status_code == 200
    assert respuesta.headers["content-type"] == "image/png"
    assert respuesta.headers["content-disposition"] == (
        f'attachment; filename="qr-trampa-{trampa["codigo_qr"]}.png"'
    )
    assert _decodificar_png(respuesta.content) == qr.url_trampa(trampa["codigo_qr"])


async def test_descargar_svg(cliente, agronomo, lote):
    trampa = await _crear(cliente, agronomo, lote)
    respuesta = await cliente.get(f"{URL}/{trampa['id']}/qr.svg", headers=encabezados(agronomo))
    assert respuesta.status_code == 200
    assert respuesta.headers["content-type"].startswith("image/svg+xml")
    assert respuesta.text.startswith("<svg")
    assert respuesta.content == qr.qr_svg(trampa["codigo_qr"])


async def test_qr_sin_sesion_o_de_trampa_inexistente_o_borrada(cliente, agronomo, lote, session):
    trampa = await _crear(cliente, agronomo, lote)
    assert (await cliente.get(f"{URL}/{trampa['id']}/qr.svg")).status_code == 401
    inexistente = await cliente.get(f"{URL}/{uuid.uuid4()}/qr.png", headers=encabezados(agronomo))
    assert inexistente.status_code == 404
    borrada = await cliente.delete(f"{URL}/{trampa['id']}", headers=encabezados(agronomo))
    assert borrada.status_code == 204
    despues = await cliente.get(f"{URL}/{trampa['id']}/qr.png", headers=encabezados(agronomo))
    assert despues.status_code == 404


async def test_el_codigo_de_una_trampa_borrada_no_se_reutiliza(session, lote):
    def nueva(codigo_ica: str) -> Trampa:
        return Trampa(
            lote_id=lote.id,
            codigo_ica=codigo_ica,
            codigo_qr="ZZZZ2345",
            tipo="jackson",
            atrayente="Trimedlure",
            fecha_instalacion=date(2026, 10, 1),
            geom=a_geometria(PuntoGeoJSON(type="Point", coordinates=(-72.6395, 7.2705))),
        )

    borrada = nueva("ICA-BORRADA")
    borrada.deleted_at = func.now()
    session.add(borrada)
    await session.flush()

    session.add(nueva("ICA-NUEVA"))
    with pytest.raises(IntegrityError, match="uq_trampa_codigo_qr"):
        await session.flush()
