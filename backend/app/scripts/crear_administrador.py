"""Convierte una cuenta existente en administrador (crea predios, asigna personal y administra
cuentas). Sirve para el primer administrador; los siguientes los nombra uno existente.

    docker compose exec api python -m app.scripts.crear_administrador correo@ejemplo.co

Fuera de desarrollo pide confirmar escribiendo el correo otra vez.
"""

import asyncio
import sys
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import ENTORNOS_LOCALES, get_settings
from app.db.session import SessionLocal, engine
from app.models.usuario import Usuario


async def promover(session: AsyncSession, correo: str) -> str:
    usuario = await session.scalar(
        select(Usuario).where(Usuario.correo == correo, Usuario.deleted_at.is_(None))
    )
    if usuario is None:
        return f"No existe una cuenta vigente con el correo {correo}."
    if usuario.rol == "administrador":
        return f"{correo} ya es administrador."
    # Una cuenta desactivada a propósito no se reactiva por esta vía.
    if not usuario.activo:
        return f"La cuenta {correo} está desactivada: reactívela desde Usuarios primero."
    usuario.rol = "administrador"
    # Cambiar el rol cierra las sesiones abiertas de la cuenta.
    usuario.sesion_valida_desde = datetime.now(UTC)
    await session.commit()
    return f"{correo} ahora es administrador. Debe iniciar sesión de nuevo."


async def _ejecutar(correo: str) -> str:
    async with SessionLocal() as session:
        mensaje = await promover(session, correo)
    await engine.dispose()
    return mensaje


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("Uso: python -m app.scripts.crear_administrador <correo>")
    correo = sys.argv[1].strip().lower()
    if get_settings().environment not in ENTORNOS_LOCALES:
        confirmacion = input(f"Escriba de nuevo {correo} para confirmar: ").strip().lower()
        if confirmacion != correo:
            sys.exit("Cancelado.")
    print(asyncio.run(_ejecutar(correo)))


if __name__ == "__main__":
    main()
