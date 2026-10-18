import uuid

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntidadSincronizable


class Ruta(EntidadSincronizable, Base):
    """Orden de visita de las trampas activas de un lote (HU-19). Un lote tiene una sola ruta
    vigente."""

    __tablename__ = "ruta"
    __table_args__ = (
        Index(
            "uq_ruta_lote",
            text("lote_id"),
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    lote_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lote.id"), nullable=False)


class RutaTrampa(EntidadSincronizable, Base):
    """Parada de una ruta. Al cambiar el orden, las paradas anteriores se marcan como borradas y
    se crean las nuevas (queda el historial)."""

    __tablename__ = "ruta_trampa"
    __table_args__ = (
        CheckConstraint("orden >= 1", name="orden_positivo"),
        Index(
            "uq_ruta_trampa_orden",
            text("ruta_id"),
            text("orden"),
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index(
            "uq_ruta_trampa_trampa",
            text("ruta_id"),
            text("trampa_id"),
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    ruta_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("ruta.id"), nullable=False)
    trampa_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trampa.id"), nullable=False, index=True
    )
    orden: Mapped[int] = mapped_column(Integer, nullable=False)
