import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.deps import SessionDep, requiere_rol
from app.models.usuario import Usuario
from app.schemas.usuario import UsuarioActualizar, UsuarioAdminLeer, UsuarioCrear
from app.services.auth import hashear_clave

router = APIRouter(prefix="/usuarios", tags=["usuarios"])

AgronomoDep = Annotated[Usuario, Depends(requiere_rol("agronomo"))]

ERRORES_ACCESO = {
    401: {"description": "Sin sesión o sesión inválida"},
    403: {"description": "Solo el agrónomo administra cuentas"},
}
ERROR_404 = {404: {"description": "Usuario no encontrado"}}
ERROR_409 = {409: {"description": "Correo repetido o cambio que dejaría sin administrador"}}

CORREO_REPETIDO = "Ya existe un usuario con ese correo"
ID_EN_USO = "El id ya pertenece a otra cuenta"


async def _obtener(session: SessionDep, usuario_id: uuid.UUID) -> Usuario:
    usuario = await session.scalar(
        select(Usuario).where(Usuario.id == usuario_id, Usuario.deleted_at.is_(None))
    )
    if usuario is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    return usuario


async def _guardar(session: SessionDep, usuario: Usuario) -> Usuario:
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        restriccion = getattr(getattr(error.orig, "diag", None), "constraint_name", None)
        detalle = ID_EN_USO if restriccion == "pk_usuario" else CORREO_REPETIDO
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detalle) from None
    await session.refresh(usuario)
    return usuario


async def _agronomos_activos(session: SessionDep) -> int:
    # FOR UPDATE serializa los cambios simultáneos entre agrónomos: el segundo espera al primero
    # y vuelve a contar sin la cuenta ya desactivada.
    ids = await session.scalars(
        select(Usuario.id)
        .where(Usuario.rol == "agronomo", Usuario.activo.is_(True), Usuario.deleted_at.is_(None))
        .with_for_update()
    )
    return len(ids.all())


@router.get(
    "",
    response_model=list[UsuarioAdminLeer],
    summary="Listar usuarios",
    description="Cuentas del predio ordenadas por nombre. `activo` filtra activas o inactivas.",
    responses=ERRORES_ACCESO,
)
async def listar_usuarios(
    _agronomo: AgronomoDep, session: SessionDep, activo: bool | None = None
) -> list[Usuario]:
    consulta = select(Usuario).where(Usuario.deleted_at.is_(None))
    if activo is not None:
        consulta = consulta.where(Usuario.activo.is_(activo))
    return list(await session.scalars(consulta.order_by(Usuario.nombre_completo)))


@router.get(
    "/{usuario_id}",
    response_model=UsuarioAdminLeer,
    summary="Obtener un usuario",
    responses={**ERRORES_ACCESO, **ERROR_404},
)
async def obtener_usuario(
    usuario_id: uuid.UUID, _agronomo: AgronomoDep, session: SessionDep
) -> Usuario:
    return await _obtener(session, usuario_id)


@router.post(
    "",
    response_model=UsuarioAdminLeer,
    status_code=status.HTTP_201_CREATED,
    summary="Crear un usuario",
    description="Crea la cuenta con la contraseña inicial que define el agrónomo. Si se envía un "
    "`id` que ya existe con el mismo correo y rol, devuelve esa cuenta con 200 sin duplicarla; "
    "con otros datos o si la cuenta fue eliminada, responde 409.",
    responses={
        200: {"description": "La cuenta con ese `id` ya existía", "model": UsuarioAdminLeer},
        **ERRORES_ACCESO,
        **ERROR_409,
    },
)
async def crear_usuario(
    entrada: UsuarioCrear, _agronomo: AgronomoDep, session: SessionDep, response: Response
) -> Usuario:
    if entrada.id is not None:
        existente = await session.get(Usuario, entrada.id)
        if existente is not None:
            if existente.deleted_at is not None or (existente.correo, existente.rol) != (
                entrada.correo,
                entrada.rol,
            ):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ID_EN_USO)
            response.status_code = status.HTTP_200_OK
            return existente
    usuario = Usuario(
        correo=entrada.correo,
        nombre_completo=entrada.nombre_completo,
        rol=entrada.rol,
        clave_hash=hashear_clave(entrada.clave),
        autorizacion_datos_en=datetime.now(UTC),
    )
    if entrada.id is not None:
        usuario.id = entrada.id
    session.add(usuario)
    return await _guardar(session, usuario)


@router.patch(
    "/{usuario_id}",
    response_model=UsuarioAdminLeer,
    summary="Editar, desactivar o restablecer la clave de un usuario",
    description="Solo cambia los campos enviados. `activo: false` desactiva la cuenta sin "
    "borrarla: no puede iniciar sesión y sus sesiones abiertas dejan de valer, pero conserva la "
    "autoría de sus registros. El agrónomo no puede desactivarse ni quitarse el rol a sí mismo, y "
    "el predio siempre conserva al menos un agrónomo activo. Los campos no admiten `null`.",
    responses={**ERRORES_ACCESO, **ERROR_404, **ERROR_409},
)
async def actualizar_usuario(
    usuario_id: uuid.UUID, entrada: UsuarioActualizar, agronomo: AgronomoDep, session: SessionDep
) -> Usuario:
    usuario = await _obtener(session, usuario_id)
    cambios = entrada.model_dump(exclude_unset=True)
    quita_agronomo = usuario.rol == "agronomo" and (
        cambios.get("activo") is False or cambios.get("rol", "agronomo") != "agronomo"
    )
    if quita_agronomo and usuario.id == agronomo.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No puede desactivar su propia cuenta ni quitarse el rol de agrónomo",
        )
    if quita_agronomo and usuario.activo and await _agronomos_activos(session) <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El predio debe conservar al menos un agrónomo activo",
        )
    if (clave := cambios.pop("clave", None)) is not None:
        usuario.clave_hash = hashear_clave(clave)
    for campo, valor in cambios.items():
        setattr(usuario, campo, valor)
    return await _guardar(session, usuario)
