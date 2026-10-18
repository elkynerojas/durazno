from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.errores import documentar_errores
from app.api.origen import origen_permitido
from app.api.v1.router import api_router
from app.core.config import ENTORNOS_LOCALES, get_settings
from app.core.version import VERSION

settings = get_settings()
# Swagger y ReDoc cargan scripts de un CDN en el mismo origen que la sesión: solo en desarrollo.
# El esquema `openapi.json` (entregable de la fase 2) se publica siempre.
documentacion = settings.environment in ENTORNOS_LOCALES

app = FastAPI(
    title=settings.app_name,
    version=VERSION,
    description=(
        "Servicios de trazabilidad geolocalizada del trampeo de moscas de la fruta "
        "en durazno (vereda Icota, Cácota). Documentación OpenAPI para la "
        "integración de la aplicación móvil (fase 2)."
    ),
    openapi_url=f"{settings.api_v1_prefix}/openapi.json",
    docs_url="/docs" if documentacion else None,
    redoc_url="/redoc" if documentacion else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_v1_prefix)


def _openapi() -> dict:
    if app.openapi_schema is None:
        app.openapi_schema = documentar_errores(FastAPI.openapi(app))
    return app.openapi_schema


app.openapi = _openapi


@app.middleware("http")
async def verificar_origen(peticion: Request, siguiente):
    if not origen_permitido(peticion.method, peticion.headers.get("origin"), get_settings()):
        return JSONResponse(status_code=403, content={"detail": "Origen no permitido"})
    return await siguiente(peticion)


@app.get("/", include_in_schema=False)
async def raiz() -> dict[str, str]:
    return {"servicio": settings.app_name, "openapi": f"{settings.api_v1_prefix}/openapi.json"}
