"""Entorno de Alembic.

- Toma la URL de la base de datos de app.core.config (variables de entorno).
- Usa los ayudantes de GeoAlchemy2 para que las columnas Geometry y sus
  índices espaciales se rendericen bien en las migraciones.
- Ignora las tablas propias de PostGIS (spatial_ref_sys, esquemas tiger y
  topology) para que la autogeneración nunca intente borrarlas.
"""

from logging.config import fileConfig

from alembic import context
from geoalchemy2 import alembic_helpers
from sqlalchemy import engine_from_config, pool

import app.models  # noqa: F401  (registra todos los modelos en Base.metadata)
from app.core.config import get_settings
from app.db.base import Base

config = context.config
config.set_main_option("sqlalchemy.url", get_settings().database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

TABLAS_POSTGIS = {"spatial_ref_sys"}
ESQUEMAS_POSTGIS = {"tiger", "tiger_data", "topology"}


def include_object(obj, name, type_, reflected, compare_to):
    if type_ == "table" and (name in TABLAS_POSTGIS or obj.schema in ESQUEMAS_POSTGIS):
        return False
    return alembic_helpers.include_object(obj, name, type_, reflected, compare_to)


def _configure_kwargs() -> dict:
    return {
        "target_metadata": target_metadata,
        "include_object": include_object,
        "process_revision_directives": alembic_helpers.writer,
        "render_item": alembic_helpers.render_item,
        "compare_type": True,
    }


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        **_configure_kwargs(),
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, **_configure_kwargs())
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
