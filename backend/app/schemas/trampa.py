import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.schemas.geo import PuntoGeoJSON, a_geojson

TipoTrampa = Literal["jackson", "mcphail"]
EstadoTrampa = Literal["activa", "inactiva", "retirada"]
CodigoIca = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]
Atrayente = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
PrecisionM = Annotated[
    Decimal,
    Field(ge=0, max_digits=7, decimal_places=2, description="Precisión del GPS en metros"),
]


class TrampaCrear(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID | None = Field(
        default=None, description="Opcional: si se envía, reenviar el mismo `id` no duplica"
    )
    lote_id: uuid.UUID
    codigo_ica: CodigoIca = Field(description="Identificador oficial de la trampa ante el ICA")
    tipo: TipoTrampa = Field(description="`jackson` (C. capitata) o `mcphail` (Anastrepha)")
    atrayente: Atrayente = Field(description="p. ej. trimedlure o proteína hidrolizada")
    fecha_instalacion: date
    estado: EstadoTrampa = "activa"
    geom: PuntoGeoJSON
    precision_m: PrecisionM | None = Field(
        default=None, description="Solo si la coordenada viene del GPS"
    )


class TrampaActualizar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    lote_id: uuid.UUID | None = None
    codigo_ica: CodigoIca | None = None
    tipo: TipoTrampa | None = None
    atrayente: Atrayente | None = None
    fecha_instalacion: date | None = None
    estado: EstadoTrampa | None = None
    geom: PuntoGeoJSON | None = Field(
        default=None, description="Mover la trampa conserva su `id` y su historial"
    )
    precision_m: PrecisionM | None = Field(
        default=None, description="`null` la borra (p. ej. al ubicarla en el mapa)"
    )

    @model_validator(mode="after")
    def _rechazar_nulos(self) -> "TrampaActualizar":
        nulos = sorted(
            c for c in self.model_fields_set - {"precision_m"} if getattr(self, c) is None
        )
        if nulos:
            raise ValueError(f"Estos campos no admiten null: {', '.join(nulos)}")
        return self


class TrampaLeer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    lote_id: uuid.UUID
    codigo_ica: str
    tipo: TipoTrampa
    atrayente: str
    fecha_instalacion: date
    estado: EstadoTrampa
    geom: PuntoGeoJSON
    precision_m: float | None
    created_at: datetime
    updated_at: datetime

    @field_validator("geom", mode="before")
    @classmethod
    def _geom_a_geojson(cls, valor: object) -> object:
        return a_geojson(valor)
