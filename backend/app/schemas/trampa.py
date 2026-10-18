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
    codigo_qr: str = Field(description="Código corto del QR; no cambia si la trampa se mueve")
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


class LoteResumen(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    predio_id: uuid.UUID
    codigo: str
    nombre: str | None


class RutaDeTrampa(BaseModel):
    """Posición de una trampa en la ruta de su lote (al resolver su QR)."""

    id: uuid.UUID
    orden: int
    total: int = Field(description="Número de paradas de la ruta")
    siguiente: str | None = Field(description="Código ICA de la siguiente trampa; `null` al final")


class TrampaResuelta(BaseModel):
    """Lo que necesita el técnico al leer el QR de una trampa en campo."""

    trampa: TrampaLeer
    lote: LoteResumen
    ruta: RutaDeTrampa | None = Field(
        default=None,
        description="Posición de la trampa en la ruta de monitoreo de su lote; `null` si el lote "
        "no tiene ruta o la trampa no está en ella.",
    )
    ultima_lectura: None = Field(
        default=None,
        description="Última lectura registrada de la trampa. Siempre `null` hasta que existan "
        "las lecturas (HU-25).",
    )


class ReemplazoQrCrear(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID | None = Field(
        default=None, description="Opcional: reenviar el mismo `id` no genera otro código"
    )
    motivo: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
        | None
    ) = Field(default=None, description="p. ej. etiqueta rota, borrosa o perdida")


class ReemplazoQrLeer(BaseModel):
    id: uuid.UUID
    codigo_anterior: str
    codigo_nuevo: str
    motivo: str | None
    responsable: str = Field(description="Nombre de quien hizo el reemplazo")
    created_at: datetime
