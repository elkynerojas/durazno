from sqlalchemy import Boolean, CheckConstraint, String, true
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
