"""Pruebas de los lotes con su polígono (HU-09)."""

import uuid

import pytest
from sqlalchemy import func, update

from app.models.lote import Lote
from app.models.predio import Predio
from app.schemas.geo import PoligonoGeoJSON, a_geometria
from app.services.lotes import calcular_area_ha, lotes_traslapados
from tests.utilidades import encabezados

URL = "/api/v1/lotes"


def cuadro(x0: float, y0: float, x1: float, y1: float) -> dict:
    """Rectángulo GeoJSON en [longitud, latitud], anillo antihorario y cerrado."""
    return {
        "type": "Polygon",
        "coordinates": [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
    }


def geometria(geojson: dict):
    return a_geometria(PoligonoGeoJSON.model_validate(geojson))


# ~110,6 m × 110,4 m cerca de Cácota: 12 213 m² calculados a mano (1,22 ha).
A = cuadro(-72.640, 7.270, -72.639, 7.271)
CORBATIN = {
    "type": "Polygon",
    "coordinates": [
        [[-72.640, 7.270], [-72.639, 7.271], [-72.639, 7.270], [-72.640, 7.271], [-72.640, 7.270]]
    ],
}


@pytest.fixture(autouse=True)
async def predio(session):
    # Aísla la prueba de los datos de desarrollo: oculta lotes y predio y crea uno propio.
    await session.execute(update(Lote).values(deleted_at=func.now()))
    await session.execute(update(Predio).values(deleted_at=func.now()))
    predio = Predio(nombre="Finca", vereda="Icota", municipio="Cácota", area_ha=30)
    session.add(predio)
    await session.flush()
    return predio


@pytest.fixture
async def agronomo(crear_usuario):
    return await crear_usuario(f"agronomo.{uuid.uuid4().hex[:8]}@ejemplo.com", rol="agronomo")


@pytest.fixture
async def lote_a(session, predio):
    lote = Lote(predio_id=predio.id, codigo="L-A", area_ha=1.22, geom=geometria(A))
    session.add(lote)
    await session.flush()
    return lote


# --- Servicio: área y traslapes ---


async def test_area_geodesica_del_cuadrado(session):
    assert float(await calcular_area_ha(session, geometria(A))) == pytest.approx(1.22, abs=0.01)


async def test_area_igual_con_anillo_horario(session):
    horario = {"type": "Polygon", "coordinates": [A["coordinates"][0][::-1]]}
    assert await calcular_area_ha(session, geometria(horario)) == await calcular_area_ha(
        session, geometria(A)
    )


async def test_traslape_parcial(session, lote_a):
    traslapes = await lotes_traslapados(
        session, geometria(cuadro(-72.6395, 7.270, -72.6385, 7.271))
    )
    assert [t.id for t in traslapes] == [lote_a.id]
    assert traslapes[0].area_m2 == pytest.approx(12213 / 2, rel=0.02)


@pytest.mark.parametrize(
    "poligono",
    [cuadro(-72.6397, 7.2703, -72.6393, 7.2707), cuadro(-72.641, 7.269, -72.638, 7.272), A],
    ids=["contenido", "contenedor", "identico"],
)
async def test_traslape_por_contencion(session, lote_a, poligono):
    assert len(await lotes_traslapados(session, geometria(poligono))) == 1


async def test_borde_compartido_o_rebaba_no_es_traslape(session, lote_a):
    assert await lotes_traslapados(session, geometria(cuadro(-72.639, 7.270, -72.638, 7.271))) == []
    rebaba = cuadro(-72.639 - 1e-8, 7.270, -72.638, 7.271)
    assert await lotes_traslapados(session, geometria(rebaba)) == []


async def test_traslape_excluye_el_propio_lote_y_los_borrados(session, lote_a):
    assert await lotes_traslapados(session, geometria(A), excluir_id=lote_a.id) == []
    lote_a.deleted_at = func.now()
    await session.flush()
    assert await lotes_traslapados(session, geometria(A)) == []


# --- API ---


async def test_sin_sesion_responde_401(cliente):
    assert (await cliente.get(URL)).status_code == 401
    assert (await cliente.post(URL, json={"codigo": "L-1", "geom": A})).status_code == 401


@pytest.mark.parametrize("rol", ["tecnico", "productor"])
async def test_solo_el_agronomo_modifica_lotes(cliente, crear_usuario, lote_a, rol):
    otro = await crear_usuario(f"{rol}.{uuid.uuid4().hex[:8]}@ejemplo.com", rol=rol)
    cabeceras = encabezados(otro)
    assert (await cliente.get(URL, headers=cabeceras)).status_code == 200
    assert (await cliente.get(f"{URL}/{lote_a.id}", headers=cabeceras)).status_code == 200
    nuevo = {"codigo": "L-9", "geom": A}
    assert (await cliente.post(URL, json=nuevo, headers=cabeceras)).status_code == 403
    url_lote = f"{URL}/{lote_a.id}"
    assert (
        await cliente.patch(url_lote, json={"nombre": "X"}, headers=cabeceras)
    ).status_code == 403
    assert (await cliente.delete(url_lote, headers=cabeceras)).status_code == 403


async def test_crear_calcula_el_area_y_devuelve_geojson(cliente, agronomo):
    respuesta = await cliente.post(
        URL,
        json={"codigo": "L-01", "nombre": "Lote del río", "geom": A},
        headers=encabezados(agronomo),
    )
    assert respuesta.status_code == 201
    cuerpo = respuesta.json()
    assert cuerpo["area_ha"] == pytest.approx(1.22, abs=0.01)
    assert cuerpo["geom"] == A
    assert cuerpo["advertencias"] == []

    lista = await cliente.get(URL, headers=encabezados(agronomo))
    assert [lote["codigo"] for lote in lista.json()] == ["L-01"]


async def test_el_area_enviada_por_el_cliente_se_rechaza(cliente, agronomo):
    datos = {"codigo": "L-01", "geom": A, "area_ha": 99}
    assert (await cliente.post(URL, json=datos, headers=encabezados(agronomo))).status_code == 422


async def test_poligono_que_se_cruza_responde_422(cliente, agronomo):
    respuesta = await cliente.post(
        URL, json={"codigo": "L-01", "geom": CORBATIN}, headers=encabezados(agronomo)
    )
    assert respuesta.status_code == 422
    assert respuesta.json()["detail"] == "El polígono no es válido: sus bordes se cruzan entre sí"


async def test_coordenadas_invertidas_responden_422(cliente, agronomo):
    invertido = {"type": "Polygon", "coordinates": [[[y, x] for x, y in A["coordinates"][0]]]}
    respuesta = await cliente.post(
        URL, json={"codigo": "L-01", "geom": invertido}, headers=encabezados(agronomo)
    )
    assert respuesta.status_code == 422
    assert "[longitud, latitud]" in str(respuesta.json()["detail"])


async def test_traslape_se_guarda_con_advertencia(cliente, agronomo, lote_a):
    respuesta = await cliente.post(
        URL,
        json={"codigo": "L-02", "geom": cuadro(-72.6395, 7.270, -72.6385, 7.271)},
        headers=encabezados(agronomo),
    )
    assert respuesta.status_code == 201
    [advertencia] = respuesta.json()["advertencias"]
    assert advertencia.startswith("Se traslapa con el lote L-A (")


async def test_codigo_unico_sin_distinguir_mayusculas(cliente, agronomo, lote_a):
    otro = cuadro(-72.630, 7.270, -72.629, 7.271)
    respuesta = await cliente.post(
        URL, json={"codigo": "l-a", "geom": otro}, headers=encabezados(agronomo)
    )
    assert respuesta.status_code == 409
    assert respuesta.json()["detail"] == "Ya existe un lote con ese código"


async def test_el_codigo_de_un_lote_borrado_se_puede_reusar(cliente, agronomo, lote_a, session):
    lote_a.deleted_at = func.now()
    await session.flush()
    reuso = await cliente.post(
        URL,
        json={"codigo": "L-A", "geom": cuadro(-72.630, 7.270, -72.629, 7.271)},
        headers=encabezados(agronomo),
    )
    assert reuso.status_code == 201


async def test_crear_es_idempotente_por_id(cliente, agronomo):
    datos = {"id": str(uuid.uuid4()), "codigo": "L-01", "geom": A}
    primera = await cliente.post(URL, json=datos, headers=encabezados(agronomo))
    segunda = await cliente.post(URL, json=datos, headers=encabezados(agronomo))
    assert (primera.status_code, segunda.status_code) == (201, 200)
    assert primera.json()["id"] == segunda.json()["id"] == datos["id"]

    otro_codigo = await cliente.post(
        URL, json={**datos, "codigo": "L-02"}, headers=encabezados(agronomo)
    )
    assert otro_codigo.status_code == 409


async def test_sin_predio_registrado_responde_409(cliente, agronomo, session):
    await session.execute(update(Predio).values(deleted_at=func.now()))
    await session.flush()
    respuesta = await cliente.post(
        URL, json={"codigo": "L-01", "geom": A}, headers=encabezados(agronomo)
    )
    assert respuesta.status_code == 409
    assert respuesta.json()["detail"] == "Registre primero los datos del predio"


async def test_editar_geometria_recalcula_el_area(cliente, agronomo, lote_a):
    doble = cuadro(-72.640, 7.270, -72.638, 7.271)
    respuesta = await cliente.patch(
        f"{URL}/{lote_a.id}",
        json={"geom": doble, "nombre": "Ampliado"},
        headers=encabezados(agronomo),
    )
    assert respuesta.status_code == 200
    assert respuesta.json()["area_ha"] == pytest.approx(2.44, abs=0.02)
    assert respuesta.json()["nombre"] == "Ampliado"
    assert respuesta.json()["advertencias"] == []

    sin_nombre = await cliente.patch(
        f"{URL}/{lote_a.id}", json={"nombre": None}, headers=encabezados(agronomo)
    )
    assert sin_nombre.json()["nombre"] is None


@pytest.mark.parametrize("cambio", [{"codigo": None}, {"geom": None}, {"geom": CORBATIN}])
async def test_editar_con_datos_invalidos_responde_422(cliente, agronomo, lote_a, cambio):
    respuesta = await cliente.patch(
        f"{URL}/{lote_a.id}", json=cambio, headers=encabezados(agronomo)
    )
    assert respuesta.status_code == 422


async def test_borrado_logico(cliente, agronomo, lote_a, session):
    url_lote = f"{URL}/{lote_a.id}"
    assert (await cliente.delete(url_lote, headers=encabezados(agronomo))).status_code == 204
    assert (await cliente.get(url_lote, headers=encabezados(agronomo))).status_code == 404
    assert (await cliente.get(URL, headers=encabezados(agronomo))).json() == []
    assert (await cliente.delete(url_lote, headers=encabezados(agronomo))).status_code == 404
    await session.refresh(lote_a)
    assert lote_a.deleted_at is not None


async def test_poligono_diminuto_responde_422(cliente, agronomo):
    # ~1 m × 1 m: el área redondeada a 0,01 ha es cero.
    diminuto = cuadro(-72.640, 7.270, -72.64001, 7.27001)
    respuesta = await cliente.post(
        URL, json={"codigo": "L-01", "geom": diminuto}, headers=encabezados(agronomo)
    )
    assert respuesta.status_code == 422
    assert "demasiado pequeño" in respuesta.json()["detail"]
