import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.acceso import ADMINISTRADOR, ROLES_GESTION, consulta_predios_visibles, exigir_predio
from app.api.deps import SessionDep, UsuarioActualDep, requiere_rol
from app.models.lote import Lote
from app.models.predio import Predio
from app.models.predio_usuario import PredioUsuario
from app.models.usuario import Usuario
from app.schemas.geo import a_geometria
from app.schemas.predio import PersonaPredio, PredioGuardar, PredioLeer
from app.services.geo import motivo_invalidez

router = APIRouter(prefix="/predios", tags=["predios"])

AdministradorDep = Annotated[Usuario, Depends(requiere_rol(ADMINISTRADOR))]

ERROR_401 = {401: {"description": "Sin sesión o sesión inválida"}}
ERROR_403 = {403: {"description": "Sin permiso para esta acción"}}
ERROR_404 = {404: {"description": "Predio no encontrado (o no asignado al usuario)"}}
ERROR_422 = {422: {"description": "Datos o polígono inválidos"}}


async def _aplicar(session: SessionDep, predio: Predio, entrada: PredioGuardar) -> None:
    limite = a_geometria(entrada.limite) if entrada.limite else None
    if limite is not None and (motivo := await motivo_invalidez(session, limite)):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=motivo)
    for campo, valor in entrada.model_dump(exclude={"id", "limite"}).items():
        setattr(predio, campo, valor)
    predio.limite = limite


@router.get(
    "",
    response_model=list[PredioLeer],
    summary="Listar predios",
    description="Predios asignados al usuario (el administrador ve todos), por nombre.",
    responses=ERROR_401,
)
async def listar_predios(usuario: UsuarioActualDep, session: SessionDep) -> list[Predio]:
    return list(await session.scalars(consulta_predios_visibles(usuario).order_by(Predio.nombre)))


@router.post(
    "",
    response_model=PredioLeer,
    status_code=status.HTTP_201_CREATED,
    summary="Crear un predio",
    description="Solo el administrador. El `limite` es opcional y debe ser un polígono válido. "
    "Reenviar el mismo `id` devuelve el predio existente con 200.",
    responses={
        200: {"description": "El predio con ese `id` ya existía", "model": PredioLeer},
        **ERROR_401,
        **ERROR_403,
        409: {"description": "El `id` pertenece a un predio eliminado"},
        **ERROR_422,
    },
)
async def crear_predio(
    entrada: PredioGuardar, _admin: AdministradorDep, session: SessionDep, response: Response
) -> Predio:
    if entrada.id is not None and (existente := await session.get(Predio, entrada.id)):
        if existente.deleted_at is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="El id pertenece a un predio eliminado"
            )
        response.status_code = status.HTTP_200_OK
        return existente
    predio = Predio()
    if entrada.id is not None:
        predio.id = entrada.id
    await _aplicar(session, predio, entrada)
    session.add(predio)
    await session.commit()
    await session.refresh(predio)
    return predio


@router.get(
    "/{predio_id}",
    response_model=PredioLeer,
    summary="Obtener un predio",
    responses={**ERROR_401, **ERROR_404},
)
async def obtener_predio(
    predio_id: uuid.UUID, usuario: UsuarioActualDep, session: SessionDep
) -> Predio:
    return await exigir_predio(session, usuario, predio_id)


@router.put(
    "/{predio_id}",
    response_model=PredioLeer,
    summary="Actualizar los datos de un predio",
    description="Reemplaza los datos del predio (un `limite` en `null` lo elimina). Lo hace el "
    "administrador o un agrónomo asignado al predio.",
    responses={**ERROR_401, **ERROR_403, **ERROR_404, **ERROR_422},
)
async def actualizar_predio(
    predio_id: uuid.UUID, entrada: PredioGuardar, usuario: UsuarioActualDep, session: SessionDep
) -> Predio:
    predio = await exigir_predio(session, usuario, predio_id, escribir=True)
    await _aplicar(session, predio, entrada)
    await session.commit()
    await session.refresh(predio)
    return predio


@router.delete(
    "/{predio_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar un predio",
    description="Borrado lógico, solo el administrador y solo si el predio no tiene lotes.",
    responses={
        **ERROR_401,
        **ERROR_403,
        **ERROR_404,
        409: {"description": "El predio tiene lotes registrados"},
    },
)
async def eliminar_predio(
    predio_id: uuid.UUID, admin: AdministradorDep, session: SessionDep
) -> None:
    # escribir=True bloquea la fila: nadie crea un lote mientras se verifica y se borra.
    predio = await exigir_predio(session, admin, predio_id, escribir=True)
    tiene_lotes = await session.scalar(
        select(Lote.id).where(Lote.predio_id == predio.id, Lote.deleted_at.is_(None)).limit(1)
    )
    if tiene_lotes is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El predio tiene lotes registrados: elimínelos antes de borrarlo",
        )
    predio.deleted_at = datetime.now(UTC)
    await session.commit()


# --- Personal asignado ---


async def _asignacion(
    session: SessionDep, predio_id: uuid.UUID, usuario_id: uuid.UUID
) -> PredioUsuario | None:
    return await session.scalar(
        select(PredioUsuario).where(
            PredioUsuario.predio_id == predio_id,
            PredioUsuario.usuario_id == usuario_id,
            PredioUsuario.deleted_at.is_(None),
        )
    )


@router.get(
    "/{predio_id}/usuarios",
    response_model=list[PersonaPredio],
    summary="Personal asignado a un predio",
    description="Usuarios que trabajan en el predio. Lo consultan el administrador y los "
    "agrónomos asignados (datos personales: Ley 1581).",
    responses={**ERROR_401, **ERROR_403, **ERROR_404},
)
async def listar_personal(
    predio_id: uuid.UUID, usuario: UsuarioActualDep, session: SessionDep
) -> list[Usuario]:
    await exigir_predio(session, usuario, predio_id, escribir=True, roles_escritura=ROLES_GESTION)
    consulta = (
        select(Usuario)
        .join(PredioUsuario, PredioUsuario.usuario_id == Usuario.id)
        .where(
            PredioUsuario.predio_id == predio_id,
            PredioUsuario.deleted_at.is_(None),
            Usuario.deleted_at.is_(None),
        )
        .order_by(Usuario.nombre_completo)
    )
    return list(await session.scalars(consulta))


@router.put(
    "/{predio_id}/usuarios/{usuario_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Asignar un usuario a un predio",
    description="Solo el administrador. Idempotente: asignar dos veces no duplica.",
    responses={**ERROR_401, **ERROR_403, 404: {"description": "Predio o usuario no encontrado"}},
)
async def asignar_usuario(
    predio_id: uuid.UUID, usuario_id: uuid.UUID, admin: AdministradorDep, session: SessionDep
) -> None:
    await exigir_predio(session, admin, predio_id)
    persona = await session.scalar(
        select(Usuario).where(Usuario.id == usuario_id, Usuario.deleted_at.is_(None))
    )
    if persona is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    if await _asignacion(session, predio_id, usuario_id) is None:
        session.add(PredioUsuario(predio_id=predio_id, usuario_id=usuario_id))
        try:
            await session.commit()
        except IntegrityError:
            # Otra petición igual lo asignó al mismo tiempo: el resultado es el mismo.
            await session.rollback()


@router.delete(
    "/{predio_id}/usuarios/{usuario_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Quitar un usuario de un predio",
    description="Solo el administrador. El usuario deja de ver el predio de inmediato; sus "
    "registros anteriores se conservan.",
    responses={**ERROR_401, **ERROR_403, 404: {"description": "Predio o asignación no encontrada"}},
)
async def quitar_usuario(
    predio_id: uuid.UUID, usuario_id: uuid.UUID, admin: AdministradorDep, session: SessionDep
) -> None:
    await exigir_predio(session, admin, predio_id)
    asignacion = await _asignacion(session, predio_id, usuario_id)
    if asignacion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="El usuario no está asignado"
        )
    asignacion.deleted_at = datetime.now(UTC)
    await session.commit()
