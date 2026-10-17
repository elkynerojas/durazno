from decimal import Decimal

from geoalchemy2 import Geometry, WKBElement
from sqlalchemy import CheckConstraint, Index, Numeric, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntidadSincronizable


class Predio(EntidadSincronizable, Base):
    __tablename__ = "predio"
    __table_args__ = (
        CheckConstraint("area_ha > 0", name="area_positiva"),
        # Un único predio en esta versión (sin multi-tenancy): a lo sumo una fila sin borrar.
        Index(
            "uq_predio_unico",
            text("(deleted_at IS NULL)"),
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    vereda: Mapped[str] = mapped_column(String(100), nullable=False)
    municipio: Mapped[str] = mapped_column(String(100), nullable=False)
    registro_ica: Mapped[str | None] = mapped_column(String(50), nullable=True)
    area_ha: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    limite: Mapped[WKBElement | None] = mapped_column(
        Geometry("POLYGON", srid=4326, spatial_index=True), nullable=True
    )
