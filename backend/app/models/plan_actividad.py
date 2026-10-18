import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Index, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntidadSincronizable

# Catálogo de tipos (HU-21). Las labores culturales se precisan con `labor`.
TIPOS_ACTIVIDAD = ("visita_monitoreo", "cambio_atrayente", "labor_cultural")
LABORES = ("poda", "fertilizacion", "raleo", "cosecha", "riego", "control_malezas", "otra")
# `programada` al crearla; HU-22 y HU-23 calculan o registran los demás estados.
ESTADOS_ACTIVIDAD = ("programada", "cumplida", "reprogramada", "cancelada")


class PlanActividad(EntidadSincronizable, Base):
    """Actividad del plan anual de un lote en una semana ISO (HU-21)."""

    __tablename__ = "plan_actividad"
    __table_args__ = (
        CheckConstraint(f"tipo IN {TIPOS_ACTIVIDAD}", name="tipo_valido"),
        CheckConstraint(f"estado IN {ESTADOS_ACTIVIDAD}", name="estado_valido"),
        CheckConstraint("semana BETWEEN 1 AND 53", name="semana_valida"),
        CheckConstraint(
            f"(tipo = 'labor_cultural') = (labor IS NOT NULL AND labor IN {LABORES})",
            name="labor_segun_tipo",
        ),
        CheckConstraint(
            "(tipo = 'cambio_atrayente') = (tipo_trampa IS NOT NULL "
            "AND tipo_trampa IN ('jackson', 'mcphail'))",
            name="tipo_trampa_segun_tipo",
        ),
        CheckConstraint(
            "(tipo = 'visita_monitoreo') = (ruta_id IS NOT NULL)", name="ruta_segun_tipo"
        ),
        Index("ix_plan_actividad_predio_anio", "predio_id", "anio"),
    )

    predio_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("predio.id"), nullable=False)
    lote_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lote.id"), nullable=False, index=True)
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    # Labor cultural (poda, fertilización…) o tipo de trampa cuyo atrayente se cambia.
    labor: Mapped[str | None] = mapped_column(String(20), nullable=True)
    tipo_trampa: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # Visita de monitoreo: la ruta del lote al programarla.
    ruta_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("ruta.id"), nullable=True)
    anio: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    semana: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    responsable_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("usuario.id"), nullable=False)
    estado: Mapped[str] = mapped_column(String(15), nullable=False, server_default="programada")
    # Actividades creadas juntas con «repetir cada N semanas» comparten la serie.
    serie_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True, index=True)
    notas: Mapped[str | None] = mapped_column(String(300), nullable=True)
