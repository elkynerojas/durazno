from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, String, true
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntidadSincronizable

ROLES = ("tecnico", "agronomo", "productor")


class Usuario(EntidadSincronizable, Base):
    __tablename__ = "usuario"
    __table_args__ = (CheckConstraint(f"rol IN {ROLES}", name="rol_valido"),)

    correo: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    nombre_completo: Mapped[str] = mapped_column(String(150), nullable=False)
    clave_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    rol: Mapped[str] = mapped_column(String(20), nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=true())
    # Ley 1581 de 2012: momento en que el agrónomo registró que el titular fue informado del
    # tratamiento de sus datos y lo autorizó. Nulo en cuentas creadas antes de HU-06.
    autorizacion_datos_en: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Revocación de sesiones: se rechaza todo token emitido antes de este momento. Sube al
    # cambiar la clave, el rol o el estado de la cuenta (auditorías HU-05 y HU-06).
    sesion_valida_desde: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
