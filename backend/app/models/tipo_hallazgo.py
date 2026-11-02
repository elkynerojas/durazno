from sqlalchemy import Boolean, CheckConstraint, Index, SmallInteger, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntidadSincronizable


class TipoHallazgo(EntidadSincronizable, Base):
    """Catálogo de tipos de hallazgo de la inspección (HU-40). Lo administra el administrador."""

    __tablename__ = "tipo_hallazgo"
    __table_args__ = (
        CheckConstraint("color ~ '^#[0-9a-f]{6}$'", name="color_hex"),
        # Nombre único entre los tipos vigentes, sin distinguir mayúsculas.
        Index(
            "uq_tipo_hallazgo_nombre",
            func.lower(text("nombre")),
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    nombre: Mapped[str] = mapped_column(String(60), nullable=False)
    # Color del marcador del hallazgo en los mapas.
    color: Mapped[str] = mapped_column(String(7), nullable=False)
    # Un tipo no se borra: se desactiva y los hallazgos que lo usan lo conservan.
    activo: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    orden: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
