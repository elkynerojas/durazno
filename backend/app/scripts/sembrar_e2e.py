"""Crea (o reactiva) el usuario que usan las pruebas E2E de Playwright.

    docker compose exec api python -m app.scripts.sembrar_e2e

Toma correo y clave de E2E_CORREO y E2E_CLAVE. No corre en producción.
"""

import asyncio
import os
import sys

from sqlalchemy import select

from app.core.config import ENTORNOS_LOCALES, get_settings
from app.db.session import SessionLocal, engine
from app.models.usuario import Usuario
from app.services.auth import hashear_clave


async def sembrar(correo: str, clave: str) -> None:
    async with SessionLocal() as session:
        usuario = await session.scalar(select(Usuario).where(Usuario.correo == correo))
        if usuario is None:
            usuario = Usuario(correo=correo, nombre_completo="Usuario E2E", rol="administrador")
            session.add(usuario)
        # Administrador: crea su propio predio de pruebas y trabaja en él.
        usuario.rol = "administrador"
        usuario.clave_hash = hashear_clave(clave)
        usuario.activo = True
        usuario.deleted_at = None
        await session.commit()
    await engine.dispose()
    print(f"Usuario E2E «{correo}» listo.")


def main() -> None:
    # Solo en desarrollo o pruebas: crea un administrador con una clave conocida.
    if get_settings().environment not in ENTORNOS_LOCALES:
        sys.exit("Los usuarios de prueba solo se crean en desarrollo o pruebas.")
    correo = os.environ.get("E2E_CORREO", "e2e-agronomo@example.com").strip().lower()
    clave = os.environ.get("E2E_CLAVE", "")
    if len(clave) < 8:
        sys.exit("Defina E2E_CLAVE (mínimo 8 caracteres) en .env.")
    asyncio.run(sembrar(correo, clave))


if __name__ == "__main__":
    main()
