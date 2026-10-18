"""Cumplimiento del plan (HU-22): estado de cada actividad a partir de las lecturas.

Una visita de monitoreo se cumple cuando todas las trampas activas de su ruta tienen lectura (no
rechazada) en su semana ISO; un cambio de atrayente, cuando todas las trampas activas de ese tipo
en el lote tienen una lectura de esa semana que registra el cambio. Las labores culturales se
marcan a mano. Una actividad sin cumplir cuya semana ya pasó está vencida.
"""

import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lectura_trampa import LecturaTrampa
from app.models.ruta import Ruta, RutaTrampa
from app.models.trampa import Trampa


@dataclass(frozen=True)
class Avance:
    hechas: int
    total: int


def semana_terminada(anio: int, semana: int, hoy: date) -> bool:
    return hoy > date.fromisocalendar(anio, semana, 7)


def estado_actividad(
    estado_base: str, anio: int, semana: int, hoy: date, avance: Avance | None
) -> str:
    """cumplida > vencida > (reprogramada | programada). `cancelada` se respeta."""
    if estado_base == "cancelada":
        return "cancelada"
    if estado_base == "cumplida" or (avance and avance.total > 0 and avance.hechas >= avance.total):
        return "cumplida"
    if semana_terminada(anio, semana, hoy):
        return "vencida"
    return estado_base


@dataclass(frozen=True)
class ActividadAvance:
    """Lo que hace falta de una actividad para calcular su avance."""

    id: uuid.UUID
    tipo: str
    lote_id: uuid.UUID
    ruta_id: uuid.UUID | None
    tipo_trampa: str | None
    anio: int
    semana: int


async def avances(
    session: AsyncSession, actividades: Iterable[ActividadAvance]
) -> dict[uuid.UUID, Avance]:
    """Avance (trampas hechas / por hacer) de las visitas y los cambios de atrayente, con pocas
    consultas para todo el plan."""
    actividades = [a for a in actividades if a.tipo != "labor_cultural"]
    if not actividades:
        return {}
    rutas = {a.ruta_id for a in actividades if a.ruta_id}
    lotes = {a.lote_id for a in actividades}

    # Trampas por hacer: las activas de cada ruta (vigente) y de cada lote por tipo.
    paradas: dict[uuid.UUID, set[uuid.UUID]] = {r: set() for r in rutas}
    for ruta_id, trampa_id in await session.execute(
        select(RutaTrampa.ruta_id, RutaTrampa.trampa_id)
        .join(Ruta, Ruta.id == RutaTrampa.ruta_id)
        .join(Trampa, Trampa.id == RutaTrampa.trampa_id)
        .where(
            RutaTrampa.ruta_id.in_(rutas),
            RutaTrampa.deleted_at.is_(None),
            Ruta.deleted_at.is_(None),
            Trampa.deleted_at.is_(None),
            Trampa.estado == "activa",
        )
    ):
        paradas[ruta_id].add(trampa_id)
    por_tipo: dict[tuple[uuid.UUID, str], set[uuid.UUID]] = {}
    for lote_id, tipo, trampa_id in await session.execute(
        select(Trampa.lote_id, Trampa.tipo, Trampa.id).where(
            Trampa.lote_id.in_(lotes), Trampa.deleted_at.is_(None), Trampa.estado == "activa"
        )
    ):
        por_tipo.setdefault((lote_id, tipo), set()).add(trampa_id)

    # Lecturas de esas trampas en las semanas del plan.
    trampas = set().union(*paradas.values(), *por_tipo.values())
    semanas = {(a.anio, a.semana) for a in actividades}
    desde = min(date.fromisocalendar(a, s, 1) for a, s in semanas)
    hasta = max(date.fromisocalendar(a, s, 7) for a, s in semanas)
    leidas: dict[tuple[int, int], set[uuid.UUID]] = {}
    con_cambio: dict[tuple[int, int], set[uuid.UUID]] = {}
    for trampa_id, fecha, cambio in await session.execute(
        select(LecturaTrampa.trampa_id, LecturaTrampa.fecha, LecturaTrampa.cambio_atrayente).where(
            LecturaTrampa.trampa_id.in_(trampas),
            LecturaTrampa.fecha.between(desde, hasta),
            LecturaTrampa.deleted_at.is_(None),
            LecturaTrampa.estado != "rechazada",
        )
    ):
        iso = fecha.isocalendar()
        leidas.setdefault((iso.year, iso.week), set()).add(trampa_id)
        if cambio:
            con_cambio.setdefault((iso.year, iso.week), set()).add(trampa_id)

    resultado = {}
    for a in actividades:
        if a.tipo == "visita_monitoreo":
            objetivo, hechas = paradas.get(a.ruta_id, set()), leidas.get((a.anio, a.semana), set())
        else:
            objetivo = por_tipo.get((a.lote_id, a.tipo_trampa), set())
            hechas = con_cambio.get((a.anio, a.semana), set())
        resultado[a.id] = Avance(hechas=len(objetivo & hechas), total=len(objetivo))
    return resultado
