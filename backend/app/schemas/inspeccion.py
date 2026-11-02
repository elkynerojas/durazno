import uuid
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.schemas import ejemplos as ej
from app.schemas.color import ColorHex

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
