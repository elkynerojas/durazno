"""Crea (o reactiva) los usuarios que usan las pruebas E2E de Playwright.

    docker compose exec api python -m app.scripts.sembrar_e2e

Un administrador (E2E_CORREO) y un técnico (E2E_TECNICO_CORREO), ambos con la clave E2E_CLAVE.
Las pruebas asignan el técnico a su predio. No corre en producción.
"""

import asyncio
import os
import sys

from sqlalchemy import select

from app.core.config import ENTORNOS_LOCALES, get_settings
from app.db.session import SessionLocal, engine
from app.models.usuario import Usuario
from app.services.auth import hashear_clave


async def _asegurar(session, correo: str, nombre: str, rol: str, clave: str) -> None:
    usuario = await session.scalar(select(Usuario).where(Usuario.correo == correo))
    if usuario is None:
        usuario = Usuario(correo=correo, nombre_completo=nombre, rol=rol)
        session.add(usuario)
    usuario.rol = rol
    usuario.clave_hash = hashear_clave(clave)
    usuario.activo = True
    usuario.deleted_at = None


async def sembrar(correo: str, correo_tecnico: str, clave: str) -> None:
    async with SessionLocal() as session:
        # Administrador: crea su propio predio de pruebas y trabaja en él.
        await _asegurar(session, correo, "Usuario E2E", "administrador", clave)
        # Técnico: responsable de las actividades del plan («Mi semana»).
        await _asegurar(session, correo_tecnico, "Técnico E2E", "tecnico", clave)
        await session.commit()
    await engine.dispose()
    print(f"Usuarios E2E «{correo}» y «{correo_tecnico}» listos.")


def main() -> None:
    # Solo en desarrollo o pruebas: crea un administrador con una clave conocida.
    if get_settings().environment not in ENTORNOS_LOCALES:
        sys.exit("Los usuarios de prueba solo se crean en desarrollo o pruebas.")
    correo = os.environ.get("E2E_CORREO", "e2e-agronomo@example.com").strip().lower()
    correo_tecnico = os.environ.get("E2E_TECNICO_CORREO", "e2e-tecnico@example.com").strip().lower()
    clave = os.environ.get("E2E_CLAVE", "")
    if len(clave) < 8:
        sys.exit("Defina E2E_CLAVE (mínimo 8 caracteres) en .env.")
    asyncio.run(sembrar(correo, correo_tecnico, clave))


if __name__ == "__main__":
    main()
