"""Pruebas del seguimiento de los hallazgos desde el plan (HU-42)."""

import uuid
from datetime import UTC, date, datetime

import pytest
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError

from app.api.v1.endpoints import inspecciones, plan
from app.models.hallazgo import Hallazgo
from app.models.lote import Lote
from app.models.plan_actividad import PlanActividad
from app.models.predio import Predio
from app.models.predio_usuario import PredioUsuario
from app.services.inspecciones import estado_hallazgo
from tests.test_hallazgos import DENTRO_B, _correo, _registrar, datos  # noqa: F401
from tests.utilidades import encabezados

URL_PLAN = "/api/v1/plan"
URL_ATENCION = f"{URL_PLAN}/atencion-hallazgo"
URL_HALLAZGOS = "/api/v1/inspecciones/hallazgos"
# Miércoles de la semana ISO 45 de 2026.
HOY = date(2026, 11, 4)


@pytest.fixture(autouse=True)
def _hoy_fijo(monkeypatch):
    monkeypatch.setattr(plan, "hoy_bogota", lambda: HOY)
    monkeypatch.setattr(inspecciones, "hoy_bogota", lambda: HOY)


@pytest.fixture
async def hallazgo(cliente, datos):  # noqa: F811
    r = await _registrar(cliente, datos["tecnico"], datos["lote_a"])
    assert r.status_code == 201
    return r.json()


async def _programar(cliente, usuario, hallazgo, responsable, **cambios):
    cuerpo = {"hallazgo_id": hallazgo["id"], "responsable_id": str(responsable.id), **cambios}
    return await cliente.post(URL_ATENCION, json=cuerpo, headers=encabezados(usuario))


async def _ver(cliente, usuario, hallazgo):
    r = await cliente.get(f"{URL_HALLAZGOS}/{hallazgo['id']}", headers=encabezados(usuario))
    assert r.status_code == 200
    return r.json()


async def _ids_con_estado(cliente, datos, estado):  # noqa: F811
    r = await cliente.get(
        URL_HALLAZGOS,
        params={"predio_id": str(datos["predio"].id), "estado": estado},
        headers=encabezados(datos["agronomo"]),
    )
    assert r.status_code == 200
    return {h["id"] for h in r.json()["hallazgos"]}


@pytest.mark.parametrize(
    ("estados", "esperado"),
    [
        ([], ("abierto", False)),
        (["cancelada"], ("abierto", False)),
        (["programada"], ("en_atencion", False)),
        (["reprogramada"], ("en_atencion", False)),
        (["vencida"], ("en_atencion", True)),
        (["vencida", "programada"], ("en_atencion", False)),
        (["cancelada", "cumplida"], ("atendido", False)),
    ],
)
def test_estado_hallazgo(estados, esperado):
    assert estado_hallazgo(estados) == esperado


async def test_ciclo_abierto_en_atencion_atendido(cliente, datos, hallazgo):  # noqa: F811
    assert (await _ver(cliente, datos["agronomo"], hallazgo))["estado"] == "abierto"
    assert hallazgo["id"] in await _ids_con_estado(cliente, datos, "abierto")

    r = await _programar(cliente, datos["agronomo"], hallazgo, datos["tecnico"])
    assert r.status_code == 201
    actividad = r.json()
    assert actividad["tipo"] == "atencion_hallazgo"
    assert actividad["hallazgo_id"] == hallazgo["id"]
    assert (actividad["anio"], actividad["semana"]) == (2026, 45)
    assert actividad["notas"] == hallazgo["titulo"]
    assert actividad["lote_id"] == hallazgo["lote_id"]
    assert actividad["avance"] is None

    visto = await _ver(cliente, datos["agronomo"], hallazgo)
    assert (visto["estado"], visto["vencida"]) == ("en_atencion", False)
    [atencion] = visto["atenciones"]
    assert atencion["id"] == actividad["id"]
    assert atencion["responsable_nombre"] == datos["tecnico"].nombre_completo
    assert hallazgo["id"] in await _ids_con_estado(cliente, datos, "en_atencion")
    assert hallazgo["id"] not in await _ids_con_estado(cliente, datos, "abierto")

    # El responsable la marca cumplida con lo que hizo.
    r = await cliente.post(
        f"{URL_PLAN}/{actividad['id']}/cumplimiento",
        json={"cumplida": True, "nota": "Se retiraron y enterraron los frutos caídos"},
        headers=encabezados(datos["tecnico"]),
    )
    assert r.status_code == 200
    assert r.json()["estado"] == "cumplida"
    assert r.json()["nota_cumplimiento"] == "Se retiraron y enterraron los frutos caídos"
    visto = await _ver(cliente, datos["agronomo"], hallazgo)
    assert visto["estado"] == "atendido"
    assert visto["atenciones"][0]["nota_cumplimiento"].startswith("Se retiraron")
    assert hallazgo["id"] in await _ids_con_estado(cliente, datos, "atendido")
    assert hallazgo["id"] not in await _ids_con_estado(cliente, datos, "en_atencion")

    # Desmarcarla la devuelve a «en atención» y borra la nota.
    r = await cliente.post(
        f"{URL_PLAN}/{actividad['id']}/cumplimiento",
        json={"cumplida": False},
        headers=encabezados(datos["agronomo"]),
    )
    assert r.json()["nota_cumplimiento"] is None
    assert (await _ver(cliente, datos["agronomo"], hallazgo))["estado"] == "en_atencion"


async def test_vencida_reprogramada_y_eliminada(cliente, datos, hallazgo):  # noqa: F811
    r = await _programar(cliente, datos["agronomo"], hallazgo, datos["tecnico"], semana=44)
    actividad = r.json()
    assert actividad["estado"] == "vencida"
    visto = await _ver(cliente, datos["agronomo"], hallazgo)
    assert (visto["estado"], visto["vencida"]) == ("en_atencion", True)

    r = await cliente.post(
        f"{URL_PLAN}/{actividad['id']}/reprogramar",
        json={"anio": 2026, "semana": 46, "motivo": "Lluvias toda la semana"},
        headers=encabezados(datos["agronomo"]),
    )
    assert r.status_code == 200
    visto = await _ver(cliente, datos["agronomo"], hallazgo)
    assert (visto["estado"], visto["vencida"]) == ("en_atencion", False)
    assert visto["atenciones"][0]["estado"] == "reprogramada"

    r = await cliente.delete(
        f"{URL_PLAN}/{actividad['id']}", headers=encabezados(datos["agronomo"])
    )
    assert r.status_code == 204
    visto = await _ver(cliente, datos["agronomo"], hallazgo)
    assert (visto["estado"], visto["atenciones"]) == ("abierto", [])
    # Ya sin atención pendiente, se puede volver a programar.
    r = await _programar(cliente, datos["agronomo"], hallazgo, datos["tecnico"])
    assert r.status_code == 201


async def test_no_se_programa_dos_veces(cliente, datos, hallazgo):  # noqa: F811
    primera = (await _programar(cliente, datos["agronomo"], hallazgo, datos["tecnico"])).json()
    r = await _programar(cliente, datos["agronomo"], hallazgo, datos["tecnico"])
    assert r.status_code == 422
    assert "ya tiene una atención programada" in r.json()["detail"]

    await cliente.post(
        f"{URL_PLAN}/{primera['id']}/cumplimiento",
        json={"cumplida": True},
        headers=encabezados(datos["agronomo"]),
    )
    r = await _programar(cliente, datos["agronomo"], hallazgo, datos["tecnico"])
    assert r.status_code == 422
    assert r.json()["detail"] == "El hallazgo ya fue atendido"


async def test_programar_idempotente(cliente, datos, hallazgo):  # noqa: F811
    ident = str(uuid.uuid4())
    primero = await _programar(cliente, datos["agronomo"], hallazgo, datos["tecnico"], id=ident)
    segundo = await _programar(cliente, datos["agronomo"], hallazgo, datos["tecnico"], id=ident)
    assert (primero.status_code, segundo.status_code) == (201, 200)
    assert segundo.json()["id"] == ident

    otro = (await _registrar(cliente, datos["tecnico"], datos["lote_a"], titulo="Otro")).json()
    r = await _programar(cliente, datos["agronomo"], otro, datos["tecnico"], id=ident)
    assert r.status_code == 409


async def test_permisos_y_validaciones(cliente, datos, hallazgo, crear_usuario):  # noqa: F811
    r = await cliente.post(
        URL_ATENCION,
        json={"hallazgo_id": hallazgo["id"], "responsable_id": str(datos["tecnico"].id)},
    )
    assert r.status_code == 401
    for rol in ("tecnico", "productor"):
        r = await _programar(cliente, datos[rol], hallazgo, datos["tecnico"])
        assert r.status_code == 403
    ajeno = await crear_usuario(_correo("ajeno"), rol="agronomo")
    r = await _programar(cliente, ajeno, hallazgo, datos["tecnico"])
    assert r.status_code == 404
    r = await _programar(cliente, datos["agronomo"], {"id": str(uuid.uuid4())}, datos["tecnico"])
    assert r.status_code == 404
    r = await _programar(cliente, datos["agronomo"], hallazgo, datos["productor"])
    assert r.status_code == 422
    r = await _programar(
        cliente, datos["agronomo"], hallazgo, datos["tecnico"], anio=2025, semana=53
    )
    assert r.status_code == 422
    # La atención no se programa por la vía general del plan.
    r = await cliente.post(
        URL_PLAN,
        json={
            "lote_id": hallazgo["lote_id"],
            "tipo": "atencion_hallazgo",
            "anio": 2026,
            "semana": 45,
            "responsable_id": str(datos["tecnico"].id),
        },
        headers=encabezados(datos["agronomo"]),
    )
    assert r.status_code == 422


async def test_solo_el_responsable_o_la_gestion_la_cumplen(cliente, datos, hallazgo):  # noqa: F811
    actividad = (await _programar(cliente, datos["agronomo"], hallazgo, datos["tecnico"])).json()
    url = f"{URL_PLAN}/{actividad['id']}/cumplimiento"
    r = await cliente.post(url, json={"cumplida": True}, headers=encabezados(datos["otro_tecnico"]))
    assert r.status_code == 403
    r = await cliente.post(url, json={"cumplida": True}, headers=encabezados(datos["productor"]))
    assert r.status_code == 403
    r = await cliente.post(
        url, json={"cumplida": True, "nota": "x" * 301}, headers=encabezados(datos["tecnico"])
    )
    assert r.status_code == 422


async def test_el_productor_no_ve_quien_atiende(cliente, datos, hallazgo):  # noqa: F811
    await _programar(cliente, datos["agronomo"], hallazgo, datos["tecnico"])
    [atencion] = (await _ver(cliente, datos["productor"], hallazgo))["atenciones"]
    assert atencion["responsable_nombre"] is None


async def test_la_atencion_sigue_al_hallazgo(cliente, datos, hallazgo):  # noqa: F811
    actividad = (await _programar(cliente, datos["agronomo"], hallazgo, datos["tecnico"])).json()
    # Cambiar de lote mueve la actividad al nuevo lote.
    r = await cliente.patch(
        f"{URL_HALLAZGOS}/{hallazgo['id']}",
        json={"lote_id": str(datos["lote_b"].id), "ubicacion": DENTRO_B},
        headers=encabezados(datos["agronomo"]),
    )
    assert r.status_code == 200
    plan_predio = await cliente.get(
        URL_PLAN,
        params={"predio_id": str(datos["predio"].id), "anio": 2026},
        headers=encabezados(datos["agronomo"]),
    )
    [movida] = [a for a in plan_predio.json() if a["id"] == actividad["id"]]
    assert movida["lote_codigo"] == "L-02"

    # Eliminar el hallazgo saca su atención del plan.
    r = await cliente.delete(
        f"{URL_HALLAZGOS}/{hallazgo['id']}", headers=encabezados(datos["agronomo"])
    )
    assert r.status_code == 204
    plan_predio = await cliente.get(
        URL_PLAN,
        params={"predio_id": str(datos["predio"].id), "anio": 2026},
        headers=encabezados(datos["agronomo"]),
    )
    assert actividad["id"] not in {a["id"] for a in plan_predio.json()}


async def test_mi_semana_incluye_la_atencion(cliente, datos, hallazgo):  # noqa: F811
    actividad = (await _programar(cliente, datos["agronomo"], hallazgo, datos["tecnico"])).json()
    r = await cliente.get(
        f"{URL_PLAN}/mias",
        params={"anio": 2026, "semana": 45},
        headers=encabezados(datos["tecnico"]),
    )
    [mia] = [a for a in r.json()["actividades"] if a["id"] == actividad["id"]]
    assert mia["hallazgo_id"] == hallazgo["id"]


async def test_sincronizacion_con_hallazgos(cliente, session, datos, hallazgo):  # noqa: F811
    r = await cliente.get("/api/v1/sync/cambios", headers=encabezados(datos["tecnico"]))
    assert r.status_code == 200
    cuerpo = r.json()
    assert hallazgo["id"] in {h["id"] for h in cuerpo["hallazgos"]["creados"]}
    assert "Plaga" in {t["nombre"] for t in cuerpo["tipos_hallazgo"]["creados"]}

    # Lo creado queda como si el cliente lo tuviera desde antes de `desde` (la prueba corre en
    # una sola transacción y `now()` no avanza).
    viejo, desde = datetime(2026, 1, 1, tzinfo=UTC), datetime(2026, 6, 1, tzinfo=UTC)
    for modelo in (Predio, Lote, PredioUsuario, Hallazgo):
        await session.execute(update(modelo).values(created_at=viejo, updated_at=viejo))
    r = await cliente.get(
        "/api/v1/sync/cambios",
        params={"desde": desde.isoformat()},
        headers=encabezados(datos["tecnico"]),
    )
    assert r.json()["hallazgos"]["modificados"] == []

    # Un cambio en su atención hace que el hallazgo vuelva a viajar, con su nuevo estado.
    await _programar(cliente, datos["agronomo"], hallazgo, datos["tecnico"])
    r = await cliente.get(
        "/api/v1/sync/cambios",
        params={"desde": desde.isoformat()},
        headers=encabezados(datos["tecnico"]),
    )
    [viaja] = r.json()["hallazgos"]["modificados"]
    assert (viaja["id"], viaja["estado"]) == (hallazgo["id"], "en_atencion")


async def test_la_nota_de_una_cumplida_la_cambia_quien_la_marco(cliente, datos, hallazgo):  # noqa: F811
    actividad = (await _programar(cliente, datos["agronomo"], hallazgo, datos["tecnico"])).json()
    url = f"{URL_PLAN}/{actividad['id']}/cumplimiento"
    r = await cliente.post(
        url, json={"cumplida": True, "nota": "Poda"}, headers=encabezados(datos["agronomo"])
    )
    assert r.status_code == 200
    r = await cliente.post(
        url, json={"cumplida": True, "nota": "Otra"}, headers=encabezados(datos["tecnico"])
    )
    assert r.status_code == 403
    r = await cliente.post(
        url, json={"cumplida": True, "nota": "Poda y cal"}, headers=encabezados(datos["agronomo"])
    )
    assert r.json()["nota_cumplimiento"] == "Poda y cal"


async def test_una_sola_atencion_vigente_en_la_base(session, datos, hallazgo):  # noqa: F811
    def atencion():
        return PlanActividad(
            predio_id=datos["predio"].id,
            lote_id=datos["lote_a"].id,
            tipo="atencion_hallazgo",
            hallazgo_id=uuid.UUID(hallazgo["id"]),
            anio=2026,
            semana=45,
            responsable_id=datos["tecnico"].id,
        )

    session.add(atencion())
    await session.flush()
    with pytest.raises(IntegrityError):
        async with session.begin_nested():
            session.add(atencion())
            await session.flush()
