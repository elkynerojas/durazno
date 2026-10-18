"""Pruebas de las trampas ubicadas dentro de su lote (HU-11)."""

import uuid
from datetime import date

import pytest
from sqlalchemy import func, update

from app.models.lote import Lote
from app.models.predio import Predio
from app.models.trampa import Trampa
from app.schemas.geo import PoligonoGeoJSON, PuntoGeoJSON, a_geometria
from app.services.qr import generar_codigo
from tests.utilidades import encabezados

URL = "/api/v1/trampas"


def cuadro(x0: float, y0: float, x1: float, y1: float) -> dict:
    return {"type": "Polygon", "coordinates": [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]}


def punto(lng: float, lat: float) -> dict:
    return {"type": "Point", "coordinates": [lng, lat]}


LOTE_A = cuadro(-72.640, 7.270, -72.639, 7.271)
LOTE_B = cuadro(-72.630, 7.270, -72.629, 7.271)
DENTRO_A = punto(-72.6395, 7.2705)
DENTRO_B = punto(-72.6295, 7.2705)
FUERA = punto(-72.6350, 7.2705)
EN_EL_BORDE_A = punto(-72.640, 7.2705)


def _datos(lote_id, **cambios) -> dict:
    datos = {
        "lote_id": str(lote_id),
        "codigo_ica": f"ICA-{uuid.uuid4().hex[:6]}",
        "tipo": "jackson",
        "atrayente": "Trimedlure",
        "fecha_instalacion": "2026-10-15",
        "geom": DENTRO_A,
    }
    return {**datos, **cambios}


@pytest.fixture(autouse=True)
async def predio(session):
    for modelo in (Trampa, Lote, Predio):
        await session.execute(update(modelo).values(deleted_at=func.now()))
    predio = Predio(nombre="Finca", vereda="Icota", municipio="Cácota", area_ha=30)
    session.add(predio)
    await session.flush()
    return predio


async def _lote(session, predio, codigo, geojson):
    lote = Lote(
        predio_id=predio.id,
        codigo=codigo,
        area_ha=1.22,
        geom=a_geometria(PoligonoGeoJSON.model_validate(geojson)),
    )
    session.add(lote)
    await session.flush()
    return lote


@pytest.fixture
async def lote_a(session, predio):
    return await _lote(session, predio, "L-A", LOTE_A)


@pytest.fixture
async def lote_b(session, predio):
    return await _lote(session, predio, "L-B", LOTE_B)


@pytest.fixture
async def trampa(session, lote_a):
    trampa = Trampa(
        lote_id=lote_a.id,
        codigo_ica="ICA-001",
        codigo_qr=generar_codigo(),
        tipo="jackson",
        atrayente="Trimedlure",
        fecha_instalacion=date(2026, 10, 1),
        estado="activa",
        geom=a_geometria(PuntoGeoJSON.model_validate(DENTRO_A)),
    )
    session.add(trampa)
    await session.flush()
    return trampa


@pytest.fixture
async def agronomo(crear_usuario, predio):
    return await crear_usuario(
        f"agronomo.{uuid.uuid4().hex[:8]}@ejemplo.com", rol="agronomo", predios=[predio]
    )


async def test_sin_sesion_responde_401(cliente, predio, lote_a):
    assert (await cliente.get(URL, params={"predio_id": str(predio.id)})).status_code == 401
    assert (await cliente.get(f"/api/v1/lotes/{lote_a.id}/trampas")).status_code == 401
    assert (await cliente.post(URL, json=_datos(lote_a.id))).status_code == 401


@pytest.mark.parametrize("rol", ["tecnico", "productor"])
async def test_solo_el_agronomo_modifica_trampas(cliente, predio, crear_usuario, trampa, rol):
    otro = await crear_usuario(
        f"{rol}.{uuid.uuid4().hex[:8]}@ejemplo.com", rol=rol, predios=[predio]
    )
    cabeceras = encabezados(otro)
    assert (
        await cliente.get(URL, params={"predio_id": str(predio.id)}, headers=cabeceras)
    ).status_code == 200
    assert (await cliente.get(f"{URL}/{trampa.id}", headers=cabeceras)).status_code == 200
    nueva = _datos(trampa.lote_id)
    assert (await cliente.post(URL, json=nueva, headers=cabeceras)).status_code == 403
    url = f"{URL}/{trampa.id}"
    assert (
        await cliente.patch(url, json={"estado": "inactiva"}, headers=cabeceras)
    ).status_code == 403
    assert (await cliente.delete(url, headers=cabeceras)).status_code == 403


async def test_registrar_trampa_con_precision_del_gps(cliente, predio, agronomo, lote_a):
    datos = _datos(lote_a.id, tipo="mcphail", atrayente="Proteína hidrolizada", precision_m=4.5)
    respuesta = await cliente.post(URL, json=datos, headers=encabezados(agronomo))
    assert respuesta.status_code == 201
    cuerpo = respuesta.json()
    assert cuerpo["geom"] == DENTRO_A
    assert cuerpo["precision_m"] == 4.5
    assert cuerpo["estado"] == "activa"
    assert (cuerpo["tipo"], cuerpo["fecha_instalacion"]) == ("mcphail", "2026-10-15")

    del_lote = await cliente.get(
        f"/api/v1/lotes/{lote_a.id}/trampas", headers=encabezados(agronomo)
    )
    assert [t["id"] for t in del_lote.json()] == [cuerpo["id"]]


async def test_ubicada_en_el_mapa_no_lleva_precision(cliente, predio, agronomo, lote_a):
    respuesta = await cliente.post(URL, json=_datos(lote_a.id), headers=encabezados(agronomo))
    assert respuesta.json()["precision_m"] is None


@pytest.mark.parametrize(
    "ubicacion", [FUERA, DENTRO_B, EN_EL_BORDE_A], ids=["fuera", "otro_lote", "borde"]
)
async def test_punto_fuera_del_lote_responde_422(
    cliente, predio, agronomo, lote_a, lote_b, ubicacion
):
    respuesta = await cliente.post(
        URL, json=_datos(lote_a.id, geom=ubicacion), headers=encabezados(agronomo)
    )
    assert respuesta.status_code == 422
    assert respuesta.json()["detail"] == (
        "La ubicación de la trampa debe quedar dentro del polígono de su lote"
    )


async def test_codigo_ica_duplicado_responde_409(cliente, predio, agronomo, trampa):
    respuesta = await cliente.post(
        URL, json=_datos(trampa.lote_id, codigo_ica="ica-001"), headers=encabezados(agronomo)
    )
    assert respuesta.status_code == 409
    assert respuesta.json()["detail"] == "Ya existe una trampa con ese código ICA"


async def test_codigo_ica_unico_tambien_entre_predios(
    cliente, session, agronomo, trampa, crear_usuario
):
    # HU-39: el código ICA es único en todo el sistema, no solo dentro del predio.
    otro = Predio(nombre="Otra finca", vereda="Icota", municipio="Cácota", area_ha=5)
    session.add(otro)
    await session.flush()
    lote = await _lote(session, otro, "L-A", LOTE_A)
    vecino = await crear_usuario(
        f"agronomo.{uuid.uuid4().hex[:8]}@ejemplo.com", rol="agronomo", predios=[otro]
    )
    respuesta = await cliente.post(
        URL, json=_datos(lote.id, codigo_ica="ICA-001"), headers=encabezados(vecino)
    )
    assert respuesta.status_code == 409
    assert respuesta.json()["detail"] == "Ya existe una trampa con ese código ICA"


async def test_registrar_es_idempotente_por_id(cliente, predio, agronomo, lote_a):
    datos = _datos(lote_a.id, id=str(uuid.uuid4()))
    primera = await cliente.post(URL, json=datos, headers=encabezados(agronomo))
    segunda = await cliente.post(URL, json=datos, headers=encabezados(agronomo))
    assert (primera.status_code, segunda.status_code) == (201, 200)
    assert primera.json()["id"] == segunda.json()["id"] == datos["id"]
    lista = await cliente.get(
        URL, params={"predio_id": str(predio.id)}, headers=encabezados(agronomo)
    )
    assert len(lista.json()) == 1


async def test_lote_inexistente_responde_404(cliente, predio, agronomo):
    respuesta = await cliente.post(URL, json=_datos(uuid.uuid4()), headers=encabezados(agronomo))
    assert respuesta.status_code == 404
    assert respuesta.json()["detail"] == "Lote no encontrado"


@pytest.mark.parametrize(
    "cambio",
    [
        {"tipo": "otra"},
        {"estado": "perdida"},
        {"precision_m": -1},
        {"geom": punto(7.2705, -72.6395)},
        {"geom": LOTE_A},
        {"deleted_at": "2026-10-15T00:00:00Z"},
    ],
    ids=["tipo", "estado", "precision", "invertida", "no_es_punto", "campo_privilegiado"],
)
async def test_datos_invalidos_responden_422(cliente, predio, agronomo, lote_a, cambio):
    respuesta = await cliente.post(
        URL, json=_datos(lote_a.id, **cambio), headers=encabezados(agronomo)
    )
    assert respuesta.status_code == 422


async def test_mover_conserva_el_id(cliente, predio, agronomo, trampa, lote_b):
    url = f"{URL}/{trampa.id}"
    otra_posicion = await cliente.patch(
        url,
        json={"geom": punto(-72.6392, 7.2708), "precision_m": None},
        headers=encabezados(agronomo),
    )
    assert otra_posicion.status_code == 200
    assert otra_posicion.json()["geom"] == punto(-72.6392, 7.2708)

    otro_lote = await cliente.patch(
        url, json={"lote_id": str(lote_b.id), "geom": DENTRO_B}, headers=encabezados(agronomo)
    )
    assert otro_lote.status_code == 200
    assert otro_lote.json()["id"] == str(trampa.id)
    assert otro_lote.json()["lote_id"] == str(lote_b.id)


async def test_mover_fuera_del_lote_responde_422(cliente, predio, agronomo, trampa, lote_b):
    url = f"{URL}/{trampa.id}"
    afuera = await cliente.patch(url, json={"geom": FUERA}, headers=encabezados(agronomo))
    assert afuera.status_code == 422
    # Cambiar de lote sin mover el punto también se valida.
    otro = await cliente.patch(url, json={"lote_id": str(lote_b.id)}, headers=encabezados(agronomo))
    assert otro.status_code == 422


async def test_filtrar_por_estado(cliente, predio, agronomo, trampa):
    url = f"{URL}/{trampa.id}"
    retirada = await cliente.patch(url, json={"estado": "retirada"}, headers=encabezados(agronomo))
    assert retirada.json()["estado"] == "retirada"
    activas = await cliente.get(
        URL, params={"predio_id": str(predio.id), "estado": "activa"}, headers=encabezados(agronomo)
    )
    assert activas.json() == []
    retiradas = await cliente.get(
        URL,
        params={"predio_id": str(predio.id), "estado": "retirada"},
        headers=encabezados(agronomo),
    )
    assert [t["id"] for t in retiradas.json()] == [str(trampa.id)]


async def test_borrado_logico(cliente, predio, agronomo, trampa, session):
    url = f"{URL}/{trampa.id}"
    assert (await cliente.delete(url, headers=encabezados(agronomo))).status_code == 204
    assert (await cliente.get(url, headers=encabezados(agronomo))).status_code == 404
    assert (
        await cliente.get(URL, params={"predio_id": str(predio.id)}, headers=encabezados(agronomo))
    ).json() == []
    await session.refresh(trampa)
    assert trampa.deleted_at is not None


async def test_no_se_borra_un_lote_con_trampas(cliente, predio, agronomo, trampa):
    respuesta = await cliente.delete(
        f"/api/v1/lotes/{trampa.lote_id}", headers=encabezados(agronomo)
    )
    assert respuesta.status_code == 409


async def test_cambiar_la_forma_del_lote_no_deja_trampas_por_fuera(
    cliente, predio, agronomo, trampa
):
    url_lote = f"/api/v1/lotes/{trampa.lote_id}"
    pequeno = cuadro(-72.640, 7.270, -72.6397, 7.2703)
    respuesta = await cliente.patch(url_lote, json={"geom": pequeno}, headers=encabezados(agronomo))
    assert respuesta.status_code == 409
    assert respuesta.json()["detail"].endswith("ICA-001")

    mas_grande = cuadro(-72.641, 7.269, -72.638, 7.272)
    respuesta = await cliente.patch(
        url_lote, json={"geom": mas_grande}, headers=encabezados(agronomo)
    )
    assert respuesta.status_code == 200


async def test_mover_sin_precision_borra_la_del_gps(cliente, predio, agronomo, trampa, session):
    trampa.precision_m = 4.5
    await session.flush()
    url = f"{URL}/{trampa.id}"
    nueva = await cliente.patch(
        url, json={"geom": punto(-72.6392, 7.2708)}, headers=encabezados(agronomo)
    )
    assert nueva.json()["precision_m"] is None

    con_gps = await cliente.patch(
        url, json={"geom": DENTRO_A, "precision_m": 3}, headers=encabezados(agronomo)
    )
    assert con_gps.json()["precision_m"] == 3
    sin_mover = await cliente.patch(url, json={"estado": "inactiva"}, headers=encabezados(agronomo))
    assert sin_mover.json()["precision_m"] == 3


async def test_mover_a_un_lote_de_otro_predio_responde_422(
    cliente, predio, crear_usuario, trampa, session
):
    otro_predio = Predio(nombre="Otra finca", vereda="X", municipio="Y", area_ha=5)
    session.add(otro_predio)
    await session.flush()
    lote_ajeno = await _lote(session, otro_predio, "L-Z", LOTE_B)
    admin = await crear_usuario(f"admin.{uuid.uuid4().hex[:8]}@ejemplo.com", rol="administrador")
    respuesta = await cliente.patch(
        f"{URL}/{trampa.id}",
        json={"lote_id": str(lote_ajeno.id), "geom": DENTRO_B},
        headers=encabezados(admin),
    )
    assert respuesta.status_code == 422
    assert respuesta.json()["detail"] == "La trampa solo puede moverse a otro lote del mismo predio"


async def test_una_trampa_de_otro_predio_no_se_ve_ni_se_modifica(
    cliente, predio, crear_usuario, trampa, session
):
    otro_predio = Predio(nombre="Otra finca", vereda="X", municipio="Y", area_ha=5)
    session.add(otro_predio)
    await session.flush()
    ajeno = await crear_usuario(
        f"ajeno.{uuid.uuid4().hex[:8]}@ejemplo.com", rol="agronomo", predios=[otro_predio]
    )
    cabeceras = encabezados(ajeno)
    url = f"{URL}/{trampa.id}"
    assert (await cliente.get(url, headers=cabeceras)).status_code == 404
    patch = await cliente.patch(url, json={"estado": "inactiva"}, headers=cabeceras)
    assert patch.status_code == 404
    assert (await cliente.delete(url, headers=cabeceras)).status_code == 404
    lote = f"/api/v1/lotes/{trampa.lote_id}/trampas"
    assert (await cliente.get(lote, headers=cabeceras)).status_code == 404
    crear = await cliente.post(URL, json=_datos(trampa.lote_id), headers=cabeceras)
    assert crear.status_code == 404
