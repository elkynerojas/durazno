"""Pruebas de los scripts de administración."""

import uuid

import pytest

from app.scripts import crear_administrador, sembrar_e2e


async def test_promueve_una_cuenta_activa(crear_usuario, session):
    usuario = await crear_usuario(f"activo.{uuid.uuid4().hex[:8]}@ejemplo.com")
    mensaje = await crear_administrador.promover(session, usuario.correo)
    assert "ahora es administrador" in mensaje
    assert usuario.rol == "administrador"
    assert usuario.sesion_valida_desde is not None


async def test_no_se_promueve_una_cuenta_desactivada(crear_usuario, session):
    usuario = await crear_usuario(f"inactivo.{uuid.uuid4().hex[:8]}@ejemplo.com", activo=False)
    mensaje = await crear_administrador.promover(session, usuario.correo)
    assert "está desactivada" in mensaje
    assert usuario.rol == "tecnico"


@pytest.mark.parametrize("entorno", ["production", "staging"])
def test_sembrar_e2e_solo_en_desarrollo(monkeypatch, entorno):
    monkeypatch.setattr(
        sembrar_e2e, "get_settings", lambda: type("S", (), {"environment": entorno})()
    )
    monkeypatch.setenv("E2E_CLAVE", "clave-de-prueba-123")
    with pytest.raises(SystemExit, match="solo se crean en desarrollo"):
        sembrar_e2e.main()
