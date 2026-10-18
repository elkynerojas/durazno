import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Index, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntidadSincronizable


class Visita(EntidadSincronizable, Base):
    """Recorrido de un técnico por un lote en una fecha (HU-25). La crea el servidor con la
    primera lectura del día; agrupa las lecturas de ese recorrido."""

    __tablename__ = "visita"
    __table_args__ = (
        Index(
            "uq_visita_tecnico_lote_fecha",
            text("tecnico_id"),
            text("lote_id"),
            text("fecha"),
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    predio_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("predio.id"), nullable=False)
    lote_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lote.id"), nullable=False, index=True)
    tecnico_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("usuario.id"), nullable=False)
    # Fecha de calendario en America/Bogota.
    fecha: Mapped[date] = mapped_column(Date, nullable=False)
