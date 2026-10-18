import uuid
from datetime import date, datetime
from decimal import Decimal

from geoalchemy2 import Geometry, WKBElement
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntidadSincronizable

ESTADOS_TRAMPA_LECTURA = ("buena", "danada", "faltante", "reubicada")
# HU-26 valida o rechaza; el MTD excluye las rechazadas.
ESTADOS_LECTURA = ("registrada", "validada", "rechazada")


class LecturaTrampa(EntidadSincronizable, Base):
    """Formulario de una trampa en una visita (HU-25)."""

    __tablename__ = "lectura_trampa"
    __table_args__ = (
        CheckConstraint(
            "capitata_machos >= 0 AND capitata_hembras >= 0 AND anastrepha >= 0",
            name="capturas_no_negativas",
        ),
        CheckConstraint("dias_exposicion >= 0", name="dias_no_negativos"),
        CheckConstraint(f"estado_trampa IN {ESTADOS_TRAMPA_LECTURA}", name="estado_trampa_valido"),
        CheckConstraint(f"estado IN {ESTADOS_LECTURA}", name="estado_valido"),
        CheckConstraint("precision_m IS NULL OR precision_m >= 0", name="precision_no_negativa"),
        CheckConstraint(
            "estado <> 'rechazada' OR motivo_rechazo IS NOT NULL", name="rechazo_con_motivo"
        ),
        # Una lectura por trampa y día, sea quien sea el técnico: así no se duplican capturas en
        # el MTD. Una rechazada (HU-26) deja registrar otra.
        Index(
            "uq_lectura_trampa_fecha",
            text("trampa_id"),
            text("fecha"),
            unique=True,
            postgresql_where=text("deleted_at IS NULL AND estado <> 'rechazada'"),
        ),
        Index("ix_lectura_trampa_trampa_observado", "trampa_id", "observado_en"),
    )

    visita_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("visita.id"), nullable=False)
    trampa_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("trampa.id"), nullable=False)
    responsable_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("usuario.id"), nullable=False)
    # Momento de la observación en campo; `created_at` es la llegada al servidor.
    observado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Fecha de `observado_en` en America/Bogota (la de la visita).
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
    capitata_machos: Mapped[int] = mapped_column(Integer, nullable=False)
    capitata_hembras: Mapped[int] = mapped_column(Integer, nullable=False)
    anastrepha: Mapped[int] = mapped_column(Integer, nullable=False)
    dias_exposicion: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    # Los que calculó el servidor; si difieren de `dias_exposicion` hay justificación.
    dias_calculados: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    justificacion_dias: Mapped[str | None] = mapped_column(String(300), nullable=True)
    estado_trampa: Mapped[str] = mapped_column(String(10), nullable=False)
    cambio_atrayente: Mapped[bool] = mapped_column(Boolean, nullable=False)
    observaciones: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Posición del dispositivo al registrar, su precisión y la distancia a la trampa.
    posicion: Mapped[WKBElement | None] = mapped_column(Geometry("POINT", srid=4326), nullable=True)
    precision_m: Mapped[Decimal | None] = mapped_column(Numeric(7, 2), nullable=True)
    distancia_m: Mapped[Decimal | None] = mapped_column(Numeric(9, 1), nullable=True)
    estado: Mapped[str] = mapped_column(String(10), nullable=False, server_default="registrada")
    # Validación del agrónomo (HU-26): quién y cuándo la validó o rechazó, y por qué la rechazó.
    revisada_por_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("usuario.id"), nullable=True
    )
    revisada_en: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    motivo_rechazo: Mapped[str | None] = mapped_column(String(300), nullable=True)
