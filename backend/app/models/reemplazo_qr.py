import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntidadSincronizable


class ReemplazoQr(EntidadSincronizable, Base):
    """Historial de reemplazos de la etiqueta QR de una trampa (HU-17).

    `codigo_anterior` queda retirado para siempre: no se reutiliza y al leerlo se informa que la
    etiqueta fue reemplazada. `created_at` es el momento del reemplazo.
    """

    __tablename__ = "reemplazo_qr"

    trampa_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trampa.id"), nullable=False, index=True
    )
    codigo_anterior: Mapped[str] = mapped_column(String(8), unique=True, nullable=False)
    codigo_nuevo: Mapped[str] = mapped_column(String(8), nullable=False)
    motivo: Mapped[str | None] = mapped_column(String(200), nullable=True)
    usuario_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("usuario.id"), nullable=False)
