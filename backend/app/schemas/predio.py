import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.schemas import ejemplos as ej
from app.schemas.color import ColorHex
from app.schemas.geo import PoligonoGeoJSON, a_geojson

Nombre = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=150)]
Lugar = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
RegistroIca = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


class PredioGuardar(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "id": ej.PREDIO_ID,
                    "nombre": "Finca El Durazno",
                    "vereda": "Icota",
                    "municipio": "Cácota",
                    "registro_ica": "54-125-0001",
                    "limite": ej.POLIGONO_PREDIO,
                    "color_limite": "#ff6b35",
                }
            ]
        },
    )

    id: uuid.UUID | None = Field(
        default=None, description="Opcional al crear: reenviar el mismo `id` no duplica el predio"
    )
    nombre: Nombre
    vereda: Lugar
    municipio: Lugar
    registro_ica: RegistroIca | None = Field(
        default=None, description="Registro del predio ante el ICA"
    )
    area_ha: Decimal | None = Field(
        default=None,
        gt=0,
        max_digits=10,
        decimal_places=2,
        description="Hectáreas. Obligatoria sin `limite`; con `limite` la calcula el servidor.",
    )
    limite: PoligonoGeoJSON | None = Field(
        default=None, description="Límite del predio (opcional). `null` lo elimina."
    )
    color_limite: ColorHex | None = Field(
        default=None,
        description="Color del límite en los mapas (`#rrggbb`). `null` usa el de la aplicación.",
    )

    @model_validator(mode="after")
    def _area_o_limite(self) -> "PredioGuardar":
        if self.limite is None and self.area_ha is None:
            raise ValueError("Indique el área del predio o dibuje su límite")
        return self


class PredioLeer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nombre: str
    vereda: str
    municipio: str
    registro_ica: str | None
    area_ha: float
    limite: PoligonoGeoJSON | None
    color_limite: str | None
    created_at: datetime
    updated_at: datetime

    @field_validator("limite", mode="before")
    @classmethod
    def _limite_a_geojson(cls, valor: object) -> object:
        return a_geojson(valor)


class PersonaPredio(BaseModel):
    """Usuario asignado a un predio."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nombre_completo: str
    correo: str
    rol: str
    activo: bool


class PredioGuardado(PredioLeer):
    advertencias: list[str] = Field(
        default_factory=list, description="Avisos que no impiden guardar, p. ej. lotes por fuera"
    )
