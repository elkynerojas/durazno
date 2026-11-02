import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.api.acceso import ADMINISTRADOR
from app.api.deps import SessionDep, UsuarioActualDep, requiere_rol
from app.models.tipo_hallazgo import TipoHallazgo
from app.models.usuario import Usuario
from app.schemas.inspeccion import TipoHallazgoActualizar, TipoHallazgoCrear, TipoHallazgoLeer

router = APIRouter(prefix="/inspecciones", tags=["inspecciones"])

AdministradorDep = Annotated[Usuario, Depends(requiere_rol(ADMINISTRADOR))]

ERROR_401 = {401: {"description": "Sin sesión o sesión inválida"}}
ERROR_403 = {403: {"description": "Sin permiso para esta acción"}}
NOMBRE_REPETIDO = "Ya existe un tipo de hallazgo con ese nombre"


# --- Tipos de hallazgo (HU-40) ---


async def _nombre_libre(session: SessionDep, nombre: str, excepto: uuid.UUID | None) -> None:
    consulta = select(TipoHallazgo.id).where(
        func.lower(TipoHallazgo.nombre) == nombre.lower(), TipoHallazgo.deleted_at.is_(None)
    )
    if excepto is not None:
        consulta = consulta.where(TipoHallazgo.id != excepto)
    if await session.scalar(consulta) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=NOMBRE_REPETIDO)


async def _exigir_tipo(session: SessionDep, tipo_id: uuid.UUID) -> TipoHallazgo:
    tipo = await session.get(TipoHallazgo, tipo_id)
    if tipo is None or tipo.deleted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tipo de hallazgo no encontrado"
        )
    return tipo


async def _guardar(session: SessionDep, tipo: TipoHallazgo) -> TipoHallazgo:
    try:
        await session.commit()
    except IntegrityError as error:
        # Carrera con otro guardado del mismo nombre (índice único parcial).
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=NOMBRE_REPETIDO) from error
    await session.refresh(tipo)
    return tipo


@router.get(
    "/tipos",
    response_model=list[TipoHallazgoLeer],
    summary="Listar los tipos de hallazgo",
    description="Tipos activos, por orden y nombre. El administrador puede pedir también los "
    "inactivos con `todos=true` para administrarlos.",
    responses=ERROR_401,
)
async def listar_tipos(
    usuario: UsuarioActualDep, session: SessionDep, todos: bool = False
) -> list[TipoHallazgo]:
    consulta = select(TipoHallazgo).where(TipoHallazgo.deleted_at.is_(None))
    if not (todos and usuario.rol == ADMINISTRADOR):
        consulta = consulta.where(TipoHallazgo.activo.is_(True))
    return list(await session.scalars(consulta.order_by(TipoHallazgo.orden, TipoHallazgo.nombre)))


@router.post(
    "/tipos",
    response_model=TipoHallazgoLeer,
    status_code=status.HTTP_201_CREATED,
    summary="Crear un tipo de hallazgo",
    description="Solo el administrador. El nombre no se repite entre los tipos vigentes (sin "
    "distinguir mayúsculas). Reenviar el mismo `id` devuelve el tipo existente con 200.",
    responses={
        200: {"description": "El tipo con ese `id` ya existía", "model": TipoHallazgoLeer},
        **ERROR_401,
        **ERROR_403,
        409: {"description": "Nombre repetido o `id` de un tipo eliminado"},
        422: {"description": "Datos inválidos"},
    },
)
async def crear_tipo(
    entrada: TipoHallazgoCrear, _admin: AdministradorDep, session: SessionDep, response: Response
) -> TipoHallazgo:
    if entrada.id is not None and (existente := await session.get(TipoHallazgo, entrada.id)):
        if existente.deleted_at is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El id pertenece a un tipo de hallazgo eliminado",
            )
        response.status_code = status.HTTP_200_OK
        return existente
    await _nombre_libre(session, entrada.nombre, None)
    tipo = TipoHallazgo(**entrada.model_dump(exclude={"id"}))
    if entrada.id is not None:
        tipo.id = entrada.id
    session.add(tipo)
    return await _guardar(session, tipo)


@router.patch(
    "/tipos/{tipo_id}",
    response_model=TipoHallazgoLeer,
    summary="Actualizar un tipo de hallazgo",
    description="Solo el administrador: renombra, cambia el color o el orden, o lo activa y "
    "desactiva. Un tipo no se borra; desactivado deja de ofrecerse al registrar, pero los "
    "hallazgos que ya lo usan lo conservan.",
    responses={
        **ERROR_401,
        **ERROR_403,
        404: {"description": "Tipo de hallazgo no encontrado"},
        409: {"description": "Nombre repetido"},
        422: {"description": "Datos inválidos"},
    },
)
async def actualizar_tipo(
    tipo_id: uuid.UUID,
    entrada: TipoHallazgoActualizar,
    _admin: AdministradorDep,
    session: SessionDep,
) -> TipoHallazgo:
    tipo = await _exigir_tipo(session, tipo_id)
    cambios = entrada.model_dump(exclude_unset=True, exclude_none=True)
    if "nombre" in cambios:
        await _nombre_libre(session, cambios["nombre"], tipo.id)
    for campo, valor in cambios.items():
        setattr(tipo, campo, valor)
    return await _guardar(session, tipo)
