import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.schemas.trampa import TipoTrampa

TipoActividad = Literal["visita_monitoreo", "cambio_atrayente", "labor_cultural"]
Labor = Literal["poda", "fertilizacion", "raleo", "cosecha", "riego", "control_malezas", "otra"]
EstadoActividad = Literal["programada", "cumplida", "reprogramada", "cancelada"]
Anio = Annotated[int, Field(ge=2020, le=2100)]
Semana = Annotated[int, Field(ge=1, le=53, description="Semana ISO 8601")]
Notas = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


class Repeticion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cada_semanas: int = Field(ge=1, le=26, description="Repetir cada N semanas")
    hasta_semana: Semana = Field(description="Última semana (incluida) del mismo año")


class ActividadCrear(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID | None = Field(
        default=None,
        description="Opcional: reenviar el mismo `id` no duplica la actividad (ni su serie)",
    )
    lote_id: uuid.UUID
    tipo: TipoActividad
    labor: Labor | None = Field(default=None, description="Obligatoria en `labor_cultural`")
    tipo_trampa: TipoTrampa | None = Field(
        default=None,
        description="Obligatorio en `cambio_atrayente`: trampas cuyo atrayente se cambia",
    )
    anio: Anio
    semana: Semana
    responsable_id: uuid.UUID = Field(description="Persona asignada al predio que la realiza")
    notas: Notas | None = None
    repetir: Repeticion | None = Field(
        default=None,
        description="Crea la serie de semanas `semana`, `semana + N`… hasta la indicada",
    )

    @model_validator(mode="after")
    def _coherencia(self) -> "ActividadCrear":
        if (self.tipo == "labor_cultural") != (self.labor is not None):
            raise ValueError("`labor` va solo, y siempre, en las labores culturales")
        if (self.tipo == "cambio_atrayente") != (self.tipo_trampa is not None):
            raise ValueError("`tipo_trampa` va solo, y siempre, en los cambios de atrayente")
        if self.repetir and self.repetir.hasta_semana < self.semana:
            raise ValueError("La repetición debe terminar después de la semana inicial")
        return self


class ActividadActualizar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    responsable_id: uuid.UUID | None = None
    notas: Notas | None = Field(default=None, description="`null` borra las notas")

    @model_validator(mode="after")
    def _rechazar_nulos(self) -> "ActividadActualizar":
        if "responsable_id" in self.model_fields_set and self.responsable_id is None:
            raise ValueError("responsable_id no admite null")
        return self


class ActividadLeer(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    predio_id: uuid.UUID
    lote_id: uuid.UUID
    lote_codigo: str
    tipo: TipoActividad
    labor: Labor | None
    tipo_trampa: TipoTrampa | None
    ruta_id: uuid.UUID | None
    anio: int
    semana: int
    responsable_id: uuid.UUID
    responsable_nombre: str
    estado: EstadoActividad
    serie_id: uuid.UUID | None
    notas: str | None
    created_at: datetime
    updated_at: datetime


class OpcionCatalogo(BaseModel):
    valor: str
    nombre: str


class CatalogoPlan(BaseModel):
    tipos: list[OpcionCatalogo]
    labores: list[OpcionCatalogo]


class MiActividad(ActividadLeer):
    predio_nombre: str
    ruta_paradas: int | None = Field(
        description="Paradas de la ruta (visitas de monitoreo); `null` en las demás o si la ruta "
        "ya no está vigente"
    )


class MiSemana(BaseModel):
    anio: int
    semana: int
    desde: date = Field(description="Lunes de la semana ISO")
    hasta: date = Field(description="Domingo de la semana ISO")
    actividades: list[MiActividad]
