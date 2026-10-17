"""Pruebas del PDF de etiquetas QR de un lote (HU-15)."""

import math
import uuid
from datetime import date

import pypdfium2 as pdfium
import pytest
import zxingcpp
from sqlalchemy import func, update

from app.models.lote import Lote
from app.models.predio import Predio
from app.models.trampa import Trampa
from app.schemas.geo import PoligonoGeoJSON, PuntoGeoJSON, a_geometria
from app.services.etiquetas import Etiqueta, generar_pdf
from app.services.qr import generar_codigo, url_trampa
from tests.utilidades import encabezados

PPP = 200  # resolución a la que se "imprime" el PDF para leerlo
LOTE = {
    "type": "Polygon",
    "coordinates": [
        [[-72.640, 7.270], [-72.639, 7.270], [-72.639, 7.271], [-72.640, 7.271], [-72.640, 7.270]]
    ],
}


def _leer(pdf: bytes) -> list[dict]:
    """Por cada página: texto y QR decodificados con su lado en centímetros."""
    paginas = []
    for pagina in pdfium.PdfDocument(pdf):
        imagen = pagina.render(scale=PPP / 72).to_pil()
        codigos = []
        for leido in zxingcpp.read_barcodes(imagen):
            p = leido.position
            lado_px = math.dist((p.top_left.x, p.top_left.y), (p.top_right.x, p.top_right.y))
            codigos.append({"texto": leido.text, "lado_cm": lado_px / PPP * 2.54})
        paginas.append({"texto": pagina.get_textpage().get_text_bounded(), "qr": codigos})
    return paginas


def _etiquetas(n: int) -> list[Etiqueta]:
    return [
        Etiqueta(f"ICA-{i:04d}", generar_codigo(), "L-03", "Jackson + trimedlure") for i in range(n)
    ]


# --- Servicio ---


def test_cada_etiqueta_lleva_un_qr_legible_de_mas_de_3_cm_y_sus_datos():
    etiquetas = _etiquetas(3)
    [pagina] = _leer(generar_pdf(etiquetas, "Finca Icota", "L-03"))

    assert sorted(q["texto"] for q in pagina["qr"]) == sorted(
        url_trampa(e.codigo_qr) for e in etiquetas
    )
    assert all(q["lado_cm"] >= 3 for q in pagina["qr"])
    for etiqueta in etiquetas:
        assert etiqueta.codigo_ica in pagina["texto"]
        assert etiqueta.codigo_qr in pagina["texto"]
    assert "Lote L-03" in pagina["texto"]
    assert "Jackson + trimedlure" in pagina["texto"]
    assert "FINCA ICOTA · PNMF" in pagina["texto"]


def test_ocho_etiquetas_por_hoja():
    paginas = _leer(generar_pdf(_etiquetas(9), "Finca", "L-03"))
    assert [len(p["qr"]) for p in paginas] == [8, 1]
    assert "hoja 2 de 2" in paginas[1]["texto"]


def test_un_codigo_ica_largo_cabe_en_la_etiqueta():
    largo = Etiqueta("ICA-54125-CACOTA-0000031", generar_codigo(), "L-03", "McPhail + proteína")
    [pagina] = _leer(generar_pdf([largo], "Finca", "L-03"))
    assert largo.codigo_ica in pagina["texto"]
    assert len(pagina["qr"]) == 1


# --- API ---


@pytest.fixture
async def lote(session):
    for modelo in (Trampa, Lote, Predio):
        await session.execute(update(modelo).values(deleted_at=func.now()))
    predio = Predio(nombre="Finca Icota", vereda="Icota", municipio="Cácota", area_ha=30)
    session.add(predio)
    await session.flush()
    lote = Lote(
        predio_id=predio.id,
        codigo='L-03"x',
        area_ha=1.22,
        geom=a_geometria(PoligonoGeoJSON.model_validate(LOTE)),
    )
    session.add(lote)
    await session.flush()
    return lote


async def _trampa(session, lote, codigo_ica, estado="activa", tipo="jackson"):
    trampa = Trampa(
        lote_id=lote.id,
        codigo_ica=codigo_ica,
        codigo_qr=generar_codigo(),
        tipo=tipo,
        atrayente="Trimedlure" if tipo == "jackson" else "Proteína hidrolizada",
        fecha_instalacion=date(2026, 9, 3),
        estado=estado,
        geom=a_geometria(PuntoGeoJSON(type="Point", coordinates=(-72.6395, 7.2705))),
    )
    session.add(trampa)
    await session.flush()
    return trampa


@pytest.fixture
async def tecnico(crear_usuario):
    return await crear_usuario(f"tecnico.{uuid.uuid4().hex[:8]}@ejemplo.com", rol="tecnico")


async def test_sin_sesion_responde_401(cliente, lote):
    assert (await cliente.get(f"/api/v1/lotes/{lote.id}/etiquetas.pdf")).status_code == 401


@pytest.mark.parametrize("rol", ["tecnico", "productor", "agronomo"])
async def test_pdf_del_lote_sin_trampas_retiradas(cliente, crear_usuario, lote, session, rol):
    activa = await _trampa(session, lote, "ICA-0031")
    inactiva = await _trampa(session, lote, "ICA-0032", estado="inactiva", tipo="mcphail")
    await _trampa(session, lote, "ICA-0033", estado="retirada")
    usuario = await crear_usuario(f"{rol}.{uuid.uuid4().hex[:8]}@ejemplo.com", rol=rol)

    respuesta = await cliente.get(
        f"/api/v1/lotes/{lote.id}/etiquetas.pdf", headers=encabezados(usuario)
    )

    assert respuesta.status_code == 200
    assert respuesta.headers["content-type"] == "application/pdf"
    assert respuesta.headers["content-disposition"] == (
        'attachment; filename="etiquetas-lote-L-03_x.pdf"'
    )
    [pagina] = _leer(respuesta.content)
    assert sorted(q["texto"] for q in pagina["qr"]) == sorted(
        [url_trampa(activa.codigo_qr), url_trampa(inactiva.codigo_qr)]
    )
    assert "ICA-0033" not in pagina["texto"]
    assert "McPhail + proteína hidrolizada" in pagina["texto"]


async def test_lote_sin_trampas_instaladas_responde_409(cliente, tecnico, lote, session):
    await _trampa(session, lote, "ICA-0033", estado="retirada")
    respuesta = await cliente.get(
        f"/api/v1/lotes/{lote.id}/etiquetas.pdf", headers=encabezados(tecnico)
    )
    assert respuesta.status_code == 409
    assert "no tiene trampas instaladas" in respuesta.json()["detail"]


async def test_lote_inexistente_o_borrado_responde_404(cliente, tecnico, lote, session):
    url = f"/api/v1/lotes/{uuid.uuid4()}/etiquetas.pdf"
    assert (await cliente.get(url, headers=encabezados(tecnico))).status_code == 404
    lote.deleted_at = func.now()
    await session.flush()
    url = f"/api/v1/lotes/{lote.id}/etiquetas.pdf"
    assert (await cliente.get(url, headers=encabezados(tecnico))).status_code == 404
