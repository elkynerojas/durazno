import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.geo import PuntoGeoJSON
from app.schemas.trampa import EstadoTrampa, TipoTrampa

OrdenTrampas = list[uuid.UUID]
DESCRIPCION_ORDEN = (
    "Ids de las trampas en el orden de visita: todas las activas del lote, sin repetir"
)


class RutaCrear(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID | None = Field(
        default=None, description="Opcional: si se envía, reenviar el mismo `id` no duplica"
    )
    lote_id: uuid.UUID
    trampas: OrdenTrampas = Field(min_length=1, max_length=500, description=DESCRIPCION_ORDEN)


class RutaActualizar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    trampas: OrdenTrampas = Field(min_length=1, max_length=500, description=DESCRIPCION_ORDEN)


class ParadaRuta(BaseModel):
    orden: int = Field(description="Posición en el recorrido, desde 1")
    trampa_id: uuid.UUID
    codigo_ica: str
    tipo: TipoTrampa
    estado: EstadoTrampa
    geom: PuntoGeoJSON
    distancia_desde_anterior_m: float | None = Field(
        description="Distancia geodésica desde la parada anterior; `null` en la primera"
    )


class RutaPropuesta(BaseModel):
    lote_id: uuid.UUID
    paradas: list[ParadaRuta]
    distancia_total_m: float = Field(description="Suma de los tramos, en metros")


class RutaLeer(RutaPropuesta):
    id: uuid.UUID
    lote_codigo: str
    requiere_revision: bool = Field(
        description="Las trampas del lote cambiaron desde que se guardó (HU-20); se limpia al "
        "volver a guardar la ruta con `PUT`"
    )
    motivo_revision: str | None = Field(description="Cambios que dejaron la ruta por revisar")
    created_at: datetime
    updated_at: datetime
