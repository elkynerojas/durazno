"""Crea (o reactiva) el usuario que usan las pruebas E2E de Playwright.

    docker compose exec api python -m app.scripts.sembrar_e2e

Toma usuario y clave de E2E_USUARIO y E2E_CLAVE. No corre en producción.
"""

import asyncio
import os
import sys

from sqlalchemy import select

from app.core.config import get_settings
from app.db.session import SessionLocal, engine
from app.models.usuario import Usuario
from app.services.auth import hashear_clave


async def sembrar(nombre_usuario: str, clave: str) -> None:
    async with SessionLocal() as session:
        usuario = await session.scalar(
            select(Usuario).where(Usuario.nombre_usuario == nombre_usuario)
        )
        if usuario is None:
            usuario = Usuario(
                nombre_usuario=nombre_usuario, nombre_completo="Usuario E2E", rol="agronomo"
            )
            session.add(usuario)
        usuario.clave_hash = hashear_clave(clave)
        usuario.activo = True
        usuario.deleted_at = None
        await session.commit()
    await engine.dispose()
    print(f"Usuario E2E «{nombre_usuario}» listo.")


def main() -> None:
    if get_settings().environment == "production":
        sys.exit("No se crean usuarios de prueba en producción.")
    nombre_usuario = os.environ.get("E2E_USUARIO", "e2e-agronomo").strip().lower()
    clave = os.environ.get("E2E_CLAVE", "")
    if len(clave) < 8:
        sys.exit("Defina E2E_CLAVE (mínimo 8 caracteres) en .env.")
    asyncio.run(sembrar(nombre_usuario, clave))


if __name__ == "__main__":
    main()
