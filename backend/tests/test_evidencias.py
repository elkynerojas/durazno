"""Pruebas de las fotos de evidencia de los hallazgos (HU-41)."""

import io
import uuid
from pathlib import Path

import pytest
from PIL import Image

from app.core.config import get_settings
from app.services import evidencias
from tests.test_hallazgos import _registrar, datos  # noqa: F401  (fixture compartida)
from tests.utilidades import encabezados

URL = "/api/v1/inspecciones/hallazgos"
GPS = 0x8825


@pytest.fixture(autouse=True)
def _carpeta(monkeypatch, tmp_path):
    monkeypatch.setattr(get_settings(), "evidencias_dir", str(tmp_path))
    return tmp_path


def _foto(ancho=3000, alto=2000, formato="JPEG", con_gps=False) -> bytes:
    imagen = Image.new("RGB", (ancho, alto), (200, 120, 60))
    salida = io.BytesIO()
    if con_gps:
        exif = Image.Exif()
        exif[0x010F] = "Telefono"  # fabricante
        exif.get_ifd(GPS)[2] = (7.0, 16.0, 13.0)  # latitud
        imagen.save(salida, formato, exif=exif)
    else:
        imagen.save(salida, formato)
    return salida.getvalue()


@pytest.fixture
async def hallazgo(cliente, datos):  # noqa: F811
    return (await _registrar(cliente, datos["tecnico"], datos["lote_a"])).json()


async def _subir(
    cliente, usuario, hallazgo, contenido, nombre="foto.jpg", tipo="image/jpeg", **form
):
    return await cliente.post(
        f"{URL}/{hallazgo['id']}/evidencias",
        files={"archivo": (nombre, contenido, tipo)},
        data=form,
        headers=encabezados(usuario),
    )


async def test_subir_reduce_y_quita_el_exif(cliente, datos, hallazgo, _carpeta):  # noqa: F811
    r = await _subir(cliente, datos["tecnico"], hallazgo, _foto(con_gps=True))
    assert r.status_code == 201
    foto = r.json()
    assert (foto["ancho"], foto["alto"]) == (1920, 1280)
    assert foto["orden"] == 1

    guardada = _carpeta / hallazgo["id"] / f"{foto['id']}.jpg"
    with Image.open(guardada) as imagen:
        assert imagen.format == "JPEG"
        assert imagen.size == (1920, 1280)
        assert not imagen.getexif()
        assert "exif" not in imagen.info
    with Image.open(guardada.with_name(f"{foto['id']}_min.jpg")) as miniatura:
        assert max(miniatura.size) == 400

    detalle = await cliente.get(f"{URL}/{hallazgo['id']}", headers=encabezados(datos["productor"]))
    assert [e["id"] for e in detalle.json()["evidencias"]] == [foto["id"]]


async def test_descargar_foto_y_miniatura(cliente, datos, hallazgo):  # noqa: F811
    foto = (await _subir(cliente, datos["tecnico"], hallazgo, _foto(800, 600, "PNG"))).json()
    url = f"{URL}/{hallazgo['id']}/evidencias/{foto['id']}"
    r = await cliente.get(url, headers=encabezados(datos["productor"]))
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/jpeg"
    assert r.headers["cache-control"].startswith("private")
    assert Image.open(io.BytesIO(r.content)).size == (800, 600)
    r = await cliente.get(
        url, params={"tamano": "miniatura"}, headers=encabezados(datos["productor"])
    )
    assert Image.open(io.BytesIO(r.content)).size == (400, 300)
    assert (await cliente.get(url)).status_code == 401
    r = await cliente.get(
        f"{URL}/{hallazgo['id']}/evidencias/{uuid.uuid4()}", headers=encabezados(datos["productor"])
    )
    assert r.status_code == 404


async def test_rechaza_lo_que_no_es_imagen(cliente, datos, hallazgo):  # noqa: F811
    r = await _subir(cliente, datos["tecnico"], hallazgo, b"%PDF-1.7 no es una foto", "foto.jpg")
    assert r.status_code == 422
    assert r.json()["detail"] == "El archivo no es una imagen JPEG, PNG o WebP"
    # GIF es una imagen válida pero no un formato aceptado.
    r = await _subir(
        cliente, datos["tecnico"], hallazgo, _foto(10, 10, "GIF"), "foto.gif", "image/gif"
    )
    assert r.status_code == 422


@pytest.mark.filterwarnings("ignore::PIL.Image.DecompressionBombWarning")
async def test_rechaza_bombas_de_descompresion(cliente, datos, hallazgo, _carpeta):  # noqa: F811
    # 100 Mpx de un solo color pesan unos KB en PNG, pero decodificados ocuparían ~300 MB.
    r = await _subir(
        cliente, datos["tecnico"], hallazgo, _foto(10_000, 10_000, "PNG"), "f.png", "image/png"
    )
    assert r.status_code == 422
    assert not any(_carpeta.rglob("*.jpg"))


async def test_rechaza_fotos_demasiado_grandes(cliente, datos, hallazgo, monkeypatch):  # noqa: F811
    monkeypatch.setattr(evidencias, "MAX_BYTES", 1000)
    from app.api.v1.endpoints import inspecciones

    monkeypatch.setattr(inspecciones, "MAX_BYTES", 1000)
    r = await _subir(cliente, datos["tecnico"], hallazgo, _foto(500, 500))
    assert r.status_code == 413


async def test_maximo_de_fotos(cliente, datos, hallazgo):  # noqa: F811
    for i in range(6):
        r = await _subir(cliente, datos["tecnico"], hallazgo, _foto(50, 50))
        assert r.status_code == 201 and r.json()["orden"] == i + 1
    r = await _subir(cliente, datos["tecnico"], hallazgo, _foto(50, 50))
    assert r.status_code == 409


async def test_subida_idempotente_por_id(cliente, datos, hallazgo):  # noqa: F811
    ident = str(uuid.uuid4())
    primero = await _subir(cliente, datos["tecnico"], hallazgo, _foto(60, 60), id=ident)
    segundo = await _subir(cliente, datos["tecnico"], hallazgo, _foto(60, 60), id=ident)
    assert primero.status_code == 201 and segundo.status_code == 200
    assert primero.json()["id"] == segundo.json()["id"] == ident
    detalle = await cliente.get(f"{URL}/{hallazgo['id']}", headers=encabezados(datos["tecnico"]))
    assert len(detalle.json()["evidencias"]) == 1


async def test_permisos_y_borrado_logico(cliente, datos, hallazgo, _carpeta):  # noqa: F811
    assert (await _subir(cliente, datos["productor"], hallazgo, _foto(50, 50))).status_code == 403
    assert (
        await _subir(cliente, datos["otro_tecnico"], hallazgo, _foto(50, 50))
    ).status_code == 403
    foto = (await _subir(cliente, datos["agronomo"], hallazgo, _foto(50, 50))).json()
    url = f"{URL}/{hallazgo['id']}/evidencias/{foto['id']}"
    assert (await cliente.delete(url, headers=encabezados(datos["productor"]))).status_code == 403
    assert (await cliente.delete(url, headers=encabezados(datos["tecnico"]))).status_code == 204
    assert (await cliente.get(url, headers=encabezados(datos["tecnico"]))).status_code == 404
    detalle = await cliente.get(f"{URL}/{hallazgo['id']}", headers=encabezados(datos["tecnico"]))
    assert detalle.json()["evidencias"] == []
    # El archivo se conserva en disco.
    assert Path(_carpeta / hallazgo["id"] / f"{foto['id']}.jpg").is_file()
