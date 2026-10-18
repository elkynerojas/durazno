"""Pruebas de las lecturas de trampa (HU-25)."""

import uuid
from datetime import UTC, date, datetime

import pytest
from sqlalchemy import func, select, update

from app.api.v1.endpoints import mapa, visitas
from app.models.lectura_trampa import LecturaTrampa
from app.models.lote import Lote
from app.models.predio import Predio
from app.models.trampa import Trampa
from app.models.visita import Visita
from app.schemas.geo import PoligonoGeoJSON, PuntoGeoJSON, a_geometria
from app.services.lecturas import dias_exposicion, fecha_bogota
from app.services.qr import generar_codigo
from tests.utilidades import encabezados

URL = "/api/v1/visitas/lecturas"
A = [[-72.640, 7.270], [-72.639, 7.270], [-72.639, 7.271], [-72.640, 7.271], [-72.640, 7.270]]
# 0,0001° de latitud cerca de 7,27° N ≈ 11,06 m (cálculo a mano: 110 590 m por grado).
DISTANCIA_M = 11.06


def _correo(prefijo):
    return f"{prefijo}.{uuid.uuid4().hex[:8]}@ejemplo.com"


# --- Funciones puras ---


@pytest.mark.parametrize(
    ("observado", "referencia", "dias"),
    [
        (date(2026, 10, 8), date(2026, 10, 1), 7),
        (date(2026, 10, 1), date(2026, 10, 1), 0),
        (date(2026, 1, 5), date(2025, 12, 29), 7),  # cruza de año
        (date(2026, 9, 30), date(2026, 10, 1), 0),  # nunca negativos
    ],
)
def test_dias_de_exposicion(observado, referencia, dias):
    assert dias_exposicion(observado, referencia) == dias


def test_fecha_en_bogota():
    # 03:00 UTC del 18 son las 22:00 del 17 en Bogotá.
    assert fecha_bogota(datetime(2026, 10, 18, 3, 0, tzinfo=UTC)) == date(2026, 10, 17)


# --- Endpoints ---


@pytest.fixture(autouse=True)
def _ahora_fijo(monkeypatch):
    # Las fechas de las pruebas no dependen del día en que se corren.
    monkeypatch.setattr(visitas, "ahora", lambda: datetime(2026, 10, 17, 18, 0, tzinfo=UTC))


def _trampa(lote, codigo, estado="activa"):
    return Trampa(
        lote_id=lote.id,
        codigo_ica=codigo,
        codigo_qr=generar_codigo(),
        tipo="jackson",
        atrayente="Trimedlure",
        fecha_instalacion=date(2026, 10, 1),
        estado=estado,
        geom=a_geometria(PuntoGeoJSON(type="Point", coordinates=(-72.6395, 7.2705))),
    )


@pytest.fixture
async def datos(session, predio_vacio, crear_usuario):
    lote = Lote(
        predio_id=predio_vacio.id,
        codigo="L-01",
        area_ha=1.22,
        geom=a_geometria(PoligonoGeoJSON(type="Polygon", coordinates=[A])),
    )
    session.add(lote)
    await session.flush()
    trampa, inactiva = _trampa(lote, "ICA-01"), _trampa(lote, "ICA-02", estado="inactiva")
    session.add_all([trampa, inactiva])
    await session.flush()
    tecnico = await crear_usuario(_correo("tecnico"), rol="tecnico", predios=[predio_vacio])
    return {
        "predio": predio_vacio,
        "lote": lote,
        "trampa": trampa,
        "inactiva": inactiva,
        "tecnico": tecnico,
    }


def _cuerpo(datos, **cambios):
    return {
        "trampa_id": str(datos["trampa"].id),
        "observado_en": "2026-10-08T08:30:00-05:00",
        "capitata_machos": 4,
        "capitata_hembras": 1,
        "anastrepha": 0,
        "estado_trampa": "buena",
        "cambio_atrayente": False,
        **cambios,
    }


async def _registrar(cliente, datos, usuario=None, **cambios):
    return await cliente.post(
        URL, json=_cuerpo(datos, **cambios), headers=encabezados(usuario or datos["tecnico"])
    )


async def test_registrar_lectura_con_dias_y_distancia(cliente, datos, session):
    respuesta = await _registrar(
        cliente,
        datos,
        observaciones="Frutos con picadura en el borde norte",
        posicion={"type": "Point", "coordinates": [-72.6395, 7.2706]},
        precision_m=4.5,
    )
    assert respuesta.status_code == 201
    lectura = respuesta.json()
    # Instalada el 1 de octubre, leída el 8: 7 días.
    assert (lectura["dias_exposicion"], lectura["dias_calculados"]) == (7, 7)
    assert lectura["distancia_m"] == pytest.approx(DISTANCIA_M, abs=0.2)
    assert lectura["precision_m"] == 4.5
    assert datetime.fromisoformat(lectura["observado_en"]) == datetime(
        2026, 10, 8, 13, 30, tzinfo=UTC
    )
    assert (lectura["trampa_codigo_ica"], lectura["lote_codigo"], lectura["estado"]) == (
        "ICA-01",
        "L-01",
        "registrada",
    )
    visita = await session.get(Visita, uuid.UUID(lectura["visita_id"]))
    assert (visita.fecha, visita.tecnico_id) == (date(2026, 10, 8), datos["tecnico"].id)

    # La siguiente cuenta desde la lectura anterior, en otra visita (otro día).
    siguiente = await _registrar(cliente, datos, observado_en="2026-10-15T07:00:00-05:00")
    assert siguiente.json()["dias_exposicion"] == 7
    assert siguiente.json()["visita_id"] != lectura["visita_id"]


async def test_preparar_lectura(cliente, datos):
    h = encabezados(datos["tecnico"])
    params = {"trampa_id": str(datos["trampa"].id), "observado_en": "2026-10-08T12:00:00-05:00"}
    sin_lecturas = (await cliente.get(f"{URL}/preparar", params=params, headers=h)).json()
    assert (sin_lecturas["revision_anterior"], sin_lecturas["dias_exposicion"]) == ("2026-10-01", 7)
    assert sin_lecturas["ultima_lectura"] is None

    primera = (await _registrar(cliente, datos)).json()
    params["observado_en"] = "2026-10-15T12:00:00-05:00"
    despues = (await cliente.get(f"{URL}/preparar", params=params, headers=h)).json()
    assert (despues["revision_anterior"], despues["dias_exposicion"]) == ("2026-10-08", 7)
    assert despues["ultima_lectura"]["id"] == primera["id"]


async def test_dias_distintos_exigen_justificacion(cliente, datos):
    sin = await _registrar(cliente, datos, dias_exposicion=6)
    assert sin.status_code == 422
    assert "calculados son 7" in sin.json()["detail"]
    con = await _registrar(
        cliente, datos, dias_exposicion=6, justificacion_dias="La trampa se revisó el día 2"
    )
    assert con.status_code == 201
    assert (con.json()["dias_exposicion"], con.json()["dias_calculados"]) == (6, 7)
    assert con.json()["justificacion_dias"] == "La trampa se revisó el día 2"


@pytest.mark.parametrize(
    ("cambios", "detalle"),
    [
        ({"observado_en": "2099-01-01T08:00:00-05:00"}, "en el futuro"),
        ({"observado_en": "2026-09-30T08:00:00-05:00"}, "anterior a la instalación"),
    ],
    ids=["fecha-futura", "antes-de-instalar"],
)
async def test_fechas_invalidas_responden_422(cliente, datos, cambios, detalle):
    respuesta = await _registrar(cliente, datos, **cambios)
    assert respuesta.status_code == 422
    assert detalle in respuesta.json()["detail"]


async def test_trampa_inactiva_no_admite_lecturas(cliente, datos):
    respuesta = await _registrar(cliente, datos, trampa_id=str(datos["inactiva"].id))
    assert respuesta.status_code == 422
    assert respuesta.json()["detail"] == "La trampa ICA-02 está inactiva: no admite lecturas"


@pytest.mark.parametrize(
    "cambios",
    [
        {"capitata_machos": -1},
        {"estado_trampa": "rota"},
        {"observado_en": "2026-10-08T08:30:00"},  # sin zona horaria
        {"posicion": {"type": "Point", "coordinates": [-72.6395, 7.2706]}},  # sin precisión
        {"estado": "validada"},
    ],
    ids=["negativa", "estado-invalido", "sin-zona", "posicion-sin-precision", "campo-extra"],
)
async def test_datos_invalidos_responden_422(cliente, datos, cambios):
    assert (await _registrar(cliente, datos, **cambios)).status_code == 422


async def test_reenviar_la_misma_lectura_no_la_duplica(cliente, datos, session):
    lectura_id = str(uuid.uuid4())
    primera = await _registrar(cliente, datos, id=lectura_id)
    repetida = await _registrar(cliente, datos, id=lectura_id)
    assert (primera.status_code, repetida.status_code) == (201, 200)
    assert repetida.json()["id"] == lectura_id
    total = await session.scalar(
        select(func.count()).where(LecturaTrampa.trampa_id == datos["trampa"].id)
    )
    assert total == 1
    # Otra lectura (otro id) de la misma trampa el mismo día: conflicto.
    otra = await _registrar(cliente, datos, observado_en="2026-10-08T15:00:00-05:00")
    assert otra.status_code == 409


async def test_permisos(cliente, datos, crear_usuario, session):
    assert (await cliente.post(URL, json=_cuerpo(datos))).status_code == 401
    productor = await crear_usuario(
        _correo("productor"), rol="productor", predios=[datos["predio"]]
    )
    assert (await _registrar(cliente, datos, usuario=productor)).status_code == 403
    otro = Predio(nombre="Otra finca", vereda="Icota", municipio="Cácota", area_ha=5)
    session.add(otro)
    await session.flush()
    ajeno = await crear_usuario(_correo("tecnico"), rol="tecnico", predios=[otro])
    assert (await _registrar(cliente, datos, usuario=ajeno)).status_code == 404
    lectura = (await _registrar(cliente, datos)).json()
    h = encabezados(ajeno)
    assert (await cliente.get(f"{URL}/{lectura['id']}", headers=h)).status_code == 404
    listado = await cliente.get(URL, params={"trampa_id": str(datos["trampa"].id)}, headers=h)
    assert listado.status_code == 404
    # El productor del predio sí consulta.
    propio = await cliente.get(f"{URL}/{lectura['id']}", headers=encabezados(productor))
    assert propio.status_code == 200


async def test_listar_por_trampa_y_por_lote(cliente, datos):
    await _registrar(cliente, datos)
    await _registrar(cliente, datos, observado_en="2026-10-15T07:00:00-05:00")
    h = encabezados(datos["tecnico"])
    por_trampa = await cliente.get(URL, params={"trampa_id": str(datos["trampa"].id)}, headers=h)
    assert [x["observado_en"][:10] for x in por_trampa.json()] == ["2026-10-15", "2026-10-08"]
    por_lote = await cliente.get(
        URL, params={"lote_id": str(datos["lote"].id), "limite": 1}, headers=h
    )
    assert len(por_lote.json()) == 1
    assert (await cliente.get(URL, headers=h)).status_code == 422


async def test_las_rechazadas_no_cuentan_como_revision(cliente, datos, session):
    lectura = (await _registrar(cliente, datos)).json()
    await session.execute(
        update(LecturaTrampa)
        .where(LecturaTrampa.id == uuid.UUID(lectura["id"]))
        .values(estado="rechazada")
    )
    preparada = await cliente.get(
        f"{URL}/preparar",
        params={"trampa_id": str(datos["trampa"].id), "observado_en": "2026-10-15T12:00:00-05:00"},
        headers=encabezados(datos["tecnico"]),
    )
    assert (preparada.json()["revision_anterior"], preparada.json()["dias_exposicion"]) == (
        "2026-10-01",
        14,
    )


async def test_el_qr_y_el_mapa_usan_la_ultima_lectura(cliente, datos, monkeypatch):
    lectura = (await _registrar(cliente, datos, observado_en="2026-10-15T07:00:00-05:00")).json()
    h = encabezados(datos["tecnico"])
    resuelta = await cliente.get(f"/api/v1/trampas/qr/{datos['trampa'].codigo_qr}", headers=h)
    ultima = resuelta.json()["ultima_lectura"]
    assert (ultima["id"], ultima["capitata_machos"], ultima["dias_exposicion"]) == (
        lectura["id"],
        4,
        14,
    )

    # Instalada hace 15 días pero leída hace 1: al día.
    monkeypatch.setattr(mapa, "hoy_bogota", lambda: date(2026, 10, 16))
    coleccion = await cliente.get(
        "/api/v1/mapa", params={"lote_id": str(datos["lote"].id)}, headers=h
    )
    [propiedades] = [
        f["properties"]
        for f in coleccion.json()["features"]
        if f["properties"].get("codigo_ica") == "ICA-01"
    ]
    assert (propiedades["monitoreo"], propiedades["dias_sin_revision"]) == ("al_dia", 1)
    assert datetime.fromisoformat(propiedades["ultima_lectura"]) == datetime(
        2026, 10, 15, 12, 0, tzinfo=UTC
    )


async def test_una_lectura_por_trampa_y_dia_aunque_sea_otro_tecnico(
    cliente, datos, crear_usuario, session
):
    otro = await crear_usuario(_correo("tecnico"), rol="tecnico", predios=[datos["predio"]])
    primera = (await _registrar(cliente, datos)).json()
    segunda = await _registrar(
        cliente, datos, usuario=otro, observado_en="2026-10-08T16:00:00-05:00"
    )
    assert segunda.status_code == 409
    assert segunda.json()["detail"] == "Ya hay una lectura de ICA-01 del 08/10/2026"
    # Si la primera se rechaza (HU-26), se puede registrar otra ese día.
    await session.execute(
        update(LecturaTrampa)
        .where(LecturaTrampa.id == uuid.UUID(primera["id"]))
        .values(estado="rechazada")
    )
    otra_vez = await _registrar(
        cliente, datos, usuario=otro, observado_en="2026-10-08T16:00:00-05:00"
    )
    assert otra_vez.status_code == 201


async def test_no_admite_lecturas_de_hace_mas_de_30_dias(cliente, datos, session):
    await session.execute(
        update(Trampa)
        .where(Trampa.id == datos["trampa"].id)
        .values(fecha_instalacion=date(2026, 8, 1))
    )
    vieja = await _registrar(cliente, datos, observado_en="2026-09-16T08:00:00-05:00")
    assert vieja.status_code == 422
    assert "más de 30 días" in vieja.json()["detail"]
    reciente = await _registrar(cliente, datos, observado_en="2026-09-18T08:00:00-05:00")
    assert reciente.status_code == 201


async def test_reenviar_un_id_ajeno_responde_409(cliente, datos, crear_usuario):
    otro = await crear_usuario(_correo("tecnico"), rol="tecnico", predios=[datos["predio"]])
    lectura_id = str(uuid.uuid4())
    await _registrar(cliente, datos, id=lectura_id)
    ajeno = await _registrar(cliente, datos, usuario=otro, id=lectura_id)
    assert ajeno.status_code == 409


async def test_datos_personales_segun_el_rol(cliente, datos, crear_usuario):
    lectura = (
        await _registrar(
            cliente,
            datos,
            posicion={"type": "Point", "coordinates": [-72.6395, 7.2706]},
            precision_m=4.5,
        )
    ).json()
    url = f"{URL}/{lectura['id']}"

    async def ver(rol=None, usuario=None):
        usuario = usuario or await crear_usuario(_correo(rol), rol=rol, predios=[datos["predio"]])
        return (await cliente.get(url, headers=encabezados(usuario))).json()

    propia = await ver(usuario=datos["tecnico"])
    agronomo = await ver("agronomo")
    otro_tecnico = await ver("tecnico")
    productor = await ver("productor")
    assert propia["posicion"] is not None and agronomo["posicion"] is not None
    assert (otro_tecnico["posicion"], otro_tecnico["precision_m"]) == (None, None)
    assert otro_tecnico["responsable_nombre"] == "Persona de Prueba"
    assert (
        productor["posicion"],
        productor["responsable_nombre"],
        productor["responsable_id"],
    ) == (
        None,
        None,
        None,
    )
    # La distancia sí la ven todos: basta para el control de calidad.
    assert productor["distancia_m"] == pytest.approx(DISTANCIA_M, abs=0.2)
