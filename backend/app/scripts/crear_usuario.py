"""Crea un usuario desde la terminal (p. ej. el primer agrónomo).

    docker compose exec api python -m app.scripts.crear_usuario \\
        --correo admin@ejemplo.com --nombre "Nombre Apellido" --rol agronomo
"""

import argparse
import asyncio
import getpass
import sys

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import select

from app.db.session import SessionLocal, engine
from app.models.usuario import ROLES, Usuario
from app.services.auth import hashear_clave


async def crear(correo: str, nombre_completo: str, rol: str, clave: str) -> None:
    async with SessionLocal() as session:
        existe = await session.scalar(select(Usuario).where(Usuario.correo == correo))
        if existe:
            sys.exit(f"Ya existe un usuario con el correo «{correo}».")
        session.add(
            Usuario(
                correo=correo,
                nombre_completo=nombre_completo,
                rol=rol,
                clave_hash=hashear_clave(clave),
            )
        )
        await session.commit()
    await engine.dispose()
    print(f"Usuario «{correo}» creado con rol {rol}.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Crear un usuario de la aplicación.")
    parser.add_argument("--correo", required=True)
    parser.add_argument("--nombre", required=True, help="Nombre completo")
    parser.add_argument("--rol", required=True, choices=ROLES)
    args = parser.parse_args()
    try:
        correo = validate_email(args.correo, check_deliverability=False).normalized.lower()
    except EmailNotValidError as error:
        sys.exit(f"Correo inválido: {error}")

    clave = getpass.getpass("Contraseña: ")
    if not 8 <= len(clave) <= 128:
        sys.exit("La contraseña debe tener entre 8 y 128 caracteres.")
    if clave != getpass.getpass("Repita la contraseña: "):
        sys.exit("Las contraseñas no coinciden.")
    asyncio.run(crear(correo, args.nombre.strip(), args.rol, clave))


if __name__ == "__main__":
    main()
