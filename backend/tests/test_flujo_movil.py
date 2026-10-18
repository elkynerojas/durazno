"""La prueba del flujo móvil (HU-33) corre en la CI contra la aplicación en memoria; en el
servidor desplegado se ejecuta con `python -m app.scripts.flujo_movil --url ...`."""

import uuid
from datetime import UTC, date, datetime, timedelta

import httpx
import pytest
from sqlalchemy import update

from app.models.lote import Lote
from app.models.trampa import Trampa
from app.schemas.geo import PoligonoGeoJSON, PuntoGeoJSON, a_geometria
from app.scripts.flujo_movil import Flujo, informe, recorrer
from app.services.qr import generar_codigo
from tests.utilidades import CLAVE

A = [[-72.640, 7.270], [-72.639, 7.270], [-72.639, 7.271], [-72.640, 7.271], [-72.640, 7.270]]


@pytest.fixture
async def tecnico(session, predio_vacio, crear_usuario):
    lote = Lote(
        predio_id=predio_vacio.id,
        codigo="L-01",
        area_ha=1.22,
        geom=a_geometria(PoligonoGeoJSON(type="Polygon", coordinates=[A])),
    )
    session.add(lote)
    await session.flush()
    session.add(
        Trampa(
            lote_id=lote.id,
            codigo_ica="NS-CAC-0001",
            codigo_qr=generar_codigo(),
            tipo="jackson",
            atrayente="Trimedlure",
            fecha_instalacion=date.today() - timedelta(days=7),
            geom=a_geometria(PuntoGeoJSON(type="Point", coordinates=(-72.6395, 7.2705))),
        )
    )
    await session.flush()
    return await crear_usuario(
        f"tecnico.{uuid.uuid4().hex[:8]}@ejemplo.com", rol="tecnico", predios=[predio_vacio]
    )


async def test_el_flujo_movil_responde_segun_la_documentacion(cliente, tecnico):
    flujo = await recorrer(cliente, tecnico.correo, CLAVE)
    resumen = [(p.nombre, p.obtenido, p.esquema) for p in flujo.pasos]
    assert all(p.conforme for p in flujo.pasos), resumen
    assert [p.nombre for p in flujo.pasos] == [
        "Estado del servidor",
        "Iniciar sesión",
        "Usuario de la sesión",
        "Carga completa",
        "Resolver el QR",
        "Preparar la lectura",
        "Registrar la lectura",
        "Reenviarla",
        "Consultar el MTD",
        "Renovar la sesión",
    ]
    # La lectura de 3 moscas en una trampa expuesta 7 días: 3 ÷ (1 × 7) = 0,4286.
    assert "M=3, T=1, D=7.00, MTD=0.4286" in flujo.pasos[8].nota
    assert "**10 de 10 pasos conformes**" in informe(flujo, "http://test", datetime.now(UTC))


async def test_un_fallo_detiene_el_flujo_y_queda_en_el_informe(cliente, tecnico):
    flujo = await recorrer(cliente, tecnico.correo, "clave-equivocada")
    assert [(p.nombre, p.obtenido) for p in flujo.pasos[:2]] == [
        ("Estado del servidor", 200),
        ("Iniciar sesión", 401),
    ]
    assert flujo.pasos[-1].detenido and not flujo.pasos[-1].conforme
    assert "se esperaba 200 y llegó 401" in flujo.pasos[-1].nota


async def test_detecta_respuestas_que_no_cumplen_el_esquema(cliente):
    flujo = Flujo(cliente)
    await flujo.cargar_documentacion()
    falsa = httpx.Response(200, json={"api": "ok"})  # faltan campos obligatorios
    assert flujo._validar("GET", "/health", falsa).startswith("no conforme")
    no_documentado = httpx.Response(418, json={})
    assert "418 no está documentado" in flujo._validar("GET", "/health", no_documentado)


async def test_sin_trampas_activas_lo_dice(cliente, session, tecnico):
    await session.execute(update(Trampa).values(estado="retirada"))
    flujo = await recorrer(cliente, tecnico.correo, CLAVE)
    assert "No hay una trampa activa" in flujo.pasos[-1].nota
