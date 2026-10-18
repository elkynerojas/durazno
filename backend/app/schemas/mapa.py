import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.geo import PoligonoGeoJSON, PuntoGeoJSON
from app.schemas.trampa import EstadoTrampa, TipoTrampa
from app.services.monitoreo import EstadoMonitoreo


class RutaDeLote(BaseModel):
    id: uuid.UUID
    requiere_revision: bool
    motivo_revision: str | None


class PropiedadesLote(BaseModel):
    elemento: Literal["lote"] = "lote"
    id: uuid.UUID
    codigo: str
    nombre: str | None
    area_ha: float
    color: str | None = Field(description="Color en los mapas (`#rrggbb`); `null`: el de la app")
    ruta: RutaDeLote | None = Field(
        description="Ruta de monitoreo del lote y si requiere revisión; `null` si no tiene"
    )


class PropiedadesTrampa(BaseModel):
    elemento: Literal["trampa"] = "trampa"
    id: uuid.UUID
    lote_id: uuid.UUID
    lote_codigo: str
    codigo_ica: str
    codigo_qr: str
    tipo: TipoTrampa
    atrayente: str
    estado: EstadoTrampa
    fecha_instalacion: date
    precision_m: float | None
    ultima_lectura: datetime | None = Field(
        description="Momento de la última lectura no rechazada; `null` si no tiene"
    )
    dias_sin_revision: int | None = Field(
        description="Días desde la última lectura (o desde la instalación si no tiene). "
        "`null` si la trampa no está activa."
    )
    monitoreo: EstadoMonitoreo | None = Field(
        description="`al_dia`, `pendiente` (le toca revisión) o `vencida`. `null` si la trampa "
        "no está activa."
    )


class FeatureLote(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: PoligonoGeoJSON
    properties: PropiedadesLote


class FeatureTrampa(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: PuntoGeoJSON
    properties: PropiedadesTrampa


class Umbrales(BaseModel):
    dias_revision: int = Field(description="Desde estos días sin revisión, `pendiente`")
    dias_vencida: int = Field(description="Desde estos días sin revisión, `vencida`")


class ResumenMonitoreo(BaseModel):
    al_dia: int = 0
    pendiente: int = 0
    vencida: int = 0
    no_activas: int = Field(default=0, description="Trampas inactivas o retiradas")


class MapaPredio(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[FeatureLote | FeatureTrampa] = Field(
        description="Lotes (polígonos) y trampas (puntos); `properties.elemento` los distingue"
    )
    predio_id: uuid.UUID
    fecha: date = Field(description="Fecha de referencia del cálculo (America/Bogota)")
    umbrales: Umbrales
    resumen: ResumenMonitoreo
