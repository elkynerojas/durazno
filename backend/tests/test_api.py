"""Pruebas mínimas que no requieren base de datos.

Las pruebas que tocan PostGIS se ejecutan dentro del contenedor `api`:
    docker compose exec api pytest
"""

from fastapi.testclient import TestClient

from app.core.version import VERSION
from app.main import app

client = TestClient(app)


def test_raiz_responde():
    respuesta = client.get("/")
    assert respuesta.status_code == 200
    assert respuesta.json()["openapi"] == "/api/v1/openapi.json"


def test_openapi_publicado_bajo_v1():
    respuesta = client.get("/api/v1/openapi.json")
    assert respuesta.status_code == 200
    assert "/api/v1/health" in respuesta.json()["paths"]


async def test_health_publica_la_version(cliente):
    respuesta = await cliente.get("/api/v1/health")
    assert respuesta.status_code == 200
    assert respuesta.json()["version"] == VERSION == app.version
