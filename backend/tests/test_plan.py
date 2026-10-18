"""Pruebas del plan anual de actividades (HU-21)."""

import uuid
from datetime import date

import pytest
from sqlalchemy import func, select, update

from app.api.v1.endpoints import plan as plan_endpoint
from app.models.lote import Lote
from app.models.plan_actividad import PlanActividad
from app.models.plan_cambio import PlanCambio
from app.models.predio import Predio
from app.models.predio_usuario import PredioUsuario
from app.models.ruta import Ruta, RutaTrampa
from app.models.trampa import Trampa
from app.schemas.geo import PoligonoGeoJSON, PuntoGeoJSON, a_geometria
from app.services.plan import ids_de_serie, semanas_del_anio, semanas_repetidas
from app.services.qr import generar_codigo
from tests.utilidades import encabezados

URL = "/api/v1/plan"
A = [[-72.640, 7.270], [-72.639, 7.270], [-72.639, 7.271], [-72.640, 7.271], [-72.640, 7.270]]


def _correo(prefijo):
    return f"{prefijo}.{uuid.uuid4().hex[:8]}@ejemplo.com"


# --- Semanas ISO (a mano: el 1 de enero de 2026 es jueves, así que 2026 tiene 53 semanas) ---


@pytest.mark.parametrize(
    ("anio", "semanas"), [(2026, 53), (2027, 52), (2020, 53), (2015, 53), (2024, 52)]
)
def test_semanas_del_anio(anio, semanas):
    assert semanas_del_anio(anio) == semanas


def test_semanas_repetidas():
    assert semanas_repetidas(10, 4, 30) == [10, 14, 18, 22, 26, 30]
    assert semanas_repetidas(50, 2, 53) == [50, 52]
    assert semanas_repetidas(7, 1, 7) == [7]


def test_ids_de_serie_deterministas():
    serie = uuid.uuid4()
    ids = ids_de_serie(serie, 3)
    assert ids[0] == serie
    assert ids == ids_de_serie(serie, 3)
    assert len(set(ids)) == 3


# --- Endpoints ---


@pytest.fixture(autouse=True)
def _hoy_fijo(monkeypatch):
    # Por defecto, «hoy» es el lunes de la S2 de 2026: las semanas siguientes aún no vencen.
    monkeypatch.setattr(plan_endpoint, "hoy_bogota", lambda: date(2026, 1, 5))


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
    agronomo = await crear_usuario(_correo("agronomo"), rol="agronomo", predios=[predio_vacio])
    tecnico = await crear_usuario(_correo("tecnico"), rol="tecnico", predios=[predio_vacio])
    return {"predio": predio_vacio, "lote": lote, "agronomo": agronomo, "tecnico": tecnico}


def _cuerpo(datos, **cambios):
    return {
        "lote_id": str(datos["lote"].id),
        "tipo": "labor_cultural",
        "labor": "poda",
        "anio": 2026,
        "semana": 6,
        "responsable_id": str(datos["tecnico"].id),
        **cambios,
    }


async def _programar(cliente, datos, usuario=None, **cambios):
    return await cliente.post(
        URL, json=_cuerpo(datos, **cambios), headers=encabezados(usuario or datos["agronomo"])
    )


async def test_sin_sesion_responde_401(cliente, datos):
    assert (await cliente.post(URL, json=_cuerpo(datos))).status_code == 401
    assert (await cliente.get(f"{URL}/catalogo")).status_code == 401


async def test_solo_el_agronomo_programa(cliente, datos):
    assert (await _programar(cliente, datos, usuario=datos["tecnico"])).status_code == 403


async def test_programar_una_labor(cliente, datos):
    respuesta = await _programar(cliente, datos, notas="Poda de formación")
    assert respuesta.status_code == 201
    [actividad] = respuesta.json()
    assert {
        k: actividad[k]
        for k in ("lote_codigo", "tipo", "labor", "anio", "semana", "estado", "serie_id", "notas")
    } == {
        "lote_codigo": "L-01",
        "tipo": "labor_cultural",
        "labor": "poda",
        "anio": 2026,
        "semana": 6,
        "estado": "programada",
        "serie_id": None,
        "notas": "Poda de formación",
    }
    assert actividad["responsable_nombre"] == "Persona de Prueba"


async def test_repetir_cada_n_semanas(cliente, datos):
    respuesta = await _programar(
        cliente,
        datos,
        tipo="cambio_atrayente",
        labor=None,
        tipo_trampa="jackson",
        semana=1,
        repetir={"cada_semanas": 4, "hasta_semana": 53},
    )
    assert respuesta.status_code == 201
    actividades = respuesta.json()
    # 1, 5, …, 53: catorce semanas en 2026 (año de 53 semanas).
    assert [a["semana"] for a in actividades] == list(range(1, 54, 4))
    assert len({a["serie_id"] for a in actividades}) == 1


async def test_semana_53_solo_en_anios_que_la_tienen(cliente, datos):
    assert (await _programar(cliente, datos, semana=53)).status_code == 201
    sin_53 = await _programar(cliente, datos, anio=2027, semana=53)
    assert sin_53.status_code == 422
    assert sin_53.json()["detail"] == "El año 2027 tiene 52 semanas ISO"
    repeticion = await _programar(
        cliente, datos, anio=2027, semana=1, repetir={"cada_semanas": 4, "hasta_semana": 53}
    )
    assert repeticion.status_code == 422


@pytest.mark.parametrize(
    "cambios",
    [
        {"labor": None},
        {"tipo": "cambio_atrayente"},
        {"tipo": "cambio_atrayente", "labor": None},
        {"semana": 0},
        {"semana": 10, "repetir": {"cada_semanas": 2, "hasta_semana": 8}},
        {"repetir": {"cada_semanas": 0, "hasta_semana": 20}},
        {"estado": "cumplida"},
    ],
    ids=[
        "labor-sin-labor",
        "cambio-con-labor",
        "cambio-sin-tipo-trampa",
        "semana-0",
        "repeticion-al-reves",
        "cada-0",
        "estado-no-se-envia",
    ],
)
async def test_datos_invalidos_responden_422(cliente, datos, cambios):
    assert (await _programar(cliente, datos, **cambios)).status_code == 422


async def test_visita_de_monitoreo_exige_ruta(cliente, datos, session):
    visita = {"tipo": "visita_monitoreo", "labor": None}
    sin_ruta = await _programar(cliente, datos, **visita)
    assert sin_ruta.status_code == 422
    assert "no tiene ruta" in sin_ruta.json()["detail"]

    ruta = Ruta(lote_id=datos["lote"].id)
    session.add(ruta)
    await session.flush()
    con_ruta = await _programar(cliente, datos, **visita)
    assert con_ruta.status_code == 201
    assert con_ruta.json()[0]["ruta_id"] == str(ruta.id)


async def test_responsable_debe_estar_asignado_al_predio(cliente, datos, crear_usuario, session):
    otro = Predio(nombre="Otra finca", vereda="Icota", municipio="Cácota", area_ha=5)
    session.add(otro)
    await session.flush()
    ajeno = await crear_usuario(_correo("tecnico"), rol="tecnico", predios=[otro])
    productor = await crear_usuario(
        _correo("productor"), rol="productor", predios=[datos["predio"]]
    )
    inactivo = await crear_usuario(
        _correo("tecnico"), rol="tecnico", activo=False, predios=[datos["predio"]]
    )
    for persona in (ajeno, productor, inactivo):
        respuesta = await _programar(cliente, datos, responsable_id=str(persona.id))
        assert respuesta.status_code == 422


async def test_lote_de_otro_predio_responde_404(cliente, datos, crear_usuario, session):
    otro = Predio(nombre="Otra finca", vereda="Icota", municipio="Cácota", area_ha=5)
    session.add(otro)
    await session.flush()
    ajeno = await crear_usuario(_correo("agronomo"), rol="agronomo", predios=[otro])
    assert (await _programar(cliente, datos, usuario=ajeno)).status_code == 404
    listado = await cliente.get(
        URL, params={"predio_id": str(datos["predio"].id)}, headers=encabezados(ajeno)
    )
    assert listado.status_code == 404


async def test_programar_es_idempotente_por_id(cliente, datos, session):
    serie = str(uuid.uuid4())
    repetir = {"cada_semanas": 2, "hasta_semana": 10}
    primera = await _programar(cliente, datos, id=serie, semana=2, repetir=repetir)
    repetida = await _programar(cliente, datos, id=serie, semana=2, repetir=repetir)
    assert (primera.status_code, repetida.status_code) == (201, 200)
    assert [a["id"] for a in repetida.json()] == [a["id"] for a in primera.json()]
    total = await session.scalar(
        select(func.count()).where(PlanActividad.serie_id == uuid.UUID(serie))
    )
    assert total == 5
    otra_cosa = await _programar(
        cliente, datos, id=serie, tipo="cambio_atrayente", labor=None, tipo_trampa="mcphail"
    )
    otra_semana = await _programar(cliente, datos, id=serie, semana=3, repetir=repetir)
    assert (otra_cosa.status_code, otra_semana.status_code) == (409, 409)


async def test_listar_el_plan_del_anio(cliente, datos, monkeypatch):
    monkeypatch.setattr(plan_endpoint, "hoy_bogota", lambda: date(2026, 10, 17))
    await _programar(cliente, datos, semana=6)
    await _programar(cliente, datos, anio=2027, semana=6)
    params = {"predio_id": str(datos["predio"].id)}
    tecnico = encabezados(datos["tecnico"])

    actual = await cliente.get(URL, params=params, headers=tecnico)
    assert actual.status_code == 200
    assert [(a["anio"], a["semana"]) for a in actual.json()] == [(2026, 6)]
    siguiente = await cliente.get(URL, params={**params, "anio": 2027}, headers=tecnico)
    assert [(a["anio"], a["semana"]) for a in siguiente.json()] == [(2027, 6)]
    otro_lote = await cliente.get(
        URL, params={**params, "lote_id": str(uuid.uuid4())}, headers=tecnico
    )
    assert otro_lote.json() == []


async def test_el_productor_no_ve_al_responsable(cliente, datos, crear_usuario):
    # Ley 1581: como en las lecturas, el productor consulta el plan sin datos del personal.
    await _programar(cliente, datos)
    productor = await crear_usuario(
        _correo("productor"), rol="productor", predios=[datos["predio"]]
    )
    params = {"predio_id": str(datos["predio"].id)}
    [vista] = (await cliente.get(URL, params=params, headers=encabezados(productor))).json()
    assert (vista["responsable_id"], vista["responsable_nombre"]) == (None, None)
    [gestion] = (
        await cliente.get(URL, params=params, headers=encabezados(datos["agronomo"]))
    ).json()
    assert gestion["responsable_nombre"] == "Persona de Prueba"


async def test_catalogo(cliente, datos):
    respuesta = await cliente.get(f"{URL}/catalogo", headers=encabezados(datos["tecnico"]))
    assert [t["valor"] for t in respuesta.json()["tipos"]] == [
        "visita_monitoreo",
        "cambio_atrayente",
        "labor_cultural",
    ]
    assert {"valor": "raleo", "nombre": "Raleo de frutos"} in respuesta.json()["labores"]


async def test_cambiar_responsable_y_notas(cliente, datos):
    [actividad] = (await _programar(cliente, datos)).json()
    url = f"{URL}/{actividad['id']}"
    h = encabezados(datos["agronomo"])
    cambiada = await cliente.patch(
        url, json={"responsable_id": str(datos["agronomo"].id), "notas": "Con tijera"}, headers=h
    )
    assert cambiada.status_code == 200
    assert (cambiada.json()["responsable_id"], cambiada.json()["notas"]) == (
        str(datos["agronomo"].id),
        "Con tijera",
    )
    sin_notas = await cliente.patch(url, json={"notas": None}, headers=h)
    assert sin_notas.json()["notas"] is None
    for invalido in (
        {"responsable_id": None},
        {"semana": 9},
        {"responsable_id": str(uuid.uuid4())},
    ):
        assert (await cliente.patch(url, json=invalido, headers=h)).status_code == 422
    sin_rol = await cliente.patch(url, json={"notas": "x"}, headers=encabezados(datos["tecnico"]))
    assert sin_rol.status_code == 403


async def test_eliminar_una_o_las_siguientes_de_la_serie(cliente, datos):
    actividades = (
        await _programar(cliente, datos, semana=2, repetir={"cada_semanas": 2, "hasta_semana": 10})
    ).json()
    h = encabezados(datos["agronomo"])
    params = {"predio_id": str(datos["predio"].id), "anio": 2026}
    semanas = lambda r: [a["semana"] for a in r.json()]  # noqa: E731 - ayuda local corta

    assert (await cliente.delete(f"{URL}/{actividades[0]['id']}", headers=h)).status_code == 204
    assert semanas(await cliente.get(URL, params=params, headers=h)) == [4, 6, 8, 10]
    borradas = await cliente.delete(f"{URL}/{actividades[2]['id']}?serie=true", headers=h)
    assert borradas.status_code == 204
    assert semanas(await cliente.get(URL, params=params, headers=h)) == [4]
    otra_vez = await cliente.delete(f"{URL}/{actividades[2]['id']}", headers=h)
    assert otra_vez.status_code == 404


# --- Mis actividades de la semana (HU-24) ---


@pytest.fixture
async def ruta_de_dos(session, datos):
    trampas = [
        Trampa(
            lote_id=datos["lote"].id,
            codigo_ica=f"ICA-P{i}",
            codigo_qr=generar_codigo(),
            tipo="jackson",
            atrayente="Trimedlure",
            fecha_instalacion=date(2026, 10, 1),
            geom=a_geometria(
                PuntoGeoJSON(type="Point", coordinates=(-72.6395, 7.2702 + i / 10000))
            ),
        )
        for i in (1, 2)
    ]
    ruta = Ruta(lote_id=datos["lote"].id)
    session.add_all([*trampas, ruta])
    await session.flush()
    session.add_all(
        RutaTrampa(ruta_id=ruta.id, trampa_id=t.id, orden=i) for i, t in enumerate(trampas, 1)
    )
    await session.flush()
    return ruta


async def test_mis_actividades_de_la_semana(cliente, datos, ruta_de_dos, monkeypatch):
    monkeypatch.setattr(plan_endpoint, "hoy_bogota", lambda: date(2026, 10, 14))  # semana 42
    await _programar(cliente, datos, tipo="visita_monitoreo", labor=None, semana=42)
    await _programar(cliente, datos, semana=42, notas="Poda de limpieza")
    await _programar(cliente, datos, semana=43)
    await _programar(cliente, datos, semana=42, responsable_id=str(datos["agronomo"].id))

    respuesta = await cliente.get(f"{URL}/mias", headers=encabezados(datos["tecnico"]))
    assert respuesta.status_code == 200
    semana = respuesta.json()
    assert (semana["anio"], semana["semana"], semana["desde"], semana["hasta"]) == (
        2026,
        42,
        "2026-10-12",
        "2026-10-18",
    )
    resumen = [
        (a["tipo"], a["lote_codigo"], a["predio_nombre"], a["ruta_paradas"], a["notas"])
        for a in semana["actividades"]
    ]
    assert resumen == [
        ("visita_monitoreo", "L-01", "Finca Icota", 2, None),
        ("labor_cultural", "L-01", "Finca Icota", None, "Poda de limpieza"),
    ]

    otra = await cliente.get(
        f"{URL}/mias", params={"anio": 2026, "semana": 43}, headers=encabezados(datos["tecnico"])
    )
    assert [a["semana"] for a in otra.json()["actividades"]] == [43]
    del_agronomo = await cliente.get(f"{URL}/mias", headers=encabezados(datos["agronomo"]))
    assert len(del_agronomo.json()["actividades"]) == 1


async def test_mis_actividades_sin_acceso_o_semana_invalida(cliente, datos, session):
    await _programar(cliente, datos, semana=42)
    # Si le quitan el predio, sus actividades de ese predio ya no aparecen.
    await session.execute(
        update(PredioUsuario)
        .where(PredioUsuario.usuario_id == datos["tecnico"].id)
        .values(deleted_at=func.now())
    )
    h = encabezados(datos["tecnico"])
    sin_predio = await cliente.get(f"{URL}/mias", params={"anio": 2026, "semana": 42}, headers=h)
    assert sin_predio.json()["actividades"] == []
    invalida = await cliente.get(f"{URL}/mias", params={"anio": 2027, "semana": 53}, headers=h)
    assert invalida.status_code == 422
    assert (await cliente.get(f"{URL}/mias")).status_code == 401


# --- Reprogramación e historial (HU-23) ---


async def _una(cliente, datos, **cambios):
    [actividad] = (await _programar(cliente, datos, semana=42, **cambios)).json()
    return actividad


async def test_reprogramar_exige_motivo_y_queda_en_el_historial(cliente, datos):
    actividad = await _una(cliente, datos)
    url = f"{URL}/{actividad['id']}/reprogramar"
    h = encabezados(datos["agronomo"])
    for invalido in ({"anio": 2026, "semana": 44}, {"anio": 2026, "semana": 44, "motivo": "x"}):
        assert (await cliente.post(url, json=invalido, headers=h)).status_code == 422

    motivo = "Aumento de capturas de C. capitata en L-01"
    movida = await cliente.post(url, json={"anio": 2026, "semana": 44, "motivo": motivo}, headers=h)
    assert movida.status_code == 200
    assert (movida.json()["semana"], movida.json()["estado"]) == (44, "reprogramada")

    historial = await cliente.get(
        f"{URL}/{actividad['id']}/historial", headers=encabezados(datos["tecnico"])
    )
    [cambio] = historial.json()
    assert {
        k: cambio[k]
        for k in ("accion", "semana_anterior", "semana_nueva", "motivo", "usuario", "lote_codigo")
    } == {
        "accion": "reprogramada",
        "semana_anterior": 42,
        "semana_nueva": 44,
        "motivo": motivo,
        "usuario": "Persona de Prueba",
        "lote_codigo": "L-01",
    }


@pytest.mark.parametrize(
    ("destino", "detalle"),
    [
        ({"anio": 2026, "semana": 42}, "La actividad ya está en esa semana: elija otra"),
        ({"anio": 2027, "semana": 53}, "El año 2027 tiene 52 semanas ISO"),
    ],
)
async def test_reprogramar_a_una_semana_invalida_responde_422(cliente, datos, destino, detalle):
    actividad = await _una(cliente, datos)
    respuesta = await cliente.post(
        f"{URL}/{actividad['id']}/reprogramar",
        json={**destino, "motivo": "Lluvias fuertes en la vereda"},
        headers=encabezados(datos["agronomo"]),
    )
    assert respuesta.status_code == 422
    assert respuesta.json()["detail"] == detalle


async def test_reprogramar_al_anio_siguiente(cliente, datos):
    actividad = await _una(cliente, datos)
    respuesta = await cliente.post(
        f"{URL}/{actividad['id']}/reprogramar",
        json={"anio": 2027, "semana": 2, "motivo": "Se aplaza la cosecha"},
        headers=encabezados(datos["agronomo"]),
    )
    assert (respuesta.json()["anio"], respuesta.json()["semana"]) == (2027, 2)


async def test_reprogramar_es_idempotente_por_id(cliente, datos, session):
    actividad = await _una(cliente, datos)
    otra = await _una(cliente, datos, labor="raleo")
    h = encabezados(datos["agronomo"])
    cuerpo = {"id": str(uuid.uuid4()), "anio": 2026, "semana": 44, "motivo": "Reenvío sin señal"}
    url = f"{URL}/{actividad['id']}/reprogramar"
    assert (await cliente.post(url, json=cuerpo, headers=h)).status_code == 200
    reenvio = await cliente.post(url, json={**cuerpo, "semana": 46}, headers=h)
    assert reenvio.json()["semana"] == 44
    total = await session.scalar(
        select(func.count()).where(PlanCambio.actividad_id == uuid.UUID(actividad["id"]))
    )
    assert total == 1
    ajeno = await cliente.post(f"{URL}/{otra['id']}/reprogramar", json=cuerpo, headers=h)
    assert ajeno.status_code == 409


async def test_reprogramar_permisos(cliente, datos, crear_usuario, session):
    actividad = await _una(cliente, datos)
    url = f"{URL}/{actividad['id']}/reprogramar"
    cuerpo = {"anio": 2026, "semana": 44, "motivo": "Intento sin permiso"}
    assert (await cliente.post(url, json=cuerpo)).status_code == 401
    tecnico = await cliente.post(url, json=cuerpo, headers=encabezados(datos["tecnico"]))
    assert tecnico.status_code == 403
    otro = Predio(nombre="Otra finca", vereda="Icota", municipio="Cácota", area_ha=5)
    session.add(otro)
    await session.flush()
    ajeno = await crear_usuario(_correo("agronomo"), rol="agronomo", predios=[otro])
    h = encabezados(ajeno)
    assert (await cliente.post(url, json=cuerpo, headers=h)).status_code == 404
    assert (await cliente.get(f"{URL}/{actividad['id']}/historial", headers=h)).status_code == 404
    cambios = await cliente.get(
        f"{URL}/cambios", params={"predio_id": str(datos["predio"].id)}, headers=h
    )
    assert cambios.status_code == 404


async def test_historial_del_predio(cliente, datos):
    h = encabezados(datos["agronomo"])
    actividad = await _una(cliente, datos)
    serie = (
        await _programar(
            cliente, datos, semana=10, repetir={"cada_semanas": 10, "hasta_semana": 30}
        )
    ).json()
    await cliente.patch(
        f"{URL}/{actividad['id']}", json={"responsable_id": str(datos["agronomo"].id)}, headers=h
    )
    # Reasignar a la misma persona no deja rastro.
    await cliente.patch(
        f"{URL}/{actividad['id']}", json={"responsable_id": str(datos["agronomo"].id)}, headers=h
    )
    await cliente.delete(f"{URL}/{serie[1]['id']}?serie=true", headers=h)

    respuesta = await cliente.get(
        f"{URL}/cambios",
        params={"predio_id": str(datos["predio"].id)},
        headers=encabezados(datos["tecnico"]),
    )
    cambios = respuesta.json()
    assert sorted((c["accion"], c["semana_anterior"]) for c in cambios) == [
        ("eliminada", 20),
        ("eliminada", 30),
        ("responsable", 42),
    ]
    [reasignacion] = [c for c in cambios if c["accion"] == "responsable"]
    assert (reasignacion["responsable_anterior"], reasignacion["responsable_nuevo"]) == (
        "Persona de Prueba",
        "Persona de Prueba",
    )
