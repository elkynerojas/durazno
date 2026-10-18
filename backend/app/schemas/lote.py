import uuid
from datetime import datetime
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

Codigo = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]
NombreLote = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class LoteCrear(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "id": ej.LOTE_ID,
                    "predio_id": ej.PREDIO_ID,
                    "codigo": "L-01",
                    "nombre": "Lote alto junto a la quebrada",
                    "color": "#ffd60a",
                    "geom": ej.POLIGONO_LOTE,
                }
            ]
        },
    )

    id: uuid.UUID | None = Field(
        default=None, description="Opcional: si se envía, reenviar el mismo `id` no duplica"
    )
    predio_id: uuid.UUID = Field(description="Predio al que pertenece el lote")
    codigo: Codigo = Field(description="Código único dentro del predio, p. ej. `L-01`")
    nombre: NombreLote | None = None
    color: ColorHex | None = Field(
        default=None, description="Color del lote en los mapas (`#rrggbb`)"
    )
    geom: PoligonoGeoJSON


class LoteActualizar(BaseModel):
    model_config = ConfigDict(
        extra="forbid", json_schema_extra={"examples": [{"nombre": "Lote alto", "color": None}]}
    )

    codigo: Codigo | None = None
    nombre: NombreLote | None = Field(default=None, description="`null` borra el nombre")
    color: ColorHex | None = Field(
        default=None, description="`#rrggbb`; `null` vuelve al color de la aplicación"
    )
    geom: PoligonoGeoJSON | None = None

    @model_validator(mode="after")
    def _rechazar_nulos(self) -> "LoteActualizar":
        nulos = sorted(
            c for c in self.model_fields_set - {"nombre", "color"} if getattr(self, c) is None
        )
        if nulos:
            raise ValueError(f"Estos campos no admiten null: {', '.join(nulos)}")
        return self


class LoteLeer(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "examples": [
                {
                    "id": ej.LOTE_ID,
                    "predio_id": ej.PREDIO_ID,
                    "codigo": "L-01",
                    "nombre": "Lote alto junto a la quebrada",
                    "color": "#ffd60a",
                    "area_ha": 3.67,
                    "geom": ej.POLIGONO_LOTE,
                    "created_at": ej.CREADO_EN,
                    "updated_at": ej.CREADO_EN,
                }
            ]
        },
    )

    id: uuid.UUID
    predio_id: uuid.UUID
    codigo: str
    nombre: str | None
    color: str | None
    area_ha: float = Field(description="Área geodésica calculada en el servidor")
    geom: PoligonoGeoJSON
    created_at: datetime
    updated_at: datetime

    @field_validator("geom", mode="before")
    @classmethod
    def _geom_a_geojson(cls, valor: object) -> object:
        return a_geojson(valor)


class LoteGuardado(LoteLeer):
    advertencias: list[str] = Field(
        default_factory=list, description="Avisos que no impiden guardar, p. ej. traslapes"
    )
