"""Sincronización con la app móvil (HU-32): cambios desde una fecha y lecturas en bloque."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas import ejemplos as ej
from app.schemas.lectura import LecturaCrear, LecturaLeer
from app.schemas.lote import LoteLeer
from app.schemas.plan import ActividadLeer
from app.schemas.predio import PredioLeer
from app.schemas.ruta import RutaLeer
from app.schemas.trampa import TrampaLeer

MAX_LECTURAS_BLOQUE = 200


class CambiosEntidad[T](BaseModel):
    creados: list[T] = Field(description="Nuevos para el cliente desde `desde`")
    modificados: list[T] = Field(description="Ya existían en `desde` y cambiaron después")
    borrados: list[uuid.UUID] = Field(
        description="Ids que el cliente debe descartar (borrado lógico o fuera de su alcance)"
    )


class Cambios(BaseModel):
    desde: datetime | None = Field(description="El `desde` pedido; `null` en la carga completa")
    servidor_en: datetime = Field(description="Momento de la consulta en el servidor")
    siguiente_desde: datetime = Field(
        description="Valor de `desde` para la próxima sincronización. Trae unos minutos de "
        "traslape: aplique los cambios como upsert por `id` y los repetidos no hacen daño"
    )
    predios: CambiosEntidad[PredioLeer]
    lotes: CambiosEntidad[LoteLeer]
    trampas: CambiosEntidad[TrampaLeer]
    rutas: CambiosEntidad[RutaLeer]
    actividades: CambiosEntidad[ActividadLeer]
    lecturas: CambiosEntidad[LecturaLeer]


class LecturaSincronizar(LecturaCrear):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={"examples": LecturaCrear.model_config["json_schema_extra"]["examples"]},
    )

    id: uuid.UUID = Field(  # type: ignore[assignment]
        description="Obligatorio: id generado en el dispositivo; reenviarlo no duplica la lectura"
    )


class LecturasBloque(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "examples": [{"lecturas": LecturaCrear.model_config["json_schema_extra"]["examples"]}]
        },
    )

    lecturas: list[LecturaSincronizar] = Field(
        min_length=1,
        max_length=MAX_LECTURAS_BLOQUE,
        description="Lecturas guardadas sin conexión, en cualquier orden: el servidor las "
        "procesa por `observado_en` para calcular bien los días de exposición",
    )


class ResultadoLectura(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "id": ej.LECTURA_ID,
                    "resultado": "error",
                    "codigo": 409,
                    "detalle": "Ya hay una lectura de NS-CAC-0001 del 14/10/2026",
                    "lectura": None,
                }
            ]
        }
    )

    id: uuid.UUID
    resultado: Literal["creada", "existente", "error"] = Field(
        description="`creada`; `existente` si ese `id` ya estaba (reenvío); `error` si no se "
        "guardó: el dispositivo la conserva y muestra `detalle`"
    )
    codigo: int = Field(
        description="Código HTTP que habría dado `POST /visitas/lecturas`: 201, 200, 404, 409 o 422"
    )
    detalle: str | None = Field(description="Motivo del error en español")
    lectura: LecturaLeer | None = Field(
        description="La lectura como quedó en el servidor (también con su estado de validación, "
        "si el agrónomo ya la revisó); `null` si hubo error"
    )


class ResultadoBloque(BaseModel):
    resultados: list[ResultadoLectura] = Field(description="En el mismo orden del envío")
