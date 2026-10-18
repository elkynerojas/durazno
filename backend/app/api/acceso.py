"""Control de acceso por predio: cada usuario ve solo sus predios asignados; el administrador ve
todos. Se aplica a todo recurso del dominio (lote, trampa, QR, etiquetas, exportación) a partir
del predio al que pertenece, para que nadie lea ni modifique datos de otro predio por su id."""

import uuid

from fastapi import HTTPException, status
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lote import Lote
from app.models.predio import Predio
from app.models.predio_usuario import PredioUsuario
from app.models.trampa import Trampa
from app.models.usuario import Usuario

ADMINISTRADOR = "administrador"
# Quién crea y modifica lotes, trampas y datos del predio.
ROLES_GESTION = ("agronomo", ADMINISTRADOR)
# Trabajo de campo: lecturas de trampa y reposición de etiquetas.
ROLES_CAMPO = ("tecnico", "agronomo", ADMINISTRADOR)
NO_ENCONTRADO = "Predio no encontrado"


def consulta_predios_visibles(usuario: Usuario) -> Select:
    """Predios vigentes que el usuario puede ver."""
    consulta = select(Predio).where(Predio.deleted_at.is_(None))
    if usuario.rol != ADMINISTRADOR:
        consulta = consulta.where(
            Predio.id.in_(
                select(PredioUsuario.predio_id).where(
                    PredioUsuario.usuario_id == usuario.id, PredioUsuario.deleted_at.is_(None)
                )
            )
        )
    return consulta


async def exigir_predio(
    session: AsyncSession,
    usuario: Usuario,
    predio_id: uuid.UUID | None,
    *,
    escribir: bool = False,
    roles_escritura: tuple[str, ...] = ROLES_GESTION,
    detalle_404: str = NO_ENCONTRADO,
) -> Predio:
    """El predio si el usuario lo ve (404 si no, sin revelar que existe) y, para escribir, si
    además tiene un rol con permiso (403)."""
    predio = None
    if predio_id is not None:
        consulta = consulta_predios_visibles(usuario).where(Predio.id == predio_id)
        # Las escrituras bloquean la fila del predio hasta el commit: así no se crea un lote en
        # un predio que otra petición está eliminando.
        if escribir:
            consulta = consulta.with_for_update(of=Predio)
        predio = await session.scalar(consulta)
    if predio is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detalle_404)
    if escribir and usuario.rol not in roles_escritura:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tiene permiso para realizar esta acción",
        )
    return predio


async def exigir_lote(
    session: AsyncSession,
    usuario: Usuario,
    lote_id: uuid.UUID,
    *,
    escribir: bool = False,
    roles_escritura: tuple[str, ...] = ROLES_GESTION,
) -> Lote:
    """El lote vigente si el usuario ve su predio; 404 «Lote no encontrado» en otro caso."""
    lote = await session.scalar(select(Lote).where(Lote.id == lote_id, Lote.deleted_at.is_(None)))
    await exigir_predio(
        session,
        usuario,
        lote.predio_id if lote else None,
        escribir=escribir,
        roles_escritura=roles_escritura,
        detalle_404="Lote no encontrado",
    )
    return lote


async def exigir_trampa(
    session: AsyncSession,
    usuario: Usuario,
    trampa_id: uuid.UUID,
    *,
    escribir: bool = False,
    roles_escritura: tuple[str, ...] = ROLES_GESTION,
) -> Trampa:
    """La trampa vigente si el usuario ve su predio (a través del lote); si no, 404."""
    fila = (
        await session.execute(
            select(Trampa, Lote.predio_id)
            .join(Lote, Lote.id == Trampa.lote_id)
            .where(Trampa.id == trampa_id, Trampa.deleted_at.is_(None))
        )
    ).first()
    await exigir_predio(
        session,
        usuario,
        fila[1] if fila else None,
        escribir=escribir,
        roles_escritura=roles_escritura,
        detalle_404="Trampa no encontrada",
    )
    return fila[0]
