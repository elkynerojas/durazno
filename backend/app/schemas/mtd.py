import uuid
from datetime import date

from pydantic import BaseModel, Field

from app.services.mtd import Especie


class FilaMtdLeer(BaseModel):
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
