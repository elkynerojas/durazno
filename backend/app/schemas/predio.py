import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.schemas.geo import PoligonoGeoJSON, a_geojson

Nombre = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=150)]
Lugar = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
RegistroIca = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


class PredioGuardar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID | None = Field(
        default=None, description="Opcional, solo se usa al registrar el predio por primera vez"
    )
    nombre: Nombre
    vereda: Lugar
    municipio: Lugar
    registro_ica: RegistroIca | None = Field(
        default=None, description="Registro del predio ante el ICA"
    )
    area_ha: Decimal = Field(gt=0, max_digits=10, decimal_places=2, description="Hectáreas")
    limite: PoligonoGeoJSON | None = Field(
        default=None, description="Límite del predio (opcional). `null` lo elimina."
    )


class PredioLeer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nombre: str
    vereda: str
    municipio: str
    registro_ica: str | None
    area_ha: float
    limite: PoligonoGeoJSON | None
    created_at: datetime
    updated_at: datetime

    @field_validator("limite", mode="before")
    @classmethod
    def _limite_a_geojson(cls, valor: object) -> object:
        return a_geojson(valor)
