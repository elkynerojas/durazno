from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.api.deps import SessionDep
from app.core.version import VERSION

router = APIRouter(tags=["salud"])


class EstadoSalud(BaseModel):
    version: str = Field(description="Versión del aplicativo")
    api: str
    base_datos: str
    postgis: str | None = None


@router.get(
    "/health",
    response_model=EstadoSalud,
    summary="Estado de la API y de PostGIS",
    description="Público, sin sesión. Si la base no responde, devuelve 200 con `base_datos: "
    '"sin conexión"` en lugar de un 500, para que el monitoreo lea el estado.',
)
async def health(session: SessionDep) -> EstadoSalud:
    try:
        version = (await session.execute(text("SELECT postgis_lib_version()"))).scalar_one()
        return EstadoSalud(version=VERSION, api="ok", base_datos="ok", postgis=version)
    except Exception:
        # Se reporta el estado en lugar de devolver un 500.
        return EstadoSalud(version=VERSION, api="ok", base_datos="sin conexión")
