"""Lecturas de trampa (HU-25): días de exposición y revisión anterior."""

import uuid
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lectura_trampa import LecturaTrampa
from app.models.trampa import Trampa
from app.services.monitoreo import ZONA


def fecha_bogota(momento: datetime) -> date:
    return momento.astimezone(ZONA).date()


def dias_exposicion(observado: date, referencia: date) -> int:
    """Días entre la revisión anterior (o la instalación) y la observación; nunca negativos."""
    return max(0, (observado - referencia).days)


async def lectura_anterior(
    session: AsyncSession,
    trampa_id: uuid.UUID,
    antes_de: datetime,
    excluir_id: uuid.UUID | None = None,
) -> LecturaTrampa | None:
    """Última lectura vigente y no rechazada de la trampa antes del momento dado."""
    consulta = (
        select(LecturaTrampa)
        .where(
            LecturaTrampa.trampa_id == trampa_id,
            LecturaTrampa.observado_en < antes_de,
            LecturaTrampa.deleted_at.is_(None),
            LecturaTrampa.estado != "rechazada",
        )
        .order_by(LecturaTrampa.observado_en.desc())
        .limit(1)
    )
    if excluir_id is not None:
        consulta = consulta.where(LecturaTrampa.id != excluir_id)
    return await session.scalar(consulta)


async def revision_anterior(
    session: AsyncSession, trampa: Trampa, observado_en: datetime
) -> tuple[date, LecturaTrampa | None]:
    """Fecha desde la que se cuentan los días de exposición: la lectura anterior o, si no hay,
    la instalación de la trampa."""
    anterior = await lectura_anterior(session, trampa.id, observado_en)
    referencia = fecha_bogota(anterior.observado_en) if anterior else trampa.fecha_instalacion
    return referencia, anterior
