"""cambiar usuario a correo

Revision ID: a3c1e5f20b14
Revises: d57391744aa7
Create Date: 2026-10-14 18:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a3c1e5f20b14"
down_revision: str | Sequence[str] | None = "d57391744aa7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Renombrar (no borrar y crear) para conservar las filas existentes.
    op.alter_column(
        "usuario",
        "nombre_usuario",
        new_column_name="correo",
        type_=sa.String(length=254),
        existing_nullable=False,
    )
    op.execute(
        "ALTER TABLE usuario RENAME CONSTRAINT uq_usuario_nombre_usuario TO uq_usuario_correo"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(
        "ALTER TABLE usuario RENAME CONSTRAINT uq_usuario_correo TO uq_usuario_nombre_usuario"
    )
    op.alter_column(
        "usuario",
        "correo",
        new_column_name="nombre_usuario",
        type_=sa.String(length=50),
        existing_nullable=False,
    )
