import uuid
from decimal import Decimal

from geoalchemy2 import Geometry, WKBElement
from sqlalchemy import CheckConstraint, ForeignKey, Index, Numeric, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntidadSincronizable


class Lote(EntidadSincronizable, Base):
    __tablename__ = "lote"
    __table_args__ = (
        CheckConstraint("area_ha > 0", name="area_positiva"),
        # Código único entre los lotes vigentes, sin distinguir mayúsculas.
        Index(
            "uq_lote_codigo",
            func.lower(text("codigo")),
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    predio_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("predio.id"), nullable=False)
    codigo: Mapped[str] = mapped_column(String(20), nullable=False)
    nombre: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Calculada en el servidor con ST_Area sobre geography (services/lotes.py).
    area_ha: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    geom: Mapped[WKBElement] = mapped_column(
        Geometry("POLYGON", srid=4326, spatial_index=True), nullable=False
    )
