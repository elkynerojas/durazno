import uuid

from sqlalchemy import CheckConstraint, ForeignKey, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntidadSincronizable

ACCIONES_PLAN = ("reprogramada", "responsable", "eliminada")


class PlanCambio(EntidadSincronizable, Base):
    """Historial de cambios del plan (HU-23): quién movió, reasignó o eliminó una actividad,
    cuándo (`created_at`) y por qué. Solo se agregan filas."""

    __tablename__ = "plan_cambio"
    __table_args__ = (
        CheckConstraint(f"accion IN {ACCIONES_PLAN}", name="accion_valida"),
        CheckConstraint(
            "accion <> 'reprogramada' OR (motivo IS NOT NULL AND semana_nueva IS NOT NULL)",
            name="reprogramada_con_motivo",
        ),
    )

    actividad_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("plan_actividad.id"), nullable=False, index=True
    )
    predio_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("predio.id"), nullable=False)
    usuario_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("usuario.id"), nullable=False)
    accion: Mapped[str] = mapped_column(String(15), nullable=False)
    anio_anterior: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    semana_anterior: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    anio_nuevo: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    semana_nueva: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    # Responsable anterior y nuevo al reasignar.
    responsable_anterior_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("usuario.id"), nullable=True
    )
    responsable_nuevo_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("usuario.id"), nullable=True
    )
    motivo: Mapped[str | None] = mapped_column(String(300), nullable=True)
