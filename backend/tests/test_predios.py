"""Pruebas de varios predios con usuarios asignados (HU-39, reemplaza la HU-07 de un predio)."""

import uuid

import pytest
from sqlalchemy import func, update

from app.api.v1.endpoints import predios as endpoints
from app.models.lote import Lote
from app.models.predio import Predio
from app.schemas.geo import PoligonoGeoJSON, a_geometria
from tests.utilidades import encabezados

URL = "/api/v1/predios"
LIMITE = {
    "type": "Polygon",
    "coordinates": [
        [[-72.59, 7.26], [-72.58, 7.26], [-72.58, 7.27], [-72.59, 7.27], [-72.59, 7.26]]
    ],
}
CORBATIN = {
    "type": "Polygon",
    "coordinates": [
        [[-72.59, 7.26], [-72.58, 7.27], [-72.58, 7.26], [-72.59, 7.27], [-72.59, 7.26]]
    ],
}


def _datos(**cambios) -> dict:
    datos = {
        "nombre": "Finca Icota",
        "vereda": "Icota",
        "municipio": "Cácota",
        "registro_ica": "54125-ICA-001",
        "area_ha": 32.5,
    }
    return {**datos, **cambios}


def _correo(prefijo: str) -> str:
    return f"{prefijo}.{uuid.uuid4().hex[:8]}@ejemplo.com"


@pytest.fixture(autouse=True)
async def _sin_predios(session):
    # La base de desarrollo puede tener predios reales; dentro de la transacción se ocultan.
    await session.execute(update(Predio).values(deleted_at=func.now()))
    await session.flush()


@pytest.fixture
async def admin(crear_usuario):
    return await crear_usuario(_correo("admin"), rol="administrador")


@pytest.fixture
async def dos_predios(session):
    a = Predio(nombre="Finca A", vereda="Icota", municipio="Cácota", area_ha=10)
    b = Predio(nombre="Finca B", vereda="Icota", municipio="Cácota", area_ha=20)
    session.add_all([a, b])
    await session.flush()
    return a, b


async def test_sin_sesion_responde_401(cliente):
    assert (await cliente.get(URL)).status_code == 401
    assert (await cliente.post(URL, json=_datos())).status_code == 401


async def test_el_administrador_crea_predios_con_limite(cliente, admin):
    respuesta = await cliente.post(URL, json=_datos(limite=LIMITE), headers=encabezados(admin))
    assert respuesta.status_code == 201
    assert respuesta.json()["limite"] == LIMITE
    otro = await cliente.post(URL, json=_datos(nombre="Finca 2"), headers=encabezados(admin))
    assert otro.status_code == 201
    lista = await cliente.get(URL, headers=encabezados(admin))
    assert [p["nombre"] for p in lista.json()] == ["Finca 2", "Finca Icota"]


@pytest.mark.parametrize("rol", ["tecnico", "productor", "agronomo"])
async def test_solo_el_administrador_crea_predios(cliente, crear_usuario, rol):
    otro = await crear_usuario(_correo(rol), rol=rol)
    assert (await cliente.post(URL, json=_datos(), headers=encabezados(otro))).status_code == 403


async def test_crear_es_idempotente_por_id(cliente, admin):
    datos = _datos(id=str(uuid.uuid4()))
    primera = await cliente.post(URL, json=datos, headers=encabezados(admin))
    segunda = await cliente.post(URL, json=datos, headers=encabezados(admin))
    assert (primera.status_code, segunda.status_code) == (201, 200)
    assert primera.json()["id"] == segunda.json()["id"] == datos["id"]


@pytest.mark.parametrize(
    "cambio",
    [{"area_ha": 0}, {"nombre": "  "}, {"municipio": None}, {"limite": CORBATIN}, {"rol": "x"}],
)
async def test_datos_invalidos_responden_422(cliente, admin, cambio):
    respuesta = await cliente.post(URL, json=_datos(**cambio), headers=encabezados(admin))
    assert respuesta.status_code == 422


async def test_cada_usuario_ve_solo_sus_predios(cliente, crear_usuario, dos_predios):
    a, b = dos_predios
    tecnico = await crear_usuario(_correo("tecnico"), predios=[a])
    sin_asignar = await crear_usuario(_correo("nadie"))

    lista = await cliente.get(URL, headers=encabezados(tecnico))
    assert [p["nombre"] for p in lista.json()] == ["Finca A"]
    assert (await cliente.get(f"{URL}/{a.id}", headers=encabezados(tecnico))).status_code == 200
    # Un predio ajeno responde como si no existiera.
    ajeno = await cliente.get(f"{URL}/{b.id}", headers=encabezados(tecnico))
    assert ajeno.status_code == 404
    assert (await cliente.get(URL, headers=encabezados(sin_asignar))).json() == []


async def test_el_administrador_ve_todos_sin_asignacion(cliente, admin, dos_predios):
    lista = await cliente.get(URL, headers=encabezados(admin))
    assert [p["nombre"] for p in lista.json()] == ["Finca A", "Finca B"]


async def test_editar_datos_del_predio(cliente, crear_usuario, admin, dos_predios):
    a, b = dos_predios
    agronomo = await crear_usuario(_correo("agronomo"), rol="agronomo", predios=[a])
    tecnico = await crear_usuario(_correo("tecnico"), predios=[a])

    propio = await cliente.put(
        f"{URL}/{a.id}", json=_datos(nombre="Finca A2"), headers=encabezados(agronomo)
    )
    assert propio.status_code == 200
    assert propio.json()["nombre"] == "Finca A2"
    ajeno = await cliente.put(f"{URL}/{b.id}", json=_datos(), headers=encabezados(agronomo))
    assert ajeno.status_code == 404
    sin_rol = await cliente.put(f"{URL}/{a.id}", json=_datos(), headers=encabezados(tecnico))
    assert sin_rol.status_code == 403
    admin_cualquiera = await cliente.put(
        f"{URL}/{b.id}", json=_datos(nombre="Finca B2"), headers=encabezados(admin)
    )
    assert admin_cualquiera.status_code == 200


async def test_eliminar_predio_sin_lotes(cliente, admin, dos_predios, session):
    a, b = dos_predios
    session.add(
        Lote(
            predio_id=b.id,
            codigo="L-1",
            area_ha=1.22,
            geom=a_geometria(PoligonoGeoJSON.model_validate(LIMITE)),
        )
    )
    await session.flush()
    con_lotes = await cliente.delete(f"{URL}/{b.id}", headers=encabezados(admin))
    assert con_lotes.status_code == 409
    assert (await cliente.delete(f"{URL}/{a.id}", headers=encabezados(admin))).status_code == 204
    assert (await cliente.get(f"{URL}/{a.id}", headers=encabezados(admin))).status_code == 404


async def test_solo_el_administrador_elimina(cliente, crear_usuario, dos_predios):
    a, _ = dos_predios
    agronomo = await crear_usuario(_correo("agronomo"), rol="agronomo", predios=[a])
    assert (await cliente.delete(f"{URL}/{a.id}", headers=encabezados(agronomo))).status_code == 403


async def test_asignar_y_quitar_personal(cliente, crear_usuario, admin, dos_predios):
    a, _ = dos_predios
    tecnico = await crear_usuario(_correo("tecnico"))
    url = f"{URL}/{a.id}/usuarios/{tecnico.id}"

    assert (await cliente.put(url, headers=encabezados(admin))).status_code == 204
    assert (await cliente.put(url, headers=encabezados(admin))).status_code == 204  # idempotente
    personal = await cliente.get(f"{URL}/{a.id}/usuarios", headers=encabezados(admin))
    assert [p["id"] for p in personal.json()] == [str(tecnico.id)]
    assert (await cliente.get(f"{URL}/{a.id}", headers=encabezados(tecnico))).status_code == 200

    assert (await cliente.delete(url, headers=encabezados(admin))).status_code == 204
    # Pierde el acceso de inmediato.
    assert (await cliente.get(f"{URL}/{a.id}", headers=encabezados(tecnico))).status_code == 404
    assert (await cliente.delete(url, headers=encabezados(admin))).status_code == 404


async def test_personal_del_predio_lo_ven_admin_y_agronomo_asignado(
    cliente, crear_usuario, dos_predios
):
    a, _ = dos_predios
    agronomo = await crear_usuario(_correo("agronomo"), rol="agronomo", predios=[a])
    tecnico = await crear_usuario(_correo("tecnico"), predios=[a])
    url = f"{URL}/{a.id}/usuarios"
    assert (await cliente.get(url, headers=encabezados(agronomo))).status_code == 200
    assert (await cliente.get(url, headers=encabezados(tecnico))).status_code == 403


async def test_solo_el_administrador_asigna(cliente, crear_usuario, admin, dos_predios):
    a, _ = dos_predios
    agronomo = await crear_usuario(_correo("agronomo"), rol="agronomo", predios=[a])
    tecnico = await crear_usuario(_correo("tecnico"))
    url = f"{URL}/{a.id}/usuarios/{tecnico.id}"
    assert (await cliente.put(url, headers=encabezados(agronomo))).status_code == 403
    inexistente = f"{URL}/{a.id}/usuarios/{uuid.uuid4()}"
    assert (await cliente.put(inexistente, headers=encabezados(admin))).status_code == 404


async def test_una_asignacion_simultanea_no_falla(
    cliente, crear_usuario, admin, dos_predios, monkeypatch
):
    # Simula la carrera: la verificación no ve la asignación que otra petición ya guardó, y el
    # índice único la rechaza al confirmar. Debe responder 204, no 500.
    a, _ = dos_predios
    tecnico = await crear_usuario(_correo("tecnico"), predios=[a])

    async def sin_asignacion(*_):
        return None

    monkeypatch.setattr(endpoints, "_asignacion", sin_asignacion)
    url = f"{URL}/{a.id}/usuarios/{tecnico.id}"
    assert (await cliente.put(url, headers=encabezados(admin))).status_code == 204


# --- Límite del predio ---

# 0,01° × 0,01° en Cácota: ≈ 1.105,9 m × 1.103,2 m ≈ 122,0 ha (cálculo a mano a 7,26° N).
LIMITE_KM = {
    "type": "Polygon",
    "coordinates": [
        [[-72.59, 7.26], [-72.58, 7.26], [-72.58, 7.27], [-72.59, 7.27], [-72.59, 7.26]]
    ],
}


def _cuadro(x0, y0, x1, y1):
    return PoligonoGeoJSON(
        type="Polygon", coordinates=[[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]
    )


async def test_con_limite_el_area_la_calcula_el_servidor(cliente, admin):
    datos = _datos(limite=LIMITE_KM, area_ha=1)  # el área enviada se ignora
    respuesta = await cliente.post(URL, json=datos, headers=encabezados(admin))
    assert respuesta.status_code == 201
    assert respuesta.json()["area_ha"] == pytest.approx(122.0, abs=0.5)
    sin_area = {k: v for k, v in _datos(limite=LIMITE_KM).items() if k != "area_ha"}
    assert (await cliente.post(URL, json=sin_area, headers=encabezados(admin))).status_code == 201


async def test_sin_limite_el_area_es_obligatoria(cliente, admin):
    sin_area = {k: v for k, v in _datos().items() if k != "area_ha"}
    respuesta = await cliente.post(URL, json=sin_area, headers=encabezados(admin))
    assert respuesta.status_code == 422
    creado = await cliente.post(URL, json=_datos(limite=LIMITE_KM), headers=encabezados(admin))
    quitar = {k: v for k, v in _datos(limite=None).items() if k != "area_ha"}
    respuesta = await cliente.put(
        f"{URL}/{creado.json()['id']}", json=quitar, headers=encabezados(admin)
    )
    assert respuesta.status_code == 422


async def test_advierte_los_lotes_por_fuera_del_limite(cliente, admin, dos_predios, session):
    a, _ = dos_predios
    session.add_all(
        [
            # Dentro del límite.
            Lote(
                predio_id=a.id,
                codigo="L-1",
                area_ha=1,
                geom=a_geometria(_cuadro(-72.589, 7.261, -72.588, 7.262)),
            ),
            # Sale a medias por el este.
            Lote(
                predio_id=a.id,
                codigo="L-2",
                area_ha=1,
                geom=a_geometria(_cuadro(-72.5805, 7.261, -72.5795, 7.262)),
            ),
            # Dentro, tocando el borde este: no avisa.
            Lote(
                predio_id=a.id,
                codigo="L-3",
                area_ha=1,
                geom=a_geometria(_cuadro(-72.581, 7.263, -72.580, 7.264)),
            ),
        ]
    )
    await session.flush()
    respuesta = await cliente.put(
        f"{URL}/{a.id}", json=_datos(limite=LIMITE_KM), headers=encabezados(admin)
    )
    assert respuesta.status_code == 200
    [aviso] = respuesta.json()["advertencias"]
    assert aviso.startswith("El lote L-2 sale del límite del predio (")
