import uuid

from sqlalchemy import ForeignKey, Index, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, EntidadSincronizable


class PredioUsuario(EntidadSincronizable, Base):
    """Asignación de un usuario a un predio: solo ve y trabaja en los predios asignados, con su
    rol. El administrador no necesita asignación (ve todos)."""

    __tablename__ = "predio_usuario"
    __table_args__ = (
        Index(
            "uq_predio_usuario",
            text("predio_id"),
            text("usuario_id"),
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    predio_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("predio.id"), nullable=False)
    usuario_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("usuario.id"), nullable=False, index=True
    )
