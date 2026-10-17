"""Geometrías en GeoJSON (RFC 7946): posiciones `[longitud, latitud]` en WGS 84."""

from typing import Annotated, Any, Literal

from geoalchemy2 import WKBElement
from geoalchemy2.shape import from_shape, to_shape
from pydantic import BaseModel, ConfigDict, Field, field_validator
from shapely.geometry import mapping, shape

Longitud = Annotated[float, Field(ge=-180, le=180)]
Latitud = Annotated[float, Field(ge=-90, le=90)]
Posicion = tuple[Longitud, Latitud]
Anillo = Annotated[list[Posicion], Field(min_length=4)]


class PoligonoGeoJSON(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "type": "Polygon",
                "coordinates": [[[-72.58, 7.27], [-72.57, 7.27], [-72.57, 7.28], [-72.58, 7.27]]],
            }
        },
    )

    type: Literal["Polygon"]
    coordinates: list[Anillo] = Field(
        min_length=1, description="Anillo exterior y huecos opcionales, `[longitud, latitud]`"
    )

    @field_validator("coordinates")
    @classmethod
    def _anillos_cerrados(cls, anillos: list[list[Posicion]]) -> list[list[Posicion]]:
        if any(anillo[0] != anillo[-1] for anillo in anillos):
            raise ValueError("Cada anillo debe terminar en el mismo punto en que empieza")
        return anillos


def a_geometria(geojson: PoligonoGeoJSON) -> WKBElement:
    return from_shape(shape(geojson.model_dump()), srid=4326)


def a_geojson(valor: Any) -> Any:
    """Convierte la geometría leída de la base en un dict GeoJSON; deja pasar lo demás."""
    return mapping(to_shape(valor)) if isinstance(valor, WKBElement) else valor
