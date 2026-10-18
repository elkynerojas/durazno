import uuid
from datetime import date, datetime
from decimal import Decimal
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

from app.schemas.geo import PuntoGeoJSON, a_geojson
from app.schemas.trampa import EstadoLectura, LecturaResumen, PrecisionM

EstadoTrampaLectura = Literal["buena", "danada", "faltante", "reubicada"]
Capturas = Annotated[int, Field(ge=0, le=10_000)]
Texto300 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
Texto500 = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


class LecturaCrear(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID | None = Field(
        default=None,
        description="Id generado en el dispositivo: reenviar la misma lectura no la duplica",
    )
    trampa_id: uuid.UUID
    observado_en: AwareDatetime = Field(description="Momento de la observación en campo, con zona")
    capitata_machos: Capturas = Field(description="*Ceratitis capitata*, machos")
    capitata_hembras: Capturas = Field(description="*Ceratitis capitata*, hembras")
    anastrepha: Capturas = Field(description="*Anastrepha* spp.")
    dias_exposicion: int | None = Field(
        default=None,
        ge=0,
        le=365,
        description="Opcional: si se omite, se usan los calculados por el servidor. Si difiere "
        "de ellos exige `justificacion_dias`.",
    )
    justificacion_dias: Texto300 | None = None
    estado_trampa: EstadoTrampaLectura
    cambio_atrayente: bool
    observaciones: Texto500 | None = None
    posicion: PuntoGeoJSON | None = Field(
        default=None, description="Ubicación del dispositivo al registrar `[longitud, latitud]`"
    )
    precision_m: PrecisionM | None = None

    @model_validator(mode="after")
    def _precision_con_posicion(self) -> "LecturaCrear":
        if (self.posicion is None) != (self.precision_m is None):
            raise ValueError("`posicion` y `precision_m` van juntas")
        return self


class LecturaLeer(LecturaResumen):
    visita_id: uuid.UUID
    trampa_id: uuid.UUID
    trampa_codigo_ica: str
    lote_id: uuid.UUID
    lote_codigo: str
    responsable_id: uuid.UUID | None = Field(description="`null` para el productor (Ley 1581)")
    responsable_nombre: str | None
    dias_calculados: int
    justificacion_dias: str | None
    estado_trampa: EstadoTrampaLectura
    cambio_atrayente: bool
    observaciones: str | None
    posicion: PuntoGeoJSON | None = Field(
        description="Ubicación del dispositivo; solo la ven el agrónomo, el administrador y quien "
        "registró la lectura (Ley 1581)"
    )
    precision_m: float | None
    distancia_m: float | None = Field(description="Distancia geodésica a la trampa, en metros")
    revisada_por: str | None = Field(description="Quién la validó o rechazó (HU-26)")
    revisada_en: datetime | None
    motivo_rechazo: str | None
    avisos: list[str] = Field(
        description="Para revisar antes de validar: lejos de la trampa, sin ubicación o días "
        "de exposición cambiados"
    )
    created_at: datetime

    @field_validator("posicion", mode="before")
    @classmethod
    def _posicion_a_geojson(cls, valor: object) -> object:
        return a_geojson(valor)

    @field_validator("precision_m", "distancia_m", mode="before")
    @classmethod
    def _decimal_a_float(cls, valor: object) -> object:
        return float(valor) if isinstance(valor, Decimal) else valor


class PreparacionLectura(BaseModel):
    trampa_id: uuid.UUID
    revision_anterior: date = Field(
        description="Fecha de la lectura anterior o, si no hay, de la instalación"
    )
    dias_exposicion: int = Field(description="Días calculados hasta `observado_en` (o hoy)")
    ultima_lectura: LecturaResumen | None


Motivo = Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=300)]


class Revision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    estado: Literal["validada", "rechazada"]
    motivo: Motivo | None = Field(default=None, description="Obligatorio para rechazar")
    estado_esperado: EstadoLectura | None = Field(
        default=None,
        description="Estado que el cliente vio: si la lectura ya cambió (otra persona la revisó), "
        "responde 409 en lugar de pisar esa decisión",
    )

    @model_validator(mode="after")
    def _motivo_al_rechazar(self) -> "Revision":
        if self.estado == "rechazada" and self.motivo is None:
            raise ValueError("Para rechazar la lectura escriba el motivo")
        return self
