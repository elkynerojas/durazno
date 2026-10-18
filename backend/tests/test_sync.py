"""Sincronización con la app móvil (HU-32): cambios desde una fecha y lecturas en bloque.

En una prueba todo ocurre en una sola transacción y `now()` no avanza: para simular datos que el
cliente ya tenía, se llevan sus marcas de tiempo a `VIEJO`, antes del `desde` de la prueba.
"""

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import func, select, update

from app.models.lectura_trampa import LecturaTrampa
from app.models.lote import Lote
from app.models.plan_actividad import PlanActividad
from app.models.predio import Predio
from app.models.predio_usuario import PredioUsuario
from app.models.ruta import Ruta
from app.models.trampa import Trampa
from app.schemas.geo import PoligonoGeoJSON, PuntoGeoJSON, a_geometria
from app.services.monitoreo import hoy_bogota
from app.services.qr import generar_codigo
from app.services.sync import TRASLAPE, clasificar, siguiente_desde
from tests.utilidades import encabezados

URL_CAMBIOS = "/api/v1/sync/cambios"
URL_BLOQUE = "/api/v1/sync/lecturas"
VIEJO = datetime(2026, 1, 1, tzinfo=UTC)
DESDE = datetime(2026, 6, 1, tzinfo=UTC)
A = [[-72.640, 7.270], [-72.639, 7.270], [-72.639, 7.271], [-72.640, 7.271], [-72.640, 7.270]]
PUNTO = (-72.6395, 7.2705)


# --- Reglas puras ---


@pytest.mark.parametrize(
    ("creado", "borrado", "desde", "esperado"),
    [
        (VIEJO, None, None, "creado"),  # carga completa
        (VIEJO, VIEJO, None, None),  # en la carga completa no viajan las borradas
        (VIEJO, None, DESDE, "modificado"),  # existía y cambió
        (datetime(2026, 7, 1, tzinfo=UTC), None, DESDE, "creado"),
        (VIEJO, datetime(2026, 7, 1, tzinfo=UTC), DESDE, "borrado"),
        # Creada y borrada después de `desde`: pudo llegar por el traslape; se informa igual.
        (datetime(2026, 7, 1, tzinfo=UTC), datetime(2026, 7, 2, tzinfo=UTC), DESDE, "borrado"),
    ],
)
def test_clasificar(creado, borrado, desde, esperado):
    assert clasificar(creado, borrado, desde) == esperado


def test_siguiente_desde_con_traslape():
    assert siguiente_desde(DESDE) == DESDE - TRASLAPE


# --- Escenario ---


def _correo(prefijo):
    return f"{prefijo}.{uuid.uuid4().hex[:8]}@ejemplo.com"


def _iso(momento: datetime) -> str:
    return momento.isoformat().replace("+00:00", "Z")


@pytest.fixture
async def finca(session, predio_vacio, crear_usuario):
    """Predio con un lote, dos trampas Jackson y una McPhail, instaladas hace 20 días; un
    técnico y un agrónomo asignados."""
    lote = Lote(
        predio_id=predio_vacio.id,
        codigo="L-01",
        area_ha=1.22,
        geom=a_geometria(PoligonoGeoJSON(type="Polygon", coordinates=[A])),
    )
    session.add(lote)
    await session.flush()
    instalada = date.today() - timedelta(days=20)
    trampas = {
        codigo: Trampa(
            lote_id=lote.id,
            codigo_ica=codigo,
            codigo_qr=generar_codigo(),
            tipo=tipo,
            atrayente="x",
            fecha_instalacion=instalada,
            geom=a_geometria(PuntoGeoJSON(type="Point", coordinates=PUNTO)),
        )
        for codigo, tipo in (("J1", "jackson"), ("J2", "jackson"), ("M1", "mcphail"))
    }
    session.add_all(trampas.values())
    await session.flush()
    tecnico = await crear_usuario(_correo("tecnico"), rol="tecnico", predios=[predio_vacio])
    agronomo = await crear_usuario(_correo("agronomo"), rol="agronomo", predios=[predio_vacio])
    return {
        "predio": predio_vacio,
        "lote": lote,
        "trampas": trampas,
        "tecnico": tecnico,
        "agronomo": agronomo,
    }


async def _envejecer(session):
    """Todo lo creado hasta ahora queda como si el cliente ya lo tuviera desde antes de DESDE."""
    for modelo in (Predio, Lote, Trampa, PredioUsuario, LecturaTrampa):
        await session.execute(
            update(modelo)
            .where(modelo.created_at >= func.now())
            .values(created_at=VIEJO, updated_at=VIEJO)
        )


async def _cambios(cliente, usuario, desde=None):
    params = {"desde": _iso(desde)} if desde else {}
    respuesta = await cliente.get(URL_CAMBIOS, params=params, headers=encabezados(usuario))
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()


def _codigos(lista, campo="codigo_ica"):
    return sorted(x[campo] for x in lista)


def _lectura(finca, codigo, dias_atras, machos=0, id_=None):
    return {
        "id": str(id_ or uuid.uuid4()),
        "trampa_id": str(finca["trampas"][codigo].id),
        "observado_en": _iso(datetime.now(UTC).replace(microsecond=0) - timedelta(days=dias_atras)),
        "capitata_machos": machos,
        "capitata_hembras": 0,
        "anastrepha": 0,
        "estado_trampa": "buena",
        "cambio_atrayente": False,
    }


async def _enviar(cliente, usuario, lecturas):
    respuesta = await cliente.post(
        URL_BLOQUE, json={"lecturas": lecturas}, headers=encabezados(usuario)
    )
    assert respuesta.status_code == 200, respuesta.text
    return respuesta.json()["resultados"]


# --- GET /sync/cambios ---


async def test_carga_completa_del_predio_asignado(cliente, finca):
    cuerpo = await _cambios(cliente, finca["tecnico"])
    assert cuerpo["desde"] is None
    servidor_en = datetime.fromisoformat(cuerpo["servidor_en"])
    assert datetime.fromisoformat(cuerpo["siguiente_desde"]) == servidor_en - TRASLAPE
    assert [p["id"] for p in cuerpo["predios"]["creados"]] == [str(finca["predio"].id)]
    assert _codigos(cuerpo["lotes"]["creados"], "codigo") == ["L-01"]
    assert _codigos(cuerpo["trampas"]["creados"]) == ["J1", "J2", "M1"]
    for entidad in ("predios", "lotes", "trampas", "rutas", "actividades", "lecturas"):
        assert cuerpo[entidad]["modificados"] == [] and cuerpo[entidad]["borrados"] == []
    # GeoJSON en [longitud, latitud], igual que en los demás endpoints.
    assert cuerpo["trampas"]["creados"][0]["geom"]["coordinates"] == list(PUNTO)


async def test_solo_lo_que_cambio_desde_la_ultima_vez(cliente, session, finca):
    await _envejecer(session)
    h = encabezados(finca["agronomo"])
    trampas = finca["trampas"]
    nada = await _cambios(cliente, finca["tecnico"], DESDE)
    assert all(
        nada[e] == {"creados": [], "modificados": [], "borrados": []}
        for e in ("predios", "lotes", "trampas", "rutas", "actividades", "lecturas")
    )

    # El agrónomo desactiva J1, borra J2 e instala J3 después de DESDE.
    editada = await cliente.patch(
        f"/api/v1/trampas/{trampas['J1'].id}", json={"estado": "inactiva"}, headers=h
    )
    assert editada.status_code == 200
    assert (
        await cliente.delete(f"/api/v1/trampas/{trampas['J2'].id}", headers=h)
    ).status_code == 204
    nueva = await cliente.post(
        "/api/v1/trampas",
        json={
            "lote_id": str(finca["lote"].id),
            "codigo_ica": "J3",
            "tipo": "jackson",
            "atrayente": "Trimedlure",
            "fecha_instalacion": str(date.today()),
            "geom": {"type": "Point", "coordinates": list(PUNTO)},
        },
        headers=h,
    )
    assert nueva.status_code == 201

    cuerpo = await _cambios(cliente, finca["tecnico"], DESDE)
    assert cuerpo["desde"].startswith("2026-06-01")
    assert _codigos(cuerpo["trampas"]["creados"]) == ["J3"]
    assert _codigos(cuerpo["trampas"]["modificados"]) == ["J1"]
    assert cuerpo["trampas"]["modificados"][0]["estado"] == "inactiva"
    assert cuerpo["trampas"]["borrados"] == [str(trampas["J2"].id)]
    assert cuerpo["lotes"] == {"creados": [], "modificados": [], "borrados": []}
    assert cuerpo["predios"]["borrados"] == []


async def test_predio_recien_asignado_llega_completo(cliente, session, finca, crear_usuario):
    await _envejecer(session)
    # Asignado después de DESDE: aunque los datos son viejos, el cliente no los tiene.
    nuevo = await crear_usuario(_correo("tecnico"), rol="tecnico", predios=[finca["predio"]])
    cuerpo = await _cambios(cliente, nuevo, DESDE)
    assert [p["id"] for p in cuerpo["predios"]["creados"]] == [str(finca["predio"].id)]
    assert _codigos(cuerpo["trampas"]["creados"]) == ["J1", "J2", "M1"]


async def test_predio_desasignado_o_borrado_se_descarta(cliente, session, finca):
    await _envejecer(session)
    await session.execute(
        update(PredioUsuario)
        .where(PredioUsuario.usuario_id == finca["tecnico"].id)
        .values(deleted_at=func.now())
    )
    cuerpo = await _cambios(cliente, finca["tecnico"], DESDE)
    assert cuerpo["predios"]["borrados"] == [str(finca["predio"].id)]
    assert cuerpo["trampas"] == {"creados": [], "modificados": [], "borrados": []}
    # Sin `desde` (carga completa) no hay nada que descartar.
    assert (await _cambios(cliente, finca["tecnico"]))["predios"]["borrados"] == []


async def test_no_ve_otros_predios_y_el_administrador_ve_todos(
    cliente, session, finca, crear_usuario
):
    otro = Predio(nombre="Otra finca", vereda="Icota", municipio="Cácota", area_ha=5)
    session.add(otro)
    await session.flush()
    tecnico = await _cambios(cliente, finca["tecnico"])
    assert str(otro.id) not in [p["id"] for p in tecnico["predios"]["creados"]]
    admin = await crear_usuario(_correo("admin"), rol="administrador")
    ids = [p["id"] for p in (await _cambios(cliente, admin))["predios"]["creados"]]
    assert {str(otro.id), str(finca["predio"].id)} <= set(ids)


async def test_lecturas_validadas_viajan_como_modificadas(cliente, session, finca):
    [resultado] = await _enviar(cliente, finca["tecnico"], [_lectura(finca, "J1", 1, machos=3)])
    await _envejecer(session)
    revision = await cliente.post(
        f"/api/v1/visitas/lecturas/{resultado['id']}/revision",
        json={"estado": "validada"},
        headers=encabezados(finca["agronomo"]),
    )
    assert revision.status_code == 200
    cuerpo = await _cambios(cliente, finca["tecnico"], DESDE)
    [lectura] = cuerpo["lecturas"]["modificados"]
    assert (lectura["id"], lectura["estado"]) == (resultado["id"], "validada")


async def test_cambios_errores(cliente, finca):
    assert (await cliente.get(URL_CAMBIOS)).status_code == 401
    h = encabezados(finca["tecnico"])
    futuro = _iso(datetime.now(UTC) + timedelta(days=1))
    assert (await cliente.get(URL_CAMBIOS, params={"desde": futuro}, headers=h)).status_code == 422
    sin_zona = {"desde": "2026-06-01T00:00:00"}
    assert (await cliente.get(URL_CAMBIOS, params=sin_zona, headers=h)).status_code == 422


# --- POST /sync/lecturas ---


async def test_bloque_desordenado_calcula_los_dias_por_fecha(cliente, finca):
    # Llegan al revés: la del día −3 antes que la del día −10. Instaladas hace 20 días.
    reciente = _lectura(finca, "J1", 3, machos=2)
    antigua = _lectura(finca, "J1", 10, machos=1)
    resultados = await _enviar(cliente, finca["tecnico"], [reciente, antigua])
    assert [r["id"] for r in resultados] == [reciente["id"], antigua["id"]]  # orden del envío
    assert [(r["resultado"], r["codigo"]) for r in resultados] == [("creada", 201)] * 2
    # La antigua cuenta desde la instalación (20 − 10 = 10 días); la reciente, desde la
    # antigua (10 − 3 = 7 días).
    assert [r["lectura"]["dias_exposicion"] for r in resultados] == [7, 10]


async def test_reenviar_el_bloque_no_duplica(cliente, session, finca):
    lecturas = [_lectura(finca, "J1", 2, machos=4), _lectura(finca, "M1", 2)]
    await _enviar(cliente, finca["tecnico"], lecturas)
    # Se cortó la conexión antes de la respuesta: el teléfono reenvía el mismo bloque, y
    # además cambió las capturas de una (no se editan: vale la primera versión).
    lecturas[0]["capitata_machos"] = 99
    resultados = await _enviar(cliente, finca["tecnico"], lecturas)
    assert [(r["resultado"], r["codigo"]) for r in resultados] == [("existente", 200)] * 2
    assert resultados[0]["lectura"]["capitata_machos"] == 4
    total = await session.scalar(
        select(func.count()).where(LecturaTrampa.id.in_([x["id"] for x in lecturas]))
    )
    assert total == 2


async def test_reenvio_trae_el_estado_de_validacion(cliente, finca):
    lectura = _lectura(finca, "J1", 1, machos=5)
    await _enviar(cliente, finca["tecnico"], [lectura])
    await cliente.post(
        f"/api/v1/visitas/lecturas/{lectura['id']}/revision",
        json={"estado": "rechazada", "motivo": "Conteo dudoso"},
        headers=encabezados(finca["agronomo"]),
    )
    [resultado] = await _enviar(cliente, finca["tecnico"], [lectura])
    assert resultado["resultado"] == "existente"
    assert (resultado["lectura"]["estado"], resultado["lectura"]["motivo_rechazo"]) == (
        "rechazada",
        "Conteo dudoso",
    )


async def test_un_error_no_impide_guardar_las_demas(cliente, finca, crear_usuario):
    otro = await crear_usuario(_correo("tecnico"), rol="tecnico", predios=[finca["predio"]])
    await _enviar(cliente, otro, [_lectura(finca, "J1", 1)])
    ajena = _lectura(finca, "J1", 1)  # otro técnico ya leyó J1 ese día
    inexistente = {**_lectura(finca, "J2", 1), "trampa_id": str(uuid.uuid4())}
    buena = _lectura(finca, "M1", 1, machos=1)
    resultados = await _enviar(cliente, finca["tecnico"], [ajena, inexistente, buena])
    assert [(r["resultado"], r["codigo"]) for r in resultados] == [
        ("error", 409),
        ("error", 404),
        ("creada", 201),
    ]
    assert resultados[0]["detalle"].startswith("Ya hay una lectura de J1")
    assert resultados[0]["lectura"] is None
    # Reenviar la que falló sigue fallando igual; la buena ya está.
    otra_vez = await _enviar(cliente, finca["tecnico"], [ajena, buena])
    assert [r["resultado"] for r in otra_vez] == ["error", "existente"]


async def test_id_de_otra_lectura_es_conflicto(cliente, finca):
    lectura = _lectura(finca, "J1", 1)
    await _enviar(cliente, finca["tecnico"], [lectura])
    # El mismo id en otra trampa: no es un reenvío, es un id repetido.
    [resultado] = await _enviar(
        cliente, finca["tecnico"], [{**lectura, "trampa_id": str(finca["trampas"]["J2"].id)}]
    )
    assert (resultado["resultado"], resultado["codigo"]) == ("error", 409)


async def test_bloque_permisos_y_validacion(cliente, finca, crear_usuario):
    lectura = _lectura(finca, "J1", 1)
    assert (await cliente.post(URL_BLOQUE, json={"lecturas": [lectura]})).status_code == 401
    productor = await crear_usuario(
        _correo("productor"), rol="productor", predios=[finca["predio"]]
    )
    h = encabezados(productor)
    assert (
        await cliente.post(URL_BLOQUE, json={"lecturas": [lectura]}, headers=h)
    ).status_code == 403
    h = encabezados(finca["tecnico"])
    assert (await cliente.post(URL_BLOQUE, json={"lecturas": []}, headers=h)).status_code == 422
    sin_id = {k: v for k, v in lectura.items() if k != "id"}
    assert (
        await cliente.post(URL_BLOQUE, json={"lecturas": [sin_id]}, headers=h)
    ).status_code == 422
    muchas = {"lecturas": [lectura] * 201}
    assert (await cliente.post(URL_BLOQUE, json=muchas, headers=h)).status_code == 422


async def test_rutas_y_actividades_de_la_semana_en_curso(cliente, session, finca):
    h = encabezados(finca["agronomo"])
    trampas = finca["trampas"]
    ruta = await cliente.post(
        "/api/v1/rutas",
        json={
            "lote_id": str(finca["lote"].id),
            "trampas": [str(trampas[c].id) for c in ("M1", "J2", "J1")],
        },
        headers=h,
    )
    assert ruta.status_code == 201, ruta.text
    hoy = hoy_bogota().isocalendar()
    actividad = await cliente.post(
        "/api/v1/plan",
        json={
            "lote_id": str(finca["lote"].id),
            "tipo": "visita_monitoreo",
            "anio": hoy.year,
            "semana": hoy.week,
            "responsable_id": str(finca["tecnico"].id),
        },
        headers=h,
    )
    assert actividad.status_code == 201, actividad.text
    completa = await _cambios(cliente, finca["tecnico"])
    [leida] = completa["rutas"]["creados"]
    assert [p["codigo_ica"] for p in leida["paradas"]] == ["M1", "J2", "J1"]
    assert [a["semana"] for a in completa["actividades"]["creados"]] == [hoy.week]

    await _envejecer(session)
    for modelo in (Ruta, PlanActividad):
        await session.execute(update(modelo).values(created_at=VIEJO, updated_at=VIEJO))
    # Una lectura de J1 hoy: la actividad no cambia, pero su avance sí. Viaja igual.
    await _enviar(cliente, finca["tecnico"], [_lectura(finca, "J1", 0)])
    cuerpo = await _cambios(cliente, finca["tecnico"], DESDE)
    [semana] = cuerpo["actividades"]["modificados"]
    assert (semana["semana"], semana["avance"]) == (hoy.week, {"hechas": 1, "total": 3})

    assert (await cliente.delete(f"/api/v1/rutas/{leida['id']}", headers=h)).status_code == 204
    cuerpo = await _cambios(cliente, finca["tecnico"], DESDE)
    assert cuerpo["rutas"]["borrados"] == [leida["id"]]


async def test_el_productor_sincroniza_sin_datos_del_personal(cliente, finca, crear_usuario):
    hoy = hoy_bogota().isocalendar()
    actividad = await cliente.post(
        "/api/v1/plan",
        json={
            "lote_id": str(finca["lote"].id),
            "tipo": "labor_cultural",
            "labor": "poda",
            "anio": hoy.year,
            "semana": hoy.week,
            "responsable_id": str(finca["tecnico"].id),
        },
        headers=encabezados(finca["agronomo"]),
    )
    assert actividad.status_code == 201
    await _enviar(cliente, finca["tecnico"], [_lectura(finca, "J1", 1)])
    productor = await crear_usuario(
        _correo("productor"), rol="productor", predios=[finca["predio"]]
    )
    cuerpo = await _cambios(cliente, productor)
    [vista] = cuerpo["actividades"]["creados"]
    assert (vista["responsable_id"], vista["responsable_nombre"]) == (None, None)
    [lectura] = cuerpo["lecturas"]["creados"]
    assert (lectura["responsable_id"], lectura["responsable_nombre"], lectura["posicion"]) == (
        None,
        None,
        None,
    )
