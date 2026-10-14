"""Base declarativa y columnas comunes a todas las entidades del dominio.

Toda tabla del dominio (predio, lote, trampa, ruta, visita, lectura, plan...)
hereda de `Base` y de `EntidadSincronizable`. Esto deja listo el modelo para la
sincronización sin conexión de la app móvil (fase 2):

- `id`: UUIDv7. Puede generarlo el cliente (registro creado sin conexión) o
  el servidor (`uuidv7()` nativo de PostgreSQL 18).
- `created_at` / `updated_at`: marcas en UTC (timestamptz).
- `deleted_at`: borrado lógico. Nunca se borran filas físicamente desde la API.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, MetaData, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from uuid6 import uuid7

# Nombres de restricciones predecibles para que Alembic genere migraciones estables.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class EntidadSincronizable:
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid7,
        server_default=text("uuidv7()"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
