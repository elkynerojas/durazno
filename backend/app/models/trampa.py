import uuid
from datetime import date
from decimal import Decimal

from geoalchemy2 import Geometry, WKBElement
from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, Numeric, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntidadSincronizable

TIPOS_TRAMPA = ("jackson", "mcphail")
ESTADOS_TRAMPA = ("activa", "inactiva", "retirada")


class Trampa(EntidadSincronizable, Base):
    __tablename__ = "trampa"
    __table_args__ = (
        CheckConstraint(f"tipo IN {TIPOS_TRAMPA}", name="tipo_valido"),
        CheckConstraint(f"estado IN {ESTADOS_TRAMPA}", name="estado_valido"),
        CheckConstraint("precision_m IS NULL OR precision_m >= 0", name="precision_no_negativa"),
        # Código ICA único entre las trampas vigentes, sin distinguir mayúsculas.
        Index(
            "uq_trampa_codigo_ica",
            func.lower(text("codigo_ica")),
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    lote_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lote.id"), nullable=False, index=True)
    codigo_ica: Mapped[str] = mapped_column(String(30), nullable=False)
    # Código corto del QR (services/qr.py). Único aun entre trampas borradas: nunca se reutiliza.
    codigo_qr: Mapped[str] = mapped_column(String(8), unique=True, nullable=False)
    tipo: Mapped[str] = mapped_column(String(10), nullable=False)
    atrayente: Mapped[str] = mapped_column(String(60), nullable=False)
    fecha_instalacion: Mapped[date] = mapped_column(Date, nullable=False)
    estado: Mapped[str] = mapped_column(String(10), nullable=False, server_default="activa")
    geom: Mapped[WKBElement] = mapped_column(
        Geometry("POINT", srid=4326, spatial_index=True), nullable=False
    )
    # Precisión horizontal reportada por el GPS del dispositivo; nula si se ubicó en el mapa.
    precision_m: Mapped[Decimal | None] = mapped_column(Numeric(7, 2), nullable=True)
