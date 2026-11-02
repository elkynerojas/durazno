import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.schemas import ejemplos as ej
from app.schemas.color import ColorHex
from app.schemas.geo import PuntoGeoJSON, a_geojson
from app.schemas.trampa import PrecisionM

NombreTipo = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


class TipoHallazgoCrear(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [{"id": ej.TIPO_HALLAZGO_ID, "nombre": "Gomosis", "color": "#8e44ad"}]
        },
    )

    id: uuid.UUID | None = Field(
        default=None, description="Opcional: reenviar el mismo `id` no duplica el tipo"
    )
    nombre: NombreTipo
    color: ColorHex = Field(description="Color del marcador en los mapas (`#rrggbb`)")
    orden: int = Field(default=0, ge=0, le=999, description="Posición en las listas")


class TipoHallazgoActualizar(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"examples": [{"nombre": "Gomosis del tronco", "activo": False}]},
    )

    nombre: NombreTipo | None = None
    color: ColorHex | None = None
    orden: int | None = Field(default=None, ge=0, le=999)
    activo: bool | None = Field(
        default=None, description="`false` lo retira de las listas sin afectar los hallazgos"
    )


class TipoHallazgoLeer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nombre: str
    color: str
    activo: bool
    orden: int


# --- Hallazgos (HU-41) ---

Titulo = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Descripcion = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)
]
EstadoHallazgo = Literal["abierto", "en_atencion", "atendido"]

EJEMPLO_HALLAZGO = {
    "id": ej.HALLAZGO_ID,
    "lote_id": ej.LOTE_ID,
    "tipo_id": ej.TIPO_HALLAZGO_ID,
    "titulo": "Manchas oscuras en hojas del sector norte",
    "descripcion": "Cinco árboles con manchas circulares negras en el envés de las hojas y "
    "frutos con lesiones hundidas. Posible antracnosis.",
    "ubicacion": ej.PUNTO_TECNICO,
    "precision_m": 6.5,
    "observado_en": ej.OBSERVADO_EN,
}


class HallazgoCrear(BaseModel):
    model_config = ConfigDict(extra="forbid", json_schema_extra={"examples": [EJEMPLO_HALLAZGO]})

    id: uuid.UUID | None = Field(
        default=None,
        description="Generado por el cliente: reenviar el mismo `id` no duplica el hallazgo",
    )
    lote_id: uuid.UUID
    tipo_id: uuid.UUID = Field(description="Un tipo activo de `GET /inspecciones/tipos`")
    titulo: Titulo
    descripcion: Descripcion
    ubicacion: PuntoGeoJSON = Field(description="Punto dentro del lote, `[longitud, latitud]`")
    precision_m: PrecisionM | None = Field(
        default=None, description="Solo si el punto viene del GPS; `null` si se tocó el mapa"
    )
    observado_en: AwareDatetime = Field(description="Momento de la observación en campo")


class HallazgoActualizar(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"examples": [{"titulo": "Antracnosis confirmada en el sector norte"}]},
    )

    tipo_id: uuid.UUID | None = None
    titulo: Titulo | None = None
    descripcion: Descripcion | None = None
    lote_id: uuid.UUID | None = Field(default=None, description="Solo junto con `ubicacion`")
    ubicacion: PuntoGeoJSON | None = None
    precision_m: PrecisionM | None = Field(
        default=None, description="Con `ubicacion`: la del GPS, o `null` si se tocó el mapa"
    )

    @model_validator(mode="after")
    def _lote_con_ubicacion(self) -> "HallazgoActualizar":
        if self.lote_id is not None and self.ubicacion is None:
            raise ValueError("Para cambiar el lote envíe también la nueva ubicación")
        if "precision_m" in self.model_fields_set and self.ubicacion is None:
            raise ValueError("La precisión solo se envía junto con la ubicación")
        return self


class EvidenciaLeer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    ancho: int
    alto: int
    bytes: int
    orden: int
    created_at: datetime


class HallazgoLeer(BaseModel):
    id: uuid.UUID
    predio_id: uuid.UUID
    lote_id: uuid.UUID
    lote_codigo: str
    tipo_id: uuid.UUID
    tipo_nombre: str
    tipo_color: str
    titulo: str
    descripcion: str
    ubicacion: PuntoGeoJSON
    precision_m: float | None
    observado_en: datetime
    registrado_por_id: uuid.UUID | None = Field(description="`null` para el productor (Ley 1581)")
    registrado_por_nombre: str | None = Field(description="`null` para el productor (Ley 1581)")
    estado: EstadoHallazgo = Field(
        description="`abierto` sin atención programada, `en_atencion` con una actividad "
        "pendiente en el plan, `atendido` cuando esa actividad se cumplió"
    )
    evidencias: list[EvidenciaLeer]
    created_at: datetime
    updated_at: datetime

    @field_validator("ubicacion", mode="before")
    @classmethod
    def _ubicacion_a_geojson(cls, valor: object) -> object:
        return a_geojson(valor)


class Hallazgos(BaseModel):
    total: int = Field(description="Hallazgos que cumplen los filtros")
    pagina: int
    por_pagina: int
    hallazgos: list[HallazgoLeer]
