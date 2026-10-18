"""La documentación OpenAPI es un entregable de la fase 2 (HU-31): se verifica que esté completa
y que `backend/openapi.json` siga al día con la API."""

import typing

import pytest
from fastapi.routing import APIRoute
from pydantic import BaseModel

from app.api.v1.router import api_router
from app.main import app
from app.scripts.exportar_openapi import ARCHIVO, esquema_json

ESQUEMA = app.openapi()
OPERACIONES = [
    (f"{metodo.upper()} {ruta}", operacion)
    for ruta, operaciones in ESQUEMA["paths"].items()
    for metodo, operacion in operaciones.items()
]
CUERPOS_JSON = [
    (nombre, operacion["requestBody"]["content"]["application/json"]["schema"])
    for nombre, operacion in OPERACIONES
    if "application/json" in operacion.get("requestBody", {}).get("content", {})
]
PUBLICAS = {"GET /api/v1/health", "POST /api/v1/auth/token", "POST /api/v1/auth/salir"}


def _rutas(router):
    # FastAPI 0.143 envuelve los routers incluidos: se recorre el original.
    for ruta in router.routes:
        if isinstance(ruta, APIRoute):
            yield ruta
        elif hasattr(ruta, "original_router"):
            yield from _rutas(ruta.original_router)


MODELOS_ENTRADA = {
    modelo
    for ruta in _rutas(api_router)
    for parametro in ruta.dependant.body_params
    for modelo in typing.get_args(parametro.field_info.annotation)
    or (parametro.field_info.annotation,)
    if isinstance(modelo, type) and issubclass(modelo, BaseModel)
}


def _esquema(ref: str) -> dict:
    return ESQUEMA["components"]["schemas"][ref.rsplit("/", 1)[-1]]


def test_openapi_json_versionado_al_dia():
    assert ARCHIVO.read_text(encoding="utf-8") == esquema_json(), (
        "openapi.json está desactualizado: docker compose exec api "
        "python -m app.scripts.exportar_openapi"
    )


@pytest.mark.parametrize(("nombre", "operacion"), OPERACIONES, ids=[n for n, _ in OPERACIONES])
def test_cada_endpoint_documentado(nombre, operacion):
    assert operacion.get("summary"), "falta summary"
    assert operacion.get("description"), "falta description"
    assert len(operacion.get("tags", [])) == 1, "debe tener el tag de su grupo"
    respuestas = operacion["responses"]
    if nombre not in PUBLICAS:
        assert "401" in respuestas, "falta documentar el 401"
    for codigo, respuesta in respuestas.items():
        if codigo[0] in "45":
            assert respuesta["content"]["application/json"]["schema"], f"{codigo} sin cuerpo"


@pytest.mark.parametrize(("nombre", "esquema"), CUERPOS_JSON, ids=[n for n, _ in CUERPOS_JSON])
def test_cuerpos_json_con_ejemplo(nombre, esquema):
    # Un cuerpo opcional llega como `anyOf: [{$ref}, {type: null}]`.
    ref = esquema.get("$ref") or next(o["$ref"] for o in esquema["anyOf"] if "$ref" in o)
    assert _esquema(ref).get("examples"), "el cuerpo no tiene ejemplo"


def test_error_documenta_el_detalle():
    respuesta = ESQUEMA["paths"]["/api/v1/lotes/{lote_id}"]["get"]["responses"]["401"]
    contenido = respuesta["content"]["application/json"]
    assert contenido["schema"] == {"$ref": "#/components/schemas/Error"}
    assert contenido["example"] == {"detail": "Sesión inválida o expirada"}
    assert ESQUEMA["components"]["schemas"]["Error"]["required"] == ["detail"]


def test_ejemplos_geojson_en_orden_longitud_latitud():
    longitud, latitud = _esquema("PuntoGeoJSON")["examples"][0]["coordinates"]
    assert -79.1 <= longitud <= -66.8 and -4.3 <= latitud <= 13.5


@pytest.mark.parametrize("modelo", sorted(MODELOS_ENTRADA, key=lambda m: m.__name__))
def test_ejemplos_de_entrada_validos(modelo):
    ejemplos = (modelo.model_config.get("json_schema_extra") or {}).get("examples", [])
    assert ejemplos, f"{modelo.__name__} no tiene ejemplo"
    for ejemplo in ejemplos:
        modelo.model_validate(ejemplo)


def test_grupos_de_la_tabla_2_publicados_bajo_v1():
    # HU-31: los grupos de servicios de la propuesta (Tabla 2), cada uno con su tag.
    tags = {op["tags"][0] for _, op in OPERACIONES}
    assert {"auth", "lotes", "trampas", "rutas", "visitas", "mtd", "plan"} <= tags
    assert all(ruta.startswith("/api/v1/") for ruta in ESQUEMA["paths"])
