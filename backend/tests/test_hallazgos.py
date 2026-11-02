"""Pruebas de los hallazgos de la inspección (HU-41)."""

import uuid
from datetime import UTC, datetime

import pytest

from app.api.v1.endpoints import inspecciones
from app.models.lote import Lote
from app.models.predio import Predio
from app.schemas.geo import PoligonoGeoJSON, a_geometria
from tests.utilidades import encabezados

URL = "/api/v1/inspecciones/hallazgos"
PLAGA = "019a4600-0000-7000-8000-000000000002"
HONGO = "019a4600-0000-7000-8000-000000000001"
A = [[-72.640, 7.270], [-72.639, 7.270], [-72.639, 7.271], [-72.640, 7.271], [-72.640, 7.270]]
B = [[-72.639, 7.270], [-72.638, 7.270], [-72.638, 7.271], [-72.639, 7.271], [-72.639, 7.270]]
DENTRO_A = {"type": "Point", "coordinates": [-72.6395, 7.2705]}
DENTRO_B = {"type": "Point", "coordinates": [-72.6385, 7.2705]}
FUERA = {"type": "Point", "coordinates": [-72.6300, 7.2600]}
AHORA = datetime(2026, 11, 2, 15, 0, tzinfo=UTC)


def _correo(prefijo):
    return f"{prefijo}.{uuid.uuid4().hex[:8]}@ejemplo.com"


def _lote(predio, codigo, anillo):
    return Lote(
        predio_id=predio.id,
        codigo=codigo,
        area_ha=1.22,
        geom=a_geometria(PoligonoGeoJSON(type="Polygon", coordinates=[anillo])),
    )


@pytest.fixture(autouse=True)
def _ahora_fijo(monkeypatch):
    monkeypatch.setattr(inspecciones, "ahora", lambda: AHORA)


@pytest.fixture
async def datos(session, predio_vacio, crear_usuario):
    lote_a, lote_b = _lote(predio_vacio, "L-01", A), _lote(predio_vacio, "L-02", B)
    session.add_all([lote_a, lote_b])
    await session.flush()
    usuarios = {
        rol: await crear_usuario(_correo(rol), rol=rol, predios=[predio_vacio])
        for rol in ("tecnico", "agronomo", "productor")
    }
    usuarios["otro_tecnico"] = await crear_usuario(
        _correo("otro"), rol="tecnico", predios=[predio_vacio]
    )
    return {"predio": predio_vacio, "lote_a": lote_a, "lote_b": lote_b, **usuarios}


def _cuerpo(lote, **cambios):
    datos = {
        "lote_id": str(lote.id),
        "tipo_id": PLAGA,
        "titulo": "Larvas en frutos caídos",
        "descripcion": "Frutos caídos con perforaciones y larvas bajo los árboles 12 a 15.",
        "ubicacion": DENTRO_A,
        "precision_m": 6.5,
        "observado_en": "2026-11-02T09:15:00-05:00",
    }
    return {**datos, **cambios}


async def _registrar(cliente, usuario, lote, **cambios):
    return await cliente.post(URL, json=_cuerpo(lote, **cambios), headers=encabezados(usuario))


async def test_registrar_hallazgo(cliente, datos):
    r = await _registrar(cliente, datos["tecnico"], datos["lote_a"])
    assert r.status_code == 201
    h = r.json()
    assert h["lote_codigo"] == "L-01"
    assert h["tipo_nombre"] == "Plaga" and h["tipo_color"] == "#d35400"
    assert h["ubicacion"] == DENTRO_A
    assert h["precision_m"] == 6.5
    assert h["registrado_por_id"] == str(datos["tecnico"].id)
    assert h["estado"] == "abierto"
    assert h["evidencias"] == []
    assert h["predio_id"] == str(datos["predio"].id)


async def test_registrar_es_idempotente_por_id(cliente, datos):
    ident = str(uuid.uuid4())
    primero = await _registrar(cliente, datos["tecnico"], datos["lote_a"], id=ident)
    segundo = await _registrar(cliente, datos["tecnico"], datos["lote_a"], id=ident)
    assert primero.status_code == 201 and segundo.status_code == 200
    assert segundo.json()["id"] == ident
    lista = await cliente.get(
        URL, params={"predio_id": str(datos["predio"].id)}, headers=encabezados(datos["agronomo"])
    )
    assert lista.json()["total"] == 1
    # El mismo id desde otra cuenta no pisa el registro.
    otro = await _registrar(cliente, datos["otro_tecnico"], datos["lote_a"], id=ident)
    assert otro.status_code == 409


async def test_validaciones_al_registrar(cliente, datos):
    tecnico, lote = datos["tecnico"], datos["lote_a"]
    r = await _registrar(cliente, tecnico, lote, ubicacion=FUERA)
    assert r.status_code == 422
    assert r.json()["detail"] == "El punto no queda dentro del lote seleccionado"
    # Un punto del lote B registrado como del lote A.
    assert (await _registrar(cliente, tecnico, lote, ubicacion=DENTRO_B)).status_code == 422
    r = await _registrar(cliente, tecnico, lote, observado_en="2026-11-02T15:00:00-05:00")
    assert r.status_code == 422 and "futuro" in r.json()["detail"]
    r = await _registrar(cliente, tecnico, lote, tipo_id=str(uuid.uuid4()))
    assert r.status_code == 422
    for cambios in (
        {"titulo": ""},
        {"descripcion": "x" * 4001},
        {"ubicacion": {"type": "Point", "coordinates": [7.2705, -72.6395]}},
        {"observado_en": "2026-11-02T09:15:00"},
        {"precision_m": -1},
        {"registrado_por_id": str(tecnico.id)},
    ):
        assert (await _registrar(cliente, tecnico, lote, **cambios)).status_code == 422, cambios


async def test_tipo_desactivado_no_se_ofrece_al_registrar(cliente, datos, crear_usuario):
    admin = await crear_usuario(_correo("admin"), rol="administrador")
    r = await cliente.post(
        "/api/v1/inspecciones/tipos",
        json={"nombre": "Retirado", "color": "#000000"},
        headers=encabezados(admin),
    )
    tipo_id = r.json()["id"]
    await cliente.patch(
        f"/api/v1/inspecciones/tipos/{tipo_id}", json={"activo": False}, headers=encabezados(admin)
    )
    r = await _registrar(cliente, datos["tecnico"], datos["lote_a"], tipo_id=tipo_id)
    assert r.status_code == 422


async def test_permisos(cliente, datos, session, crear_usuario):
    assert (await cliente.post(URL, json=_cuerpo(datos["lote_a"]))).status_code == 401
    r = await _registrar(cliente, datos["productor"], datos["lote_a"])
    assert r.status_code == 403
    # Un técnico de otro predio no ve el lote.
    ajeno = Predio(nombre="Otra finca", vereda="X", municipio="Y", area_ha=5)
    session.add(ajeno)
    await session.flush()
    extrano = await crear_usuario(_correo("extrano"), rol="tecnico", predios=[ajeno])
    r = await _registrar(cliente, extrano, datos["lote_a"])
    assert r.status_code == 404
    creado = (await _registrar(cliente, datos["tecnico"], datos["lote_a"])).json()
    r = await cliente.get(f"{URL}/{creado['id']}", headers=encabezados(extrano))
    assert r.status_code == 404
    r = await cliente.get(
        URL, params={"predio_id": str(datos["predio"].id)}, headers=encabezados(extrano)
    )
    assert r.status_code == 404


async def test_productor_consulta_sin_ver_quien_registro(cliente, datos):
    creado = (await _registrar(cliente, datos["tecnico"], datos["lote_a"])).json()
    r = await cliente.get(f"{URL}/{creado['id']}", headers=encabezados(datos["productor"]))
    assert r.status_code == 200
    assert r.json()["registrado_por_id"] is None
    assert r.json()["registrado_por_nombre"] is None
    assert r.json()["titulo"] == "Larvas en frutos caídos"


async def test_listar_con_filtros_y_paginas(cliente, datos):
    tecnico = datos["tecnico"]
    await _registrar(cliente, tecnico, datos["lote_a"], observado_en="2026-10-30T08:00:00-05:00")
    await _registrar(
        cliente,
        tecnico,
        datos["lote_b"],
        ubicacion=DENTRO_B,
        tipo_id=HONGO,
        observado_en="2026-11-01T23:30:00-05:00",
    )
    await _registrar(cliente, tecnico, datos["lote_a"], observado_en="2026-11-02T07:00:00-05:00")

    async def listar(**filtros):
        r = await cliente.get(
            URL,
            params={"predio_id": str(datos["predio"].id), **filtros},
            headers=encabezados(datos["agronomo"]),
        )
        assert r.status_code == 200
        return r.json()

    todos = await listar()
    assert todos["total"] == 3
    fechas = [h["observado_en"] for h in todos["hallazgos"]]
    assert fechas == sorted(fechas, reverse=True)
    assert (await listar(lote_id=str(datos["lote_b"].id)))["total"] == 1
    assert (await listar(tipo_id=HONGO))["hallazgos"][0]["tipo_nombre"] == "Hongo o enfermedad"
    # Las 23:30 del 1 de noviembre en Bogotá ya son el 2 en UTC: cuenta como del 1.
    assert (await listar(desde="2026-11-01", hasta="2026-11-01"))["total"] == 1
    assert (await listar(desde="2026-11-01"))["total"] == 2
    pagina = await listar(por_pagina=2, pagina=2)
    assert pagina["total"] == 3 and len(pagina["hallazgos"]) == 1


async def test_editar_hallazgo(cliente, datos):
    creado = (await _registrar(cliente, datos["tecnico"], datos["lote_a"])).json()
    url = f"{URL}/{creado['id']}"
    r = await cliente.patch(
        url, json={"titulo": "Larvas de mosca"}, headers=encabezados(datos["otro_tecnico"])
    )
    assert r.status_code == 403
    r = await cliente.patch(
        url,
        json={"titulo": "Larvas de mosca", "tipo_id": HONGO},
        headers=encabezados(datos["tecnico"]),
    )
    assert r.status_code == 200
    assert (
        r.json()["titulo"] == "Larvas de mosca" and r.json()["tipo_nombre"] == "Hongo o enfermedad"
    )
    # Mover al lote B: el punto debe quedar dentro del nuevo lote.
    r = await cliente.patch(
        url,
        json={"lote_id": str(datos["lote_b"].id), "ubicacion": DENTRO_A},
        headers=encabezados(datos["agronomo"]),
    )
    assert r.status_code == 422
    r = await cliente.patch(
        url,
        json={"lote_id": str(datos["lote_b"].id), "ubicacion": DENTRO_B, "precision_m": None},
        headers=encabezados(datos["agronomo"]),
    )
    assert r.status_code == 200
    assert r.json()["lote_codigo"] == "L-02" and r.json()["precision_m"] is None
    r = await cliente.patch(
        url, json={"lote_id": str(datos["lote_a"].id)}, headers=encabezados(datos["agronomo"])
    )
    assert r.status_code == 422


async def test_borrado_logico(cliente, datos):
    creado = (await _registrar(cliente, datos["tecnico"], datos["lote_a"])).json()
    url = f"{URL}/{creado['id']}"
    assert (await cliente.delete(url, headers=encabezados(datos["tecnico"]))).status_code == 403
    assert (await cliente.delete(url, headers=encabezados(datos["agronomo"]))).status_code == 204
    assert (await cliente.get(url, headers=encabezados(datos["agronomo"]))).status_code == 404
    lista = await cliente.get(
        URL, params={"predio_id": str(datos["predio"].id)}, headers=encabezados(datos["agronomo"])
    )
    assert lista.json()["total"] == 0
    # Reenviar el id de un hallazgo borrado no lo revive.
    r = await _registrar(cliente, datos["tecnico"], datos["lote_a"], id=creado["id"])
    assert r.status_code == 409
