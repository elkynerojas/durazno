import asyncio
import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.acceso import ADMINISTRADOR
from app.api.deps import SessionDep, requiere_rol
from app.api.v1.endpoints.auth import limite_intentos
from app.models.predio import Predio
from app.models.predio_usuario import PredioUsuario
from app.models.usuario import Usuario
from app.schemas.usuario import UsuarioActualizar, UsuarioAdminLeer, UsuarioCrear
from app.services.auth import hashear_clave, verificar_clave
from app.services.claves import motivo_clave_debil

router = APIRouter(prefix="/usuarios", tags=["usuarios"])

AdministradorDep = Annotated[Usuario, Depends(requiere_rol(ADMINISTRADOR))]

ERRORES_ACCESO = {
    401: {"description": "Sin sesión o sesión inválida"},
    403: {"description": "Solo el administrador gestiona las cuentas"},
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


def _exigir_clave_fuerte(clave: str, correo: str) -> None:
    if motivo := motivo_clave_debil(clave, correo):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=motivo)


async def _administradores_activos(session: SessionDep) -> int:
    # FOR UPDATE serializa los cambios simultáneos entre administradores: el segundo espera al
    # primero y vuelve a contar sin la cuenta ya desactivada.
    ids = await session.scalars(
        select(Usuario.id)
        .where(Usuario.rol == ADMINISTRADOR, Usuario.activo.is_(True), Usuario.deleted_at.is_(None))
        .with_for_update()
    )
    return len(ids.all())


async def _con_predios(session: SessionDep, usuarios: list[Usuario]) -> list[UsuarioAdminLeer]:
    """Cada cuenta con los nombres de sus predios asignados."""
    filas = await session.execute(
        select(PredioUsuario.usuario_id, Predio.nombre)
        .join(Predio, Predio.id == PredioUsuario.predio_id)
        .where(
            PredioUsuario.usuario_id.in_([u.id for u in usuarios]),
            PredioUsuario.deleted_at.is_(None),
            Predio.deleted_at.is_(None),
        )
        .order_by(Predio.nombre)
    )
    predios: dict[uuid.UUID, list[str]] = {}
    for usuario_id, nombre in filas:
        predios.setdefault(usuario_id, []).append(nombre)
    return [
        UsuarioAdminLeer.model_validate(u).model_copy(update={"predios": predios.get(u.id, [])})
        for u in usuarios
    ]


@router.get(
    "",
    response_model=list[UsuarioAdminLeer],
    summary="Listar usuarios",
    description="Cuentas del predio ordenadas por nombre. `activo` filtra activas o inactivas.",
    responses=ERRORES_ACCESO,
)
async def listar_usuarios(
    _admin: AdministradorDep, session: SessionDep, activo: bool | None = None
) -> list[dict]:
    consulta = select(Usuario).where(Usuario.deleted_at.is_(None))
    if activo is not None:
        consulta = consulta.where(Usuario.activo.is_(activo))
    return await _con_predios(
        session, list(await session.scalars(consulta.order_by(Usuario.nombre_completo)))
    )


@router.get(
    "/{usuario_id}",
    response_model=UsuarioAdminLeer,
    summary="Obtener un usuario",
    description="Datos de la cuenta y sus predios asignados (datos personales: Ley 1581). Una "
    "cuenta borrada responde 404.",
    responses={**ERRORES_ACCESO, **ERROR_404},
)
async def obtener_usuario(
    usuario_id: uuid.UUID, _admin: AdministradorDep, session: SessionDep
) -> dict:
    return (await _con_predios(session, [await _obtener(session, usuario_id)]))[0]


@router.post(
    "",
    response_model=UsuarioAdminLeer,
    status_code=status.HTTP_201_CREATED,
    summary="Crear un usuario",
    description="Crea la cuenta con la contraseña inicial que define el administrador. Si se "
    "envía un "
    "`id` que ya existe con el mismo correo y rol, devuelve esa cuenta con 200 sin duplicarla; "
    "con otros datos o si la cuenta fue eliminada, responde 409.",
    responses={
        200: {"description": "La cuenta con ese `id` ya existía", "model": UsuarioAdminLeer},
        **ERRORES_ACCESO,
        **ERROR_409,
    },
)
async def crear_usuario(
    entrada: UsuarioCrear, _admin: AdministradorDep, session: SessionDep, response: Response
) -> dict:
    if entrada.id is not None:
        existente = await session.get(Usuario, entrada.id)
        if existente is not None:
            if existente.deleted_at is not None or (existente.correo, existente.rol) != (
                entrada.correo,
                entrada.rol,
            ):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ID_EN_USO)
            response.status_code = status.HTTP_200_OK
            return (await _con_predios(session, [existente]))[0]
    _exigir_clave_fuerte(entrada.clave, entrada.correo)
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
    return (await _con_predios(session, [await _guardar(session, usuario)]))[0]


@router.patch(
    "/{usuario_id}",
    response_model=UsuarioAdminLeer,
    summary="Editar, desactivar o restablecer la clave de un usuario",
    description="Solo cambia los campos enviados. `activo: false` desactiva la cuenta sin "
    "borrarla: no puede iniciar sesión y sus sesiones abiertas dejan de valer, pero conserva la "
    "autoría de sus registros. El administrador no puede desactivarse ni quitarse el rol a sí "
    "mismo, y el sistema conserva al menos un administrador activo. Cambiar la clave, el rol o el "
    "estado cierra las sesiones abiertas de la cuenta; para cambiar la propia clave se exige "
    "`clave_actual`. Se rechazan claves triviales. Los campos no admiten `null`.",
    responses={
        **ERRORES_ACCESO,
        **ERROR_404,
        **ERROR_409,
        422: {"description": "Datos inválidos o contraseña trivial"},
        429: {"description": "Demasiados intentos con la contraseña actual"},
    },
)
async def actualizar_usuario(
    usuario_id: uuid.UUID, entrada: UsuarioActualizar, admin: AdministradorDep, session: SessionDep
) -> dict:
    usuario = await _obtener(session, usuario_id)
    cambios = entrada.model_dump(exclude_unset=True)
    quita_admin = usuario.rol == ADMINISTRADOR and (
        cambios.get("activo") is False or cambios.get("rol", ADMINISTRADOR) != ADMINISTRADOR
    )
    if quita_admin and usuario.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No puede desactivar su propia cuenta ni quitarse el rol de administrador",
        )
    if quita_admin and usuario.activo and await _administradores_activos(session) <= 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El sistema debe conservar al menos un administrador activo",
        )
    clave_actual = cambios.pop("clave_actual", None)
    if (clave := cambios.pop("clave", None)) is not None:
        if usuario.id == admin.id:
            # Una sesión abierta ajena no basta para quedarse con la cuenta del administrador, ni
            # para adivinar su clave: los fallos cuentan en el mismo límite del inicio de sesión.
            clave_limite = f"clave_actual:{usuario.id}"
            if espera := limite_intentos.segundos_bloqueo(clave_limite):
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Demasiados intentos. Intente de nuevo en unos minutos.",
                    headers={"Retry-After": str(espera)},
                )
            limite_intentos.registrar_fallo(clave_limite)
            correcta = clave_actual is not None and await asyncio.to_thread(
                verificar_clave, clave_actual, usuario.clave_hash
            )
            if not correcta:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Para cambiar su propia contraseña escriba la contraseña actual",
                )
            limite_intentos.reiniciar(clave_limite)
        _exigir_clave_fuerte(clave, cambios.get("correo", usuario.correo))
        usuario.clave_hash = hashear_clave(clave)
    # Cambiar la clave, el rol o el estado cierra todas las sesiones abiertas de la cuenta
    # (incluida la del propio administrador si cambia su clave).
    if clave is not None or any(
        campo in cambios and cambios[campo] != getattr(usuario, campo)
        for campo in ("rol", "activo")
    ):
        usuario.sesion_valida_desde = datetime.now(UTC)
    for campo, valor in cambios.items():
        setattr(usuario, campo, valor)
    return (await _con_predios(session, [await _guardar(session, usuario)]))[0]
