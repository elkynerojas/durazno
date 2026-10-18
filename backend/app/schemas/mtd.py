import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.services.mtd import Especie


class FilaMtdLeer(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "especie": "capitata",
                    "anio": 2026,
                    "semana": 42,
                    "moscas": 12,
                    "trampas": 4,
                    "dias_promedio": 7.0,
                    "mtd": 0.428571,
                    "pendientes": 1,
                }
            ]
        }
    )

    especie: Especie = Field(description="`capitata` (trampas Jackson) o `anastrepha` (McPhail)")
    anio: int | None = Field(description="Año ISO de la semana; `null` en el resumen del periodo")
    semana: int | None = Field(description="Semana ISO; `null` en el resumen del periodo")
    moscas: int = Field(description="M: moscas de la especie capturadas")
    trampas: int = Field(description="T: trampas revisadas")
    dias_promedio: float = Field(description="D: días promedio de exposición por trampa")
    mtd: float | None = Field(
        description="M / (T × D) sin redondear; `null` si T × D = 0 (sin dato)"
    )
    pendientes: int = Field(description="Lecturas usadas que aún no se validan")


class MtdPredio(BaseModel):
    predio_id: uuid.UUID
    desde: date
    hasta: date
    semanas: list[FilaMtdLeer] = Field(description="Por especie y semana ISO, también sin lecturas")
    periodo: list[FilaMtdLeer] = Field(description="Consolidado del predio en todo el periodo")


class LecturaHistorial(BaseModel):
    id: uuid.UUID
    observado_en: datetime
    trampa_id: uuid.UUID
    trampa_codigo_ica: str
    tipo: str = Field(description="`jackson` o `mcphail`")
    lote_id: uuid.UUID
    lote_codigo: str
    capitata_machos: int
    capitata_hembras: int
    anastrepha: int
    dias_exposicion: int
    estado: str = Field(description="`registrada` o `validada` (las rechazadas no se incluyen)")
    mtd: float | None = Field(
        description="MTD de la trampa en esta lectura: moscas de su especie ÷ (1 × días)"
    )


class PuntoSerie(BaseModel):
    fecha: date
    capitata: int = Field(description="*C. capitata* (machos + hembras) en trampas Jackson")
    anastrepha: int = Field(description="*Anastrepha* en trampas McPhail")
    lecturas: int


class Historial(BaseModel):
    desde: date
    hasta: date
    total: int = Field(description="Lecturas que cumplen los filtros")
    pagina: int
    por_pagina: int
    serie: list[PuntoSerie] = Field(description="Capturas por fecha (todas, no solo la página)")
    lecturas: list[LecturaHistorial]
