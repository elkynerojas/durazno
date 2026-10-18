"""Pruebas de las rutas de monitoreo (HU-19)."""

import uuid
from datetime import date

import pytest
from sqlalchemy import func, select

from app.models.lote import Lote
from app.models.predio import Predio
from app.models.ruta import Ruta, RutaTrampa
from app.models.trampa import Trampa
from app.schemas.geo import PoligonoGeoJSON, PuntoGeoJSON, a_geometria
from app.services.qr import generar_codigo
from app.services.rutas import (
    avisos_por_cambio,
    errores_de_orden,
    longitud,
    vecino_mas_cercano,
)
from tests.utilidades import encabezados

URL = "/api/v1/rutas"
A = [[-72.640, 7.270], [-72.639, 7.270], [-72.639, 7.271], [-72.640, 7.271], [-72.640, 7.270]]
B = [[-72.630, 7.270], [-72.629, 7.270], [-72.629, 7.271], [-72.630, 7.271], [-72.630, 7.270]]
# Trampas sobre el meridiano -72.6395. Cálculo a mano: 1° de latitud cerca de 7,27° N mide
# ≈ 110 590 m, así que 0,0002° ≈ 22,1 m y 0,0004° ≈ 44,2 m.
TRAMO_M = 22.1


def _correo(prefijo):
    return f"{prefijo}.{uuid.uuid4().hex[:8]}@ejemplo.com"


# --- Funciones puras ---


ACTIVAS = {"t1": "ICA-01", "t2": "ICA-02", "t3": "ICA-03"}


def test_orden_completo_sin_errores():
    assert errores_de_orden(["t3", "t1", "t2"], ACTIVAS) == []


def test_orden_con_omision_duplicado_y_ajena():
    assert errores_de_orden(["t1", "t1", "t2"], ACTIVAS) == ["Repite ICA-01", "Omite ICA-03"]
    assert errores_de_orden(["t1", "t2", "t3", "x"], ACTIVAS) == [
        "Incluye 1 trampa(s) que no están activas en el lote"
    ]


def _recta(posiciones):
    """Distancias entre puntos sobre una recta, según su posición."""
    return {(a, b): abs(posiciones[a] - posiciones[b]) for a in posiciones for b in posiciones}


def test_vecino_mas_cercano_elige_el_mejor_inicio():
    # A=0, B=2, C=-3. Desde A: A→B→C = 2 + 5 = 7. Desde B: B→A→C = 2 + 3 = 5.
    # Desde C: C→A→B = 3 + 2 = 5. Empate entre B y C: gana el primero (B).
    distancias = _recta({"A": 0, "B": 2, "C": -3})
    orden = vecino_mas_cercano(["A", "B", "C"], distancias)
    assert orden == ["B", "A", "C"]
    assert longitud(orden, distancias) == 5
    assert vecino_mas_cercano(["A", "B", "C"], distancias, inicio="A") == ["A", "B", "C"]


def test_vecino_mas_cercano_acota_los_inicios(monkeypatch):
    # Con un solo inicio permitido, parte del primero aunque otro dé un recorrido más corto.
    monkeypatch.setattr("app.services.rutas.MAX_INICIOS", 1)
    distancias = _recta({"A": 0, "B": 2, "C": -3})
    assert vecino_mas_cercano(["A", "B", "C"], distancias) == ["A", "B", "C"]


def test_vecino_mas_cercano_casos_limite():
    assert vecino_mas_cercano([], {}) == []
    assert vecino_mas_cercano(["A"], {("A", "A"): 0}) == ["A"]


# --- Endpoints ---


def _trampa(lote, codigo, lat, estado="activa"):
    return Trampa(
        lote_id=lote.id,
        codigo_ica=codigo,
        codigo_qr=generar_codigo(),
        tipo="jackson",
        atrayente="Trimedlure",
        fecha_instalacion=date(2026, 10, 1),
        estado=estado,
        geom=a_geometria(PuntoGeoJSON(type="Point", coordinates=(-72.6395, lat))),
    )


def _lote(predio, codigo, anillo):
    return Lote(
        predio_id=predio.id,
        codigo=codigo,
        area_ha=1.22,
        geom=a_geometria(PoligonoGeoJSON(type="Polygon", coordinates=[anillo])),
    )


@pytest.fixture
async def datos(session, predio_vacio):
    lote = _lote(predio_vacio, "L-01", A)
    otro_lote = _lote(predio_vacio, "L-02", B)
    session.add_all([lote, otro_lote])
    await session.flush()
    t1 = _trampa(lote, "ICA-01", 7.2702)
    t2 = _trampa(lote, "ICA-02", 7.2706)
    t3 = _trampa(lote, "ICA-03", 7.2704)
    retirada = _trampa(lote, "ICA-04", 7.2708, estado="retirada")
    ajena = Trampa(
        lote_id=otro_lote.id,
        codigo_ica="ICA-05",
        codigo_qr=generar_codigo(),
        tipo="mcphail",
        atrayente="Proteína",
        fecha_instalacion=date(2026, 10, 1),
        geom=a_geometria(PuntoGeoJSON(type="Point", coordinates=(-72.6295, 7.2705))),
    )
    session.add_all([t1, t2, t3, retirada, ajena])
    await session.flush()
    return {
        "predio": predio_vacio,
        "lote": lote,
        "t1": t1,
        "t2": t2,
        "t3": t3,
        "retirada": retirada,
        "ajena": ajena,
    }


@pytest.fixture
async def agronomo(crear_usuario, datos):
    return await crear_usuario(_correo("agronomo"), rol="agronomo", predios=[datos["predio"]])


@pytest.fixture
async def tecnico(crear_usuario, datos):
    return await crear_usuario(_correo("tecnico"), rol="tecnico", predios=[datos["predio"]])


def _cuerpo(datos, *claves, **extra):
    return {
        "lote_id": str(datos["lote"].id),
        "trampas": [str(datos[c].id) for c in claves],
        **extra,
    }


async def _crear(cliente, usuario, datos, *claves, **extra):
    return await cliente.post(
        URL, json=_cuerpo(datos, *claves, **extra), headers=encabezados(usuario)
    )


async def test_sin_sesion_responde_401(cliente, datos):
    assert (await cliente.post(URL, json=_cuerpo(datos, "t1", "t2", "t3"))).status_code == 401
    assert (await cliente.get(URL, params={"lote_id": str(datos["lote"].id)})).status_code == 401


async def test_solo_el_agronomo_define_rutas(cliente, datos, tecnico):
    assert (await _crear(cliente, tecnico, datos, "t1", "t2", "t3")).status_code == 403


async def test_crear_ruta_con_distancias(cliente, datos, agronomo):
    respuesta = await _crear(cliente, agronomo, datos, "t1", "t3", "t2")
    assert respuesta.status_code == 201
    ruta = respuesta.json()
    assert ruta["lote_codigo"] == "L-01"
    assert [(p["orden"], p["codigo_ica"]) for p in ruta["paradas"]] == [
        (1, "ICA-01"),
        (2, "ICA-03"),
        (3, "ICA-02"),
    ]
    tramos = [p["distancia_desde_anterior_m"] for p in ruta["paradas"]]
    assert tramos[0] is None
    assert tramos[1:] == [pytest.approx(TRAMO_M, abs=0.3)] * 2
    assert ruta["distancia_total_m"] == pytest.approx(2 * TRAMO_M, abs=0.5)
    assert ruta["paradas"][0]["geom"] == {"type": "Point", "coordinates": [-72.6395, 7.2702]}


@pytest.mark.parametrize(
    ("claves", "mensaje"),
    [
        (("t1", "t2"), "Omite ICA-03"),
        (("t1", "t2", "t3", "t1"), "Repite ICA-01"),
        (("t1", "t2", "t3", "retirada"), "no están activas"),
        (("t1", "t2", "t3", "ajena"), "no están activas"),
    ],
    ids=["omision", "duplicado", "trampa-retirada", "trampa-de-otro-lote"],
)
async def test_orden_incompleto_responde_422(cliente, datos, agronomo, claves, mensaje):
    respuesta = await _crear(cliente, agronomo, datos, *claves)
    assert respuesta.status_code == 422
    assert mensaje in respuesta.json()["detail"]


async def test_crear_es_idempotente_por_id(cliente, datos, agronomo):
    ruta_id = str(uuid.uuid4())
    primera = await _crear(cliente, agronomo, datos, "t1", "t3", "t2", id=ruta_id)
    repetida = await _crear(cliente, agronomo, datos, "t1", "t3", "t2", id=ruta_id)
    assert (primera.status_code, repetida.status_code) == (201, 200)
    assert repetida.json()["id"] == ruta_id


async def test_un_lote_tiene_una_sola_ruta(cliente, datos, agronomo):
    await _crear(cliente, agronomo, datos, "t1", "t3", "t2")
    otra = await _crear(cliente, agronomo, datos, "t2", "t3", "t1")
    assert otra.status_code == 409


async def test_lote_de_otro_predio_responde_404(cliente, crear_usuario, datos, session):
    otro = Predio(nombre="Otra finca", vereda="Icota", municipio="Cácota", area_ha=5)
    session.add(otro)
    await session.flush()
    ajeno = await crear_usuario(_correo("agronomo"), rol="agronomo", predios=[otro])
    assert (await _crear(cliente, ajeno, datos, "t1", "t3", "t2")).status_code == 404


async def test_cambiar_el_orden_conserva_el_historial(cliente, datos, agronomo, session):
    ruta = (await _crear(cliente, agronomo, datos, "t1", "t3", "t2")).json()
    url = f"{URL}/{ruta['id']}"
    cuerpo = {"trampas": [str(datos[c].id) for c in ("t2", "t3", "t1")]}

    cambiada = await cliente.put(url, json=cuerpo, headers=encabezados(agronomo))
    assert cambiada.status_code == 200
    assert [p["codigo_ica"] for p in cambiada.json()["paradas"]] == ["ICA-02", "ICA-03", "ICA-01"]
    # Reenviar el mismo orden no crea paradas nuevas.
    await cliente.put(url, json=cuerpo, headers=encabezados(agronomo))
    filas = await session.execute(
        select(RutaTrampa.deleted_at.is_(None), func.count())
        .where(RutaTrampa.ruta_id == uuid.UUID(ruta["id"]))
        .group_by(RutaTrampa.deleted_at.is_(None))
    )
    assert dict(filas.all()) == {True: 3, False: 3}

    omision = await cliente.put(
        url, json={"trampas": [str(datos["t1"].id)]}, headers=encabezados(agronomo)
    )
    assert omision.status_code == 422


async def test_listar_y_borrado_logico(cliente, datos, agronomo, tecnico):
    ruta = (await _crear(cliente, agronomo, datos, "t1", "t3", "t2")).json()
    por_predio = await cliente.get(
        URL, params={"predio_id": str(datos["predio"].id)}, headers=encabezados(tecnico)
    )
    assert [r["id"] for r in por_predio.json()] == [ruta["id"]]
    leida = await cliente.get(f"{URL}/{ruta['id']}", headers=encabezados(tecnico))
    assert leida.json()["distancia_total_m"] == ruta["distancia_total_m"]

    assert (
        await cliente.delete(f"{URL}/{ruta['id']}", headers=encabezados(tecnico))
    ).status_code == 403
    borrada = await cliente.delete(f"{URL}/{ruta['id']}", headers=encabezados(agronomo))
    assert borrada.status_code == 204
    assert (
        await cliente.get(f"{URL}/{ruta['id']}", headers=encabezados(agronomo))
    ).status_code == 404
    por_lote = await cliente.get(
        URL, params={"lote_id": str(datos["lote"].id)}, headers=encabezados(agronomo)
    )
    assert por_lote.json() == []
    # Borrada la ruta, el lote puede tener una nueva.
    assert (await _crear(cliente, agronomo, datos, "t2", "t3", "t1")).status_code == 201


async def test_listar_sin_predio_ni_lote_responde_422(cliente, agronomo):
    assert (await cliente.get(URL, headers=encabezados(agronomo))).status_code == 422


async def test_propuesta_por_vecino_mas_cercano(cliente, datos, tecnico):
    # Sobre la recta: ICA-01 (7,2702), ICA-03 (7,2704), ICA-02 (7,2706). Lo más corto es
    # recorrerlas de un extremo al otro (2 × 22,1 m); empezar por ICA-03 da 22,1 + 44,2 m.
    url = f"{URL}/propuesta"
    params = {"lote_id": str(datos["lote"].id)}
    propuesta = await cliente.get(url, params=params, headers=encabezados(tecnico))
    assert propuesta.status_code == 200
    cuerpo = propuesta.json()
    assert [p["codigo_ica"] for p in cuerpo["paradas"]] == ["ICA-01", "ICA-03", "ICA-02"]
    assert cuerpo["distancia_total_m"] == pytest.approx(2 * TRAMO_M, abs=0.5)

    desde_el_medio = await cliente.get(
        url, params={**params, "inicio_id": str(datos["t3"].id)}, headers=encabezados(tecnico)
    )
    assert [p["codigo_ica"] for p in desde_el_medio.json()["paradas"]] == [
        "ICA-03",
        "ICA-01",
        "ICA-02",
    ]
    assert desde_el_medio.json()["distancia_total_m"] == pytest.approx(3 * TRAMO_M, abs=0.5)

    retirada = await cliente.get(
        url,
        params={**params, "inicio_id": str(datos["retirada"].id)},
        headers=encabezados(tecnico),
    )
    assert retirada.status_code == 422


async def test_el_qr_indica_la_posicion_en_la_ruta(cliente, datos, agronomo, tecnico):
    ruta = (await _crear(cliente, agronomo, datos, "t1", "t3", "t2")).json()
    resuelta = await cliente.get(
        f"/api/v1/trampas/qr/{datos['t3'].codigo_qr}", headers=encabezados(tecnico)
    )
    assert resuelta.json()["ruta"] == {
        "id": ruta["id"],
        "orden": 2,
        "total": 3,
        "siguiente": "ICA-02",
    }
    sin_ruta = await cliente.get(
        f"/api/v1/trampas/qr/{datos['ajena'].codigo_qr}", headers=encabezados(agronomo)
    )
    assert sin_ruta.json()["ruta"] is None


async def test_al_borrar_el_lote_se_borra_su_ruta(cliente, datos, agronomo, session):
    ruta = (await _crear(cliente, agronomo, datos, "t1", "t3", "t2")).json()
    for clave in ("t1", "t2", "t3", "retirada"):
        await cliente.delete(f"/api/v1/trampas/{datos[clave].id}", headers=encabezados(agronomo))
    borrado = await cliente.delete(
        f"/api/v1/lotes/{datos['lote'].id}", headers=encabezados(agronomo)
    )
    assert borrado.status_code == 204
    fila = await session.get(Ruta, uuid.UUID(ruta["id"]))
    await session.refresh(fila)
    assert fila.deleted_at is not None


@pytest.fixture
async def ajeno(crear_usuario, session):
    otro = Predio(nombre="Otra finca", vereda="Icota", municipio="Cácota", area_ha=5)
    session.add(otro)
    await session.flush()
    return await crear_usuario(_correo("agronomo"), rol="agronomo", predios=[otro])


async def test_ruta_de_otro_predio_responde_404(cliente, datos, agronomo, ajeno):
    ruta = (await _crear(cliente, agronomo, datos, "t1", "t3", "t2")).json()
    url = f"{URL}/{ruta['id']}"
    cuerpo = {"trampas": [str(datos[c].id) for c in ("t2", "t3", "t1")]}
    h = encabezados(ajeno)
    respuestas = [
        await cliente.get(url, headers=h),
        await cliente.put(url, json=cuerpo, headers=h),
        await cliente.delete(url, headers=h),
        await cliente.get(f"{URL}/propuesta", params={"lote_id": str(datos["lote"].id)}, headers=h),
        await cliente.get(URL, params={"predio_id": str(datos["predio"].id)}, headers=h),
        await cliente.get(f"{URL}/{uuid.uuid4()}", headers=encabezados(agronomo)),
    ]
    assert [r.status_code for r in respuestas] == [404] * 6
    assert respuestas[0].json() == respuestas[5].json() == {"detail": "Ruta no encontrada"}


@pytest.mark.parametrize("rol", ["tecnico", "productor"])
async def test_solo_el_agronomo_cambia_el_orden(cliente, crear_usuario, datos, agronomo, rol):
    ruta = (await _crear(cliente, agronomo, datos, "t1", "t3", "t2")).json()
    usuario = await crear_usuario(_correo(rol), rol=rol, predios=[datos["predio"]])
    respuesta = await cliente.put(
        f"{URL}/{ruta['id']}",
        json={"trampas": [str(datos[c].id) for c in ("t2", "t3", "t1")]},
        headers=encabezados(usuario),
    )
    assert respuesta.status_code == 403


async def test_id_de_ruta_de_otro_lote_responde_409(cliente, datos, agronomo, session):
    ruta = (await _crear(cliente, agronomo, datos, "t1", "t3", "t2")).json()
    otro_lote = await session.scalar(select(Lote).where(Lote.codigo == "L-02"))
    respuesta = await cliente.post(
        URL,
        json={"id": ruta["id"], "lote_id": str(otro_lote.id), "trampas": [str(datos["ajena"].id)]},
        headers=encabezados(agronomo),
    )
    assert respuesta.status_code == 409


# --- Rutas que requieren revisión (HU-20) ---

L1, L2 = uuid.uuid4(), uuid.uuid4()


@pytest.mark.parametrize(
    ("cambio", "esperado"),
    [
        (dict(estado_despues="retirada"), [(L1, "ICA-01 quedó retirada")]),
        (dict(estado_despues="inactiva"), [(L1, "ICA-01 quedó inactiva")]),
        (dict(estado_antes="inactiva"), [(L1, "ICA-01 volvió a estar activa")]),
        (dict(movida=True), [(L1, "ICA-01 cambió de ubicación")]),
        (
            dict(lote_despues=L2),
            [(L1, "ICA-01 se movió a otro lote"), (L2, "ICA-01 llegó desde otro lote")],
        ),
        (dict(lote_despues=L2, estado_antes="inactiva", estado_despues="inactiva"), []),
        (dict(estado_antes="inactiva", estado_despues="inactiva", movida=True), []),
        ({}, []),
    ],
    ids=[
        "retirada",
        "inactivada",
        "reactivada",
        "movida",
        "otro-lote",
        "inactiva-a-otro-lote",
        "inactiva-movida",
        "sin-cambios",
    ],
)
def test_avisos_por_cambio(cambio, esperado):
    datos = dict(
        lote_antes=L1,
        lote_despues=L1,
        estado_antes="activa",
        estado_despues="activa",
        movida=False,
    )
    assert avisos_por_cambio("ICA-01", **{**datos, **cambio}) == esperado


async def _ruta(cliente, usuario, ruta_id):
    return (await cliente.get(f"{URL}/{ruta_id}", headers=encabezados(usuario))).json()


async def test_cambios_en_las_trampas_marcan_la_ruta(cliente, datos, agronomo):
    ruta = (await _crear(cliente, agronomo, datos, "t1", "t3", "t2")).json()
    assert (ruta["requiere_revision"], ruta["motivo_revision"]) == (False, None)
    h = encabezados(agronomo)

    nueva = await cliente.post(
        "/api/v1/trampas",
        json={
            "lote_id": str(datos["lote"].id),
            "codigo_ica": "ICA-06",
            "tipo": "jackson",
            "atrayente": "Trimedlure",
            "fecha_instalacion": "2026-10-10",
            "geom": {"type": "Point", "coordinates": [-72.6395, 7.2703]},
        },
        headers=h,
    )
    assert nueva.status_code == 201
    await cliente.patch(f"/api/v1/trampas/{datos['t1'].id}", json={"estado": "retirada"}, headers=h)
    marcada = await _ruta(cliente, agronomo, ruta["id"])
    assert marcada["requiere_revision"] is True
    assert marcada["motivo_revision"] == "Se instaló ICA-06; ICA-01 quedó retirada"

    # El mapa muestra el aviso en el lote.
    mapa = await cliente.get("/api/v1/mapa", params={"lote_id": str(datos["lote"].id)}, headers=h)
    [lote] = [f for f in mapa.json()["features"] if f["properties"]["elemento"] == "lote"]
    assert lote["properties"]["ruta"] == {
        "id": ruta["id"],
        "requiere_revision": True,
        "motivo_revision": "Se instaló ICA-06; ICA-01 quedó retirada",
    }

    # Guardar la ruta revisada (con todas las activas) quita la marca.
    orden = [str(datos[c].id) for c in ("t3", "t2")] + [nueva.json()["id"]]
    revisada = await cliente.put(f"{URL}/{ruta['id']}", json={"trampas": orden}, headers=h)
    assert revisada.status_code == 200
    assert (revisada.json()["requiere_revision"], revisada.json()["motivo_revision"]) == (
        False,
        None,
    )


async def test_confirmar_el_mismo_orden_quita_la_marca(cliente, datos, agronomo):
    ruta = (await _crear(cliente, agronomo, datos, "t1", "t3", "t2")).json()
    h = encabezados(agronomo)
    await cliente.patch(
        f"/api/v1/trampas/{datos['t3'].id}",
        json={"geom": {"type": "Point", "coordinates": [-72.6396, 7.2704]}},
        headers=h,
    )
    assert (await _ruta(cliente, agronomo, ruta["id"]))["motivo_revision"] == (
        "ICA-03 cambió de ubicación"
    )
    orden = [p["trampa_id"] for p in ruta["paradas"]]
    confirmada = await cliente.put(f"{URL}/{ruta['id']}", json={"trampas": orden}, headers=h)
    assert confirmada.json()["requiere_revision"] is False


async def test_eliminar_una_trampa_activa_marca_la_ruta(cliente, datos, agronomo):
    ruta = (await _crear(cliente, agronomo, datos, "t1", "t3", "t2")).json()
    await cliente.delete(f"/api/v1/trampas/{datos['t2'].id}", headers=encabezados(agronomo))
    assert (await _ruta(cliente, agronomo, ruta["id"]))["motivo_revision"] == "Se eliminó ICA-02"


async def test_cambios_que_no_afectan_la_ruta(cliente, datos, agronomo):
    ruta = (await _crear(cliente, agronomo, datos, "t1", "t3", "t2")).json()
    h = encabezados(agronomo)
    # Cambiar el atrayente o tocar una trampa retirada no altera el recorrido.
    await cliente.patch(
        f"/api/v1/trampas/{datos['t1'].id}", json={"atrayente": "Trimedlure nuevo"}, headers=h
    )
    await cliente.patch(
        f"/api/v1/trampas/{datos['retirada'].id}",
        json={"geom": {"type": "Point", "coordinates": [-72.6396, 7.2708]}},
        headers=h,
    )
    # Un registro rechazado (código ICA repetido) tampoco marca la ruta.
    repetida = await cliente.post(
        "/api/v1/trampas",
        json={
            "lote_id": str(datos["lote"].id),
            "codigo_ica": "ICA-01",
            "tipo": "jackson",
            "atrayente": "Trimedlure",
            "fecha_instalacion": "2026-10-10",
            "geom": {"type": "Point", "coordinates": [-72.6395, 7.2703]},
        },
        headers=h,
    )
    assert repetida.status_code == 409
    # Tras el rollback del 409 el usuario de la prueba quedó expirado: se reusan los encabezados.
    leida = await cliente.get(f"{URL}/{ruta['id']}", headers=h)
    assert leida.json()["requiere_revision"] is False
