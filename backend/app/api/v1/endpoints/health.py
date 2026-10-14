from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from app.api.deps import SessionDep

router = APIRouter(tags=["salud"])


class EstadoSalud(BaseModel):
    api: str
    base_datos: str
    postgis: str | None = None


@router.get("/health", response_model=EstadoSalud, summary="Estado de la API y de PostGIS")
async def health(session: SessionDep) -> EstadoSalud:
    try:
        version = (await session.execute(text("SELECT postgis_lib_version()"))).scalar_one()
        return EstadoSalud(api="ok", base_datos="ok", postgis=version)
    except Exception:
        # Se reporta el estado en lugar de devolver un 500.
        return EstadoSalud(api="ok", base_datos="sin conexión")
