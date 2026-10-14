"""Crea un usuario desde la terminal (p. ej. el primer agrónomo).

    docker compose exec api python -m app.scripts.crear_usuario \\
        --usuario admin --nombre "Nombre Apellido" --rol agronomo
"""

import argparse
import asyncio
import getpass
import sys

from sqlalchemy import select

from app.db.session import SessionLocal, engine
from app.models.usuario import ROLES, Usuario
from app.services.auth import hashear_clave


async def crear(nombre_usuario: str, nombre_completo: str, rol: str, clave: str) -> None:
    async with SessionLocal() as session:
        existe = await session.scalar(
            select(Usuario).where(Usuario.nombre_usuario == nombre_usuario)
        )
        if existe:
            sys.exit(f"Ya existe un usuario con el nombre «{nombre_usuario}».")
        session.add(
            Usuario(
                nombre_usuario=nombre_usuario,
                nombre_completo=nombre_completo,
                rol=rol,
                clave_hash=hashear_clave(clave),
            )
        )
        await session.commit()
    await engine.dispose()
    print(f"Usuario «{nombre_usuario}» creado con rol {rol}.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Crear un usuario de la aplicación.")
    parser.add_argument("--usuario", required=True)
    parser.add_argument("--nombre", required=True, help="Nombre completo")
    parser.add_argument("--rol", required=True, choices=ROLES)
    args = parser.parse_args()

    clave = getpass.getpass("Contraseña: ")
    if len(clave) < 8:
        sys.exit("La contraseña debe tener al menos 8 caracteres.")
    if clave != getpass.getpass("Repita la contraseña: "):
        sys.exit("Las contraseñas no coinciden.")
    asyncio.run(crear(args.usuario.strip().lower(), args.nombre.strip(), args.rol, clave))


if __name__ == "__main__":
    main()
