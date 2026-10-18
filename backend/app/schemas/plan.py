import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.schemas import ejemplos as ej
from app.schemas.trampa import TipoTrampa

TipoActividad = Literal["visita_monitoreo", "cambio_atrayente", "labor_cultural"]
Labor = Literal["poda", "fertilizacion", "raleo", "cosecha", "riego", "control_malezas", "otra"]
# `vencida` es calculado (HU-22): su semana pasó sin cumplirse.
EstadoActividad = Literal["programada", "cumplida", "reprogramada", "vencida", "cancelada"]
Anio = Annotated[int, Field(ge=2020, le=2100)]
Semana = Annotated[int, Field(ge=1, le=53, description="Semana ISO 8601")]
Notas = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


class Repeticion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cada_semanas: int = Field(ge=1, le=26, description="Repetir cada N semanas")
    hasta_semana: Semana = Field(description="Última semana (incluida) del mismo año")


class ActividadCrear(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "id": ej.ACTIVIDAD_ID,
                    "lote_id": ej.LOTE_ID,
                    "tipo": "visita_monitoreo",
                    "anio": 2026,
                    "semana": 43,
                    "responsable_id": ej.USUARIO_ID,
                    "repetir": {"cada_semanas": 1, "hasta_semana": 52},
                }
            ]
        },
    )

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
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [{"responsable_id": ej.USUARIO_ID, "notas": "Revisar primero el lote alto"}]
        },
    )

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
    avance: "AvanceLeer | None" = Field(
        default=None,
        description="Visitas y cambios de atrayente: trampas hechas de las que tocan esa semana",
    )
    cumplida_en: datetime | None = Field(
        default=None, description="Labores culturales: cuándo se marcó cumplida"
    )
    lectura_origen_id: uuid.UUID | None = Field(
        default=None, description="Visita adicional: la lectura con capturas que la originó"
    )
    created_at: datetime
    updated_at: datetime


class AvanceLeer(BaseModel):
    hechas: int
    total: int


class Cumplimiento(BaseModel):
    model_config = ConfigDict(extra="forbid", json_schema_extra={"examples": [{"cumplida": True}]})

    cumplida: bool = Field(description="`true` la marca cumplida; `false` la desmarca")


class FilaCumplimiento(BaseModel):
    programadas: int = Field(description="Actividades que ya debían hacerse (sin canceladas)")
    cumplidas: int
    vencidas: int
    reprogramadas: int = Field(description="Reprogramadas alguna vez (estado base)")
    porcentaje: float | None = Field(description="cumplidas ÷ programadas × 100; `null` si 0")


class CumplimientoSemana(FilaCumplimiento):
    semana: int


class CumplimientoLote(FilaCumplimiento):
    lote_id: uuid.UUID
    lote_codigo: str


class CumplimientoPlan(BaseModel):
    anio: int
    hasta_semana: int = Field(description="Última semana contada (la actual, o la última del año)")
    total: FilaCumplimiento
    semanas: list[CumplimientoSemana]
    lotes: list[CumplimientoLote]


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


Motivo = Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=300)]


class Reprogramacion(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "id": ej.CAMBIO_ID,
                    "anio": 2026,
                    "semana": 44,
                    "motivo": "Lluvias fuertes impidieron la visita",
                }
            ]
        },
    )

    id: uuid.UUID | None = Field(
        default=None, description="Id del cambio: reenviar el mismo no reprograma dos veces"
    )
    anio: Anio
    semana: Semana
    motivo: Motivo = Field(description="Obligatorio: por qué se mueve (p. ej. aumento de capturas)")


class CambioLeer(BaseModel):
    id: uuid.UUID
    actividad_id: uuid.UUID
    lote_codigo: str
    tipo: TipoActividad
    labor: Labor | None
    tipo_trampa: TipoTrampa | None
    accion: Literal["reprogramada", "responsable", "eliminada"]
    anio_anterior: int
    semana_anterior: int
    anio_nuevo: int | None
    semana_nueva: int | None
    responsable_anterior: str | None
    responsable_nuevo: str | None
    motivo: str | None
    usuario: str = Field(description="Quién hizo el cambio")
    created_at: datetime


class VisitaAdicional(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"examples": [{"lectura_id": ej.LECTURA_ID, "semana": 43}]},
    )

    id: uuid.UUID | None = Field(
        default=None, description="Opcional: reenviar el mismo `id` no duplica la visita"
    )
    lectura_id: uuid.UUID = Field(description="Lectura con capturas que motiva la visita")
    anio: Anio | None = Field(default=None, description="Por defecto, el de la semana siguiente")
    semana: Semana | None = Field(default=None, description="Por defecto, la semana siguiente")
    responsable_id: uuid.UUID | None = Field(
        default=None, description="Por defecto, quien registró la lectura"
    )
