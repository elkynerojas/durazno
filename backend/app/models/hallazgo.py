import uuid
from datetime import datetime
from decimal import Decimal

from geoalchemy2 import Geometry, WKBElement
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntidadSincronizable


class Hallazgo(EntidadSincronizable, Base):
    """Irregularidad observada en un lote: hongo, plaga, árbol enfermo… (HU-41).

    Su estado (abierto, en atención, atendido) no se guarda: se deriva de las actividades de
    atención del plan (HU-42).
    """

    __tablename__ = "hallazgo"
    __table_args__ = (
        CheckConstraint("precision_m IS NULL OR precision_m >= 0", name="precision_no_negativa"),
        Index("ix_hallazgo_predio_observado", "predio_id", "observado_en"),
    )

    predio_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("predio.id"), nullable=False)
    lote_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lote.id"), nullable=False, index=True)
    tipo_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tipo_hallazgo.id"), nullable=False)
    titulo: Mapped[str] = mapped_column(String(120), nullable=False)
    descripcion: Mapped[str] = mapped_column(Text, nullable=False)
    geom: Mapped[WKBElement] = mapped_column(
        Geometry("POINT", srid=4326, spatial_index=True), nullable=False
    )
    # Precisión del GPS del teléfono; null si el punto se eligió tocando el mapa.
    precision_m: Mapped[Decimal | None] = mapped_column(Numeric(7, 2), nullable=True)
    observado_en: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    registrado_por_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("usuario.id"), nullable=False)


class EvidenciaHallazgo(EntidadSincronizable, Base):
    """Foto de un hallazgo (HU-41), ya reducida y sin metadatos EXIF.

    El archivo vive en `EVIDENCIAS_DIR/<archivo>` (y la miniatura en `…_min.jpg`); el borrado
    lógico lo conserva en disco.
    """

    __tablename__ = "evidencia_hallazgo"

    hallazgo_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hallazgo.id"), nullable=False, index=True
    )
    archivo: Mapped[str] = mapped_column(String(120), nullable=False)
    ancho: Mapped[int] = mapped_column(Integer, nullable=False)
    alto: Mapped[int] = mapped_column(Integer, nullable=False)
    bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    orden: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    subido_por_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("usuario.id"), nullable=False)
