"""Pruebas del cumplimiento del plan (HU-22)."""

import uuid
from datetime import UTC, date, datetime

import pytest
from sqlalchemy import func, update

from app.api.v1.endpoints import plan as plan_endpoint
from app.api.v1.endpoints import visitas
from app.models.lote import Lote
from app.models.predio import Predio
from app.models.ruta import Ruta, RutaTrampa
from app.models.trampa import Trampa
from app.schemas.geo import PoligonoGeoJSON, PuntoGeoJSON, a_geometria
from app.services.cumplimiento import Avance, estado_actividad
from app.services.qr import generar_codigo
from tests.utilidades import encabezados

HOY = date(2026, 10, 17)  # sábado de la S42 (12–18 oct)
A = [[-72.640, 7.270], [-72.639, 7.270], [-72.639, 7.271], [-72.640, 7.271], [-72.640, 7.270]]


def _correo(prefijo):
    return f"{prefijo}.{uuid.uuid4().hex[:8]}@ejemplo.com"


# --- Regla del estado ---


@pytest.mark.parametrize(
    ("base", "semana", "avance", "esperado"),
    [
        ("programada", 42, Avance(3, 3), "cumplida"),  # ruta completa
        ("programada", 41, Avance(1, 3), "vencida"),  # parcial y su semana pasó
        ("programada", 42, Avance(1, 3), "programada"),  # parcial, aún en su semana
        ("reprogramada", 43, Avance(0, 3), "reprogramada"),
        ("programada", 41, Avance(0, 0), "vencida"),  # sin trampas por leer no se cumple
        ("cumplida", 30, None, "cumplida"),  # labor marcada a mano
        ("programada", 40, None, "vencida"),
        ("cancelada", 30, None, "cancelada"),
    ],
)
def test_estado_de_la_actividad(base, semana, avance, esperado):
    assert estado_actividad(base, 2026, semana, HOY, avance) == esperado


def test_el_domingo_aun_no_vence():
    # La S42 termina el domingo 18: ese día sigue programada; el lunes 19, vencida.
    assert estado_actividad("programada", 2026, 42, date(2026, 10, 18), None) == "programada"
    assert estado_actividad("programada", 2026, 42, date(2026, 10, 19), None) == "vencida"


# --- Endpoints ---


@pytest.fixture
async def datos(session, predio_vacio, crear_usuario, monkeypatch):
    monkeypatch.setattr(plan_endpoint, "hoy_bogota", lambda: HOY)
    monkeypatch.setattr(visitas, "ahora", lambda: datetime(2026, 10, 17, 18, tzinfo=UTC))
    lote = Lote(
        predio_id=predio_vacio.id,
        codigo="L-01",
        area_ha=1.22,
        geom=a_geometria(PoligonoGeoJSON(type="Polygon", coordinates=[A])),
    )
    session.add(lote)
    await session.flush()
    trampas = {
        codigo: Trampa(
            lote_id=lote.id,
            codigo_ica=codigo,
            codigo_qr=generar_codigo(),
            tipo=tipo,
            atrayente="x",
            fecha_instalacion=date(2026, 10, 1),
            geom=a_geometria(PuntoGeoJSON(type="Point", coordinates=(-72.6395, 7.2705))),
        )
        for codigo, tipo in (("J1", "jackson"), ("J2", "jackson"), ("M1", "mcphail"))
    }
    ruta = Ruta(lote_id=lote.id)
    session.add_all([*trampas.values(), ruta])
    await session.flush()
    session.add_all(
        RutaTrampa(ruta_id=ruta.id, trampa_id=t.id, orden=i)
        for i, t in enumerate(trampas.values(), 1)
    )
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


async def _programar(cliente, datos, semana, tipo="visita_monitoreo", **extra):
    respuesta = await cliente.post(
        "/api/v1/plan",
        json={
            "lote_id": str(datos["lote"].id),
            "tipo": tipo,
            "anio": 2026,
            "semana": semana,
            "responsable_id": str(datos["tecnico"].id),
            **extra,
        },
        headers=encabezados(datos["agronomo"]),
    )
    assert respuesta.status_code == 201, respuesta.text
    return respuesta.json()[0]


async def _lectura(cliente, datos, codigo, dia, cambio=False):
    respuesta = await cliente.post(
        "/api/v1/visitas/lecturas",
        json={
            "trampa_id": str(datos["trampas"][codigo].id),
            "observado_en": f"2026-10-{dia:02d}T08:00:00-05:00",
            "capitata_machos": 0,
            "capitata_hembras": 0,
            "anastrepha": 0,
            "estado_trampa": "buena",
            "cambio_atrayente": cambio,
        },
        headers=encabezados(datos["tecnico"]),
    )
    assert respuesta.status_code == 201, respuesta.text
    return respuesta.json()


async def _plan(cliente, datos):
    respuesta = await cliente.get(
        "/api/v1/plan",
        params={"predio_id": str(datos["predio"].id), "anio": 2026},
        headers=encabezados(datos["tecnico"]),
    )
    return {(a["tipo"], a["labor"], a["semana"]): a for a in respuesta.json()}


async def test_estado_de_las_visitas_y_los_cambios_segun_las_lecturas(cliente, datos):
    await _programar(cliente, datos, 41)
    await _programar(cliente, datos, 42)
    await _programar(cliente, datos, 43)
    await _programar(cliente, datos, 42, tipo="cambio_atrayente", tipo_trampa="jackson")
    await _lectura(cliente, datos, "J1", 7)  # S41: solo 1 de 3
    await _lectura(cliente, datos, "J1", 14, cambio=True)  # S42: las 3, J1 con cambio
    await _lectura(cliente, datos, "J2", 14)
    m1 = await _lectura(cliente, datos, "M1", 14)

    plan = await _plan(cliente, datos)
    resumen = lambda a: (a["estado"], a["avance"])  # noqa: E731
    assert resumen(plan["visita_monitoreo", None, 41]) == ("vencida", {"hechas": 1, "total": 3})
    assert resumen(plan["visita_monitoreo", None, 42]) == ("cumplida", {"hechas": 3, "total": 3})
    assert resumen(plan["visita_monitoreo", None, 43]) == ("programada", {"hechas": 0, "total": 3})
    # Cambio de trimedlure: 1 de las 2 Jackson; la S42 no ha terminado.
    assert resumen(plan["cambio_atrayente", None, 42]) == ("programada", {"hechas": 1, "total": 2})

    # Una lectura rechazada no cuenta: la visita de la S42 vuelve a quedar parcial.
    await cliente.post(
        f"/api/v1/visitas/lecturas/{m1['id']}/revision",
        json={"estado": "rechazada", "motivo": "Trampa caída"},
        headers=encabezados(datos["agronomo"]),
    )
    plan = await _plan(cliente, datos)
    assert resumen(plan["visita_monitoreo", None, 42]) == ("programada", {"hechas": 2, "total": 3})


async def test_las_labores_se_marcan_a_mano(cliente, datos, crear_usuario):
    poda = await _programar(cliente, datos, 40, tipo="labor_cultural", labor="poda")
    visita = await _programar(cliente, datos, 42)
    url = f"/api/v1/plan/{poda['id']}/cumplimiento"
    assert poda["estado"] == "vencida"  # la S40 ya pasó

    otro = await crear_usuario(_correo("tecnico"), rol="tecnico", predios=[datos["predio"]])
    ajeno = await cliente.post(url, json={"cumplida": True}, headers=encabezados(otro))
    assert ajeno.status_code == 403
    marcada = await cliente.post(
        url, json={"cumplida": True}, headers=encabezados(datos["tecnico"])
    )
    assert marcada.status_code == 200
    assert marcada.json()["estado"] == "cumplida"
    assert marcada.json()["cumplida_en"] is not None

    desmarcada = await cliente.post(
        url, json={"cumplida": False}, headers=encabezados(datos["agronomo"])
    )
    assert (desmarcada.json()["estado"], desmarcada.json()["cumplida_en"]) == ("vencida", None)
    no_labor = await cliente.post(
        f"/api/v1/plan/{visita['id']}/cumplimiento",
        json={"cumplida": True},
        headers=encabezados(datos["agronomo"]),
    )
    assert no_labor.status_code == 422


async def test_indicadores_por_semana_y_por_lote(cliente, datos):
    poda = await _programar(cliente, datos, 40, tipo="labor_cultural", labor="poda")
    await _programar(cliente, datos, 41)  # vencida (sin lecturas)
    await _programar(cliente, datos, 41, tipo="labor_cultural", labor="raleo")  # vencida
    await _programar(cliente, datos, 42)  # cumplida
    await _programar(cliente, datos, 42, tipo="cambio_atrayente", tipo_trampa="mcphail")
    await _programar(cliente, datos, 44)  # aún no se cuenta
    for codigo in ("J1", "J2", "M1"):
        await _lectura(cliente, datos, codigo, 14)
    await cliente.post(
        f"/api/v1/plan/{poda['id']}/cumplimiento",
        json={"cumplida": True},
        headers=encabezados(datos["tecnico"]),
    )

    respuesta = await cliente.get(
        "/api/v1/plan/cumplimiento",
        params={"predio_id": str(datos["predio"].id), "anio": 2026},
        headers=encabezados(datos["tecnico"]),
    )
    cuerpo = respuesta.json()
    # Hasta la S42 debían hacerse 5; cumplidas la poda y la visita de la S42: 2 / 5 = 40 %.
    assert cuerpo["hasta_semana"] == 42
    assert cuerpo["total"] == {
        "programadas": 5,
        "cumplidas": 2,
        "vencidas": 2,
        "reprogramadas": 0,
        "porcentaje": 40.0,
    }
    assert [
        (s["semana"], s["programadas"], s["cumplidas"], s["porcentaje"]) for s in cuerpo["semanas"]
    ] == [
        (40, 1, 1, 100.0),
        (41, 2, 0, 0.0),
        (42, 2, 1, 50.0),
    ]
    [lote] = cuerpo["lotes"]
    assert (lote["lote_codigo"], lote["porcentaje"]) == ("L-01", 40.0)


# --- Visita adicional desde una lectura con capturas (HU-23) ---

URL_ADICIONAL = "/api/v1/plan/visita-adicional"


async def _lectura_con(cliente, datos, codigo, dia, machos):
    respuesta = await cliente.post(
        "/api/v1/visitas/lecturas",
        json={
            "trampa_id": str(datos["trampas"][codigo].id),
            "observado_en": f"2026-10-{dia:02d}T08:00:00-05:00",
            "capitata_machos": machos,
            "capitata_hembras": 0,
            "anastrepha": 0,
            "estado_trampa": "buena",
            "cambio_atrayente": False,
        },
        headers=encabezados(datos["tecnico"]),
    )
    return respuesta.json()


async def test_visita_adicional_desde_una_lectura_con_capturas(cliente, datos):
    lectura = await _lectura_con(cliente, datos, "J1", 14, machos=5)
    h = encabezados(datos["agronomo"])
    visita_id = str(uuid.uuid4())
    respuesta = await cliente.post(
        URL_ADICIONAL, json={"id": visita_id, "lectura_id": lectura["id"]}, headers=h
    )
    assert respuesta.status_code == 201
    visita = respuesta.json()
    # Lectura del 14 de octubre (S42): la visita queda en la semana siguiente, la S43.
    assert (visita["tipo"], visita["anio"], visita["semana"]) == ("visita_monitoreo", 2026, 43)
    assert visita["responsable_id"] == str(datos["tecnico"].id)
    assert visita["lectura_origen_id"] == lectura["id"]
    assert visita["ruta_id"] is not None
    assert visita["notas"] == "Visita adicional por 5 capturas en J1 (14/10/2026)"

    repetida = await cliente.post(
        URL_ADICIONAL, json={"id": visita_id, "lectura_id": lectura["id"]}, headers=h
    )
    assert (repetida.status_code, repetida.json()["id"]) == (200, visita_id)

    elegida = await cliente.post(
        URL_ADICIONAL,
        json={
            "lectura_id": lectura["id"],
            "semana": 42,
            "responsable_id": str(datos["agronomo"].id),
        },
        headers=h,
    )
    assert (elegida.json()["semana"], elegida.json()["responsable_id"]) == (
        42,
        str(datos["agronomo"].id),
    )


async def test_visita_adicional_solo_con_capturas_validas_y_ruta(cliente, datos, session):
    h = encabezados(datos["agronomo"])
    sin_capturas = await _lectura_con(cliente, datos, "J2", 14, machos=0)
    assert (
        await cliente.post(URL_ADICIONAL, json={"lectura_id": sin_capturas["id"]}, headers=h)
    ).status_code == 422

    con_capturas = await _lectura_con(cliente, datos, "M1", 14, machos=3)
    await cliente.post(
        f"/api/v1/visitas/lecturas/{con_capturas['id']}/revision",
        json={"estado": "rechazada", "motivo": "Conteo dudoso"},
        headers=h,
    )
    assert (
        await cliente.post(URL_ADICIONAL, json={"lectura_id": con_capturas["id"]}, headers=h)
    ).status_code == 422

    otra = await _lectura_con(cliente, datos, "J1", 15, machos=2)
    await session.execute(update(Ruta).values(deleted_at=func.now()))
    sin_ruta = await cliente.post(URL_ADICIONAL, json={"lectura_id": otra["id"]}, headers=h)
    assert sin_ruta.status_code == 422
    assert "no tiene ruta" in sin_ruta.json()["detail"]


async def test_visita_adicional_permisos(cliente, datos, crear_usuario, session):
    lectura = await _lectura_con(cliente, datos, "J1", 14, machos=5)
    cuerpo = {"lectura_id": lectura["id"]}
    assert (await cliente.post(URL_ADICIONAL, json=cuerpo)).status_code == 401
    tecnico = await cliente.post(URL_ADICIONAL, json=cuerpo, headers=encabezados(datos["tecnico"]))
    assert tecnico.status_code == 403
    otro = Predio(nombre="Otra finca", vereda="Icota", municipio="Cácota", area_ha=5)
    session.add(otro)
    await session.flush()
    ajeno = await crear_usuario(_correo("agronomo"), rol="agronomo", predios=[otro])
    for lectura_id in (lectura["id"], str(uuid.uuid4())):
        respuesta = await cliente.post(
            URL_ADICIONAL, json={"lectura_id": lectura_id}, headers=encabezados(ajeno)
        )
        assert (respuesta.status_code, respuesta.json()["detail"]) == (404, "Lectura no encontrada")
