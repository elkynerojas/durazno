"""Pruebas de la administración de cuentas (HU-06)."""

import uuid

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy import update

from app.api.v1.endpoints.usuarios import actualizar_usuario
from app.models.usuario import Usuario
from app.schemas.usuario import UsuarioActualizar
from tests.utilidades import CLAVE, encabezados

URL = "/api/v1/usuarios"


def _nuevo(**cambios) -> dict:
    datos = {
        "correo": f"{uuid.uuid4().hex[:12]}@ejemplo.com",
        "nombre_completo": "Técnico de Campo",
        "rol": "tecnico",
        "clave": CLAVE,
        "autorizacion_datos": True,
    }
    return {**datos, **cambios}


async def _login(cliente: AsyncClient, correo: str, clave: str = CLAVE):
    return await cliente.post("/api/v1/auth/token", data={"username": correo, "password": clave})


@pytest.fixture
async def admin(crear_usuario):
    return await crear_usuario(f"admin.{uuid.uuid4().hex[:8]}@ejemplo.com", rol="administrador")


async def test_sin_sesion_responde_401(cliente):
    assert (await cliente.get(URL)).status_code == 401
    assert (await cliente.post(URL, json=_nuevo())).status_code == 401


@pytest.mark.parametrize("rol", ["tecnico", "productor", "agronomo"])
async def test_solo_el_administrador_administra_cuentas(cliente, crear_usuario, rol):
    otro = await crear_usuario(f"{rol}.{uuid.uuid4().hex[:8]}@ejemplo.com", rol=rol)
    cabeceras = encabezados(otro)
    assert (await cliente.get(URL, headers=cabeceras)).status_code == 403
    assert (await cliente.get(f"{URL}/{otro.id}", headers=cabeceras)).status_code == 403
    assert (await cliente.post(URL, json=_nuevo(), headers=cabeceras)).status_code == 403
    patch = await cliente.patch(
        f"{URL}/{otro.id}", json={"rol": "administrador"}, headers=cabeceras
    )
    assert patch.status_code == 403


async def test_crear_usuario_que_luego_inicia_sesion(cliente, admin):
    datos = _nuevo(correo="  Nuevo.Tecnico@Ejemplo.com ")
    respuesta = await cliente.post(URL, json=datos, headers=encabezados(admin))
    assert respuesta.status_code == 201
    creado = respuesta.json()
    assert creado["correo"] == "nuevo.tecnico@ejemplo.com"
    assert creado["activo"] is True
    assert creado["autorizacion_datos_en"] is not None
    assert "clave" not in creado and "clave_hash" not in creado

    assert (await _login(cliente, "nuevo.tecnico@ejemplo.com")).status_code == 200


async def test_crear_exige_autorizacion_de_datos_y_campos_validos(cliente, admin):
    cabeceras = encabezados(admin)
    invalidos = [
        _nuevo(autorizacion_datos=False),
        _nuevo(rol="superusuario"),
        _nuevo(correo="no-es-correo"),
        _nuevo(clave="corta"),
        _nuevo(nombre_completo="   "),
        _nuevo(activo=False),
        _nuevo(clave_hash="x"),
    ]
    for datos in invalidos:
        assert (await cliente.post(URL, json=datos, headers=cabeceras)).status_code == 422


async def test_crear_con_correo_repetido_responde_409(cliente, admin):
    respuesta = await cliente.post(
        URL, json=_nuevo(correo=admin.correo.upper()), headers=encabezados(admin)
    )
    assert respuesta.status_code == 409
    assert respuesta.json()["detail"] == "Ya existe un usuario con ese correo"


async def test_crear_es_idempotente_por_id(cliente, admin):
    datos = _nuevo(id=str(uuid.uuid4()))
    primera = await cliente.post(URL, json=datos, headers=encabezados(admin))
    segunda = await cliente.post(URL, json=datos, headers=encabezados(admin))
    assert primera.status_code == 201
    assert segunda.status_code == 200
    assert primera.json()["id"] == segunda.json()["id"] == datos["id"]

    lista = await cliente.get(URL, headers=encabezados(admin))
    assert [u["id"] for u in lista.json()].count(datos["id"]) == 1


async def test_listar_filtra_por_activo_y_oculta_eliminados(cliente, admin, crear_usuario, session):
    inactivo = await crear_usuario(f"inactivo.{uuid.uuid4().hex[:8]}@ejemplo.com", activo=False)
    eliminado = await crear_usuario(f"eliminado.{uuid.uuid4().hex[:8]}@ejemplo.com")
    eliminado.deleted_at = eliminado.created_at
    await session.flush()
    cabeceras = encabezados(admin)

    todos = {u["id"] for u in (await cliente.get(URL, headers=cabeceras)).json()}
    activos = {
        u["id"] for u in (await cliente.get(URL, params={"activo": True}, headers=cabeceras)).json()
    }
    assert str(inactivo.id) in todos and str(inactivo.id) not in activos
    assert str(admin.id) in activos
    assert str(eliminado.id) not in todos
    respuesta = await cliente.get(f"{URL}/{eliminado.id}", headers=cabeceras)
    assert respuesta.status_code == 404


async def test_obtener_o_editar_inexistente_responde_404(cliente, admin):
    cabeceras = encabezados(admin)
    assert (await cliente.get(f"{URL}/{uuid.uuid4()}", headers=cabeceras)).status_code == 404
    respuesta = await cliente.patch(f"{URL}/{uuid.uuid4()}", json={}, headers=cabeceras)
    assert respuesta.status_code == 404


async def test_editar_datos_rol_y_clave(cliente, admin, crear_usuario):
    tecnico = await crear_usuario(f"editar.{uuid.uuid4().hex[:8]}@ejemplo.com")
    respuesta = await cliente.patch(
        f"{URL}/{tecnico.id}",
        json={"nombre_completo": "Nombre Nuevo", "rol": "productor", "clave": "otra-clave-456"},
        headers=encabezados(admin),
    )
    assert respuesta.status_code == 200
    assert respuesta.json()["nombre_completo"] == "Nombre Nuevo"
    assert respuesta.json()["rol"] == "productor"
    assert (await _login(cliente, tecnico.correo)).status_code == 401
    assert (await _login(cliente, tecnico.correo, "otra-clave-456")).status_code == 200


async def test_editar_a_correo_repetido_responde_409(cliente, admin, crear_usuario):
    tecnico = await crear_usuario(f"repetido.{uuid.uuid4().hex[:8]}@ejemplo.com")
    respuesta = await cliente.patch(
        f"{URL}/{tecnico.id}", json={"correo": admin.correo}, headers=encabezados(admin)
    )
    assert respuesta.status_code == 409


async def test_desactivar_conserva_la_cuenta_e_impide_el_acceso(cliente, admin, crear_usuario):
    tecnico = await crear_usuario(f"desactivar.{uuid.uuid4().hex[:8]}@ejemplo.com")
    sesion_abierta = encabezados(tecnico)

    respuesta = await cliente.patch(
        f"{URL}/{tecnico.id}", json={"activo": False}, headers=encabezados(admin)
    )
    assert respuesta.status_code == 200
    assert respuesta.json()["activo"] is False

    assert (await _login(cliente, tecnico.correo)).status_code == 401
    assert (await cliente.get("/api/v1/auth/yo", headers=sesion_abierta)).status_code == 401
    consulta = await cliente.get(f"{URL}/{tecnico.id}", headers=encabezados(admin))
    assert consulta.status_code == 200

    await cliente.patch(f"{URL}/{tecnico.id}", json={"activo": True}, headers=encabezados(admin))
    assert (await _login(cliente, tecnico.correo)).status_code == 200


@pytest.mark.parametrize("cambio", [{"activo": False}, {"rol": "tecnico"}])
async def test_el_administrador_no_puede_quitarse_acceso(cliente, admin, cambio):
    respuesta = await cliente.patch(f"{URL}/{admin.id}", json=cambio, headers=encabezados(admin))
    assert respuesta.status_code == 409
    respuesta = await cliente.patch(
        f"{URL}/{admin.id}", json={"nombre_completo": "Yo Mismo"}, headers=encabezados(admin)
    )
    assert respuesta.status_code == 200


async def test_reenviar_id_con_otros_datos_o_de_cuenta_eliminada_responde_409(
    cliente, admin, crear_usuario, session
):
    datos = _nuevo(id=str(uuid.uuid4()))
    assert (await cliente.post(URL, json=datos, headers=encabezados(admin))).status_code == 201
    otro_correo = {**datos, "correo": f"{uuid.uuid4().hex[:12]}@ejemplo.com"}
    respuesta = await cliente.post(URL, json=otro_correo, headers=encabezados(admin))
    assert respuesta.status_code == 409
    assert respuesta.json()["detail"] == "El id ya pertenece a otra cuenta"

    eliminado = await crear_usuario(f"borrado.{uuid.uuid4().hex[:8]}@ejemplo.com")
    eliminado.deleted_at = eliminado.created_at
    await session.flush()
    reenvio = _nuevo(id=str(eliminado.id), correo=eliminado.correo)
    respuesta = await cliente.post(URL, json=reenvio, headers=encabezados(admin))
    assert respuesta.status_code == 409
    assert respuesta.json()["detail"] == "El id ya pertenece a otra cuenta"


@pytest.mark.parametrize("cambio", [{"activo": False}, {"rol": "tecnico"}])
async def test_el_sistema_conserva_al_menos_un_administrador(session, crear_usuario, cambio):
    # Carrera entre dos administradores: B ya desactivó a A, pero la petición de A, autenticada
    # antes, intenta quitar a B. Debe fallar porque B es el único administrador activo.
    a = await crear_usuario(f"admin.a.{uuid.uuid4().hex[:8]}@ejemplo.com", rol="administrador")
    b = await crear_usuario(f"admin.b.{uuid.uuid4().hex[:8]}@ejemplo.com", rol="administrador")
    await session.execute(
        update(Usuario)
        .where(Usuario.rol == "administrador", Usuario.id != b.id)
        .values(activo=False)
    )
    await session.flush()

    with pytest.raises(HTTPException) as error:
        await actualizar_usuario(b.id, UsuarioActualizar(**cambio), a, session)
    assert error.value.status_code == 409
    assert error.value.detail == "El sistema debe conservar al menos un administrador activo"


@pytest.mark.parametrize("campo", ["rol", "activo", "correo", "nombre_completo", "clave"])
async def test_editar_con_null_responde_422(cliente, admin, crear_usuario, campo):
    tecnico = await crear_usuario(f"nulo.{uuid.uuid4().hex[:8]}@ejemplo.com")
    respuesta = await cliente.patch(
        f"{URL}/{tecnico.id}", json={campo: None}, headers=encabezados(admin)
    )
    assert respuesta.status_code == 422
