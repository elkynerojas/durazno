"""agregar codigo qr a trampa

Revision ID: fded3ded9cf5
Revises: 0bdb5d366075
Create Date: 2026-10-17 19:37:02.313579

"""

import secrets
from collections.abc import Sequence

import geoalchemy2  # noqa: F401  (tipos Geometry en migraciones)
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "fded3ded9cf5"
down_revision: str | Sequence[str] | None = "0bdb5d366075"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Copia del alfabeto de app/services/qr.py: la migración no depende del código de la app.
ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


def upgrade() -> None:
    """Agrega codigo_qr y asigna uno a cada trampa existente antes de exigirlo."""
    op.add_column("trampa", sa.Column("codigo_qr", sa.String(length=8), nullable=True))
    conexion = op.get_bind()
    usados: set[str] = set()
    for (trampa_id,) in conexion.execute(sa.text("SELECT id FROM trampa")):
        codigo = None
        while codigo is None or codigo in usados:
            codigo = "".join(secrets.choice(ALFABETO) for _ in range(8))
        usados.add(codigo)
        conexion.execute(
            sa.text("UPDATE trampa SET codigo_qr = :codigo WHERE id = :id"),
            {"codigo": codigo, "id": trampa_id},
        )
    op.alter_column("trampa", "codigo_qr", nullable=False)
    op.create_unique_constraint(op.f("uq_trampa_codigo_qr"), "trampa", ["codigo_qr"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(op.f("uq_trampa_codigo_qr"), "trampa", type_="unique")
    op.drop_column("trampa", "codigo_qr")
