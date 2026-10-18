import asyncio
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select

from app.api.deps import SessionDep, UsuarioActualDep, cargar_usuario_activo
from app.core.config import get_settings
from app.models.usuario import Usuario
from app.schemas.auth import RenovarEntrada, Token, UsuarioLeer
from app.services.auth import (
    HASH_FICTICIO,
    crear_token,
    crear_token_renovacion,
    decodificar_renovacion,
    verificar_clave,
)
from app.services.intentos import LimiteIntentos

router = APIRouter(prefix="/auth", tags=["auth"])

ERROR_401 = {401: {"description": "Credenciales o sesión inválidas"}}
ERROR_429 = {429: {"description": "Demasiados intentos fallidos; ver encabezado `Retry-After`"}}

MAX_CORREO = 254
MAX_CLAVE = 128

# Fallos por correo e IP: quien adivina desde una red no bloquea al dueño de la cuenta, que entra
# desde otra. `limite_cuenta` frena además un ataque repartido entre muchas IP contra un correo.
limite_intentos = LimiteIntentos(
    maximo=get_settings().intentos_maximos,
    ventana_s=get_settings().intentos_ventana_minutos * 60,
)
limite_cuenta = LimiteIntentos(
    maximo=get_settings().intentos_maximos * 4,
    ventana_s=get_settings().intentos_ventana_minutos * 60,
)


COOKIE_RENOVACION = "icota_renovacion"
RUTA_COOKIE = f"{get_settings().api_v1_prefix}/auth"
# Cabecera con la que un cliente nativo (app móvil, fase 2) pide el token de renovación en el
# cuerpo: no tiene cookies y lo guarda en el almacenamiento seguro del teléfono.
ClienteDep = Annotated[
    str | None,
    Header(
        alias="X-Cliente",
        description="`movil` para recibir el token de renovación en el cuerpo y no en cookie",
    ),
]
CookieRenovacionDep = Annotated[str | None, Cookie(alias=COOKIE_RENOVACION)]


def _emitir_tokens(
    usuario: Usuario, respuesta: Response, cliente: str | None, inicio: datetime | None = None
) -> Token:
    settings = get_settings()
    renovacion = crear_token_renovacion(usuario.id, inicio=inicio)
    token = Token(
        access_token=crear_token(usuario.id, usuario.rol),
        expires_in=settings.token_minutos * 60,
    )
    if cliente == "movil":
        token.refresh_token = renovacion
        return token
    # Navegador: la renovación nunca queda al alcance de JavaScript (XSS) ni sale del sitio.
    respuesta.set_cookie(
        COOKIE_RENOVACION,
        renovacion,
        max_age=settings.renovacion_dias * 86400,
        path=RUTA_COOKIE,
        httponly=True,
        secure=settings.cookie_segura,
        samesite="strict",
    )
    return token


@router.post(
    "/token",
    response_model=Token,
    summary="Iniciar sesión",
    description="Recibe el correo en `username` y la contraseña en `password` como formulario "
    "(OAuth2). Devuelve un token de acceso Bearer de corta duración para el encabezado "
    "`Authorization`. El token de renovación para `POST /auth/renovar` va en la cookie "
    "`HttpOnly` `icota_renovacion`, o en el cuerpo si se envía `X-Cliente: movil`.",
    responses={**ERROR_401, **ERROR_429},
)
async def iniciar_sesion(
    formulario: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: SessionDep,
    peticion: Request,
    respuesta: Response,
    cliente: ClienteDep = None,
) -> Token:
    correo = formulario.username.strip().lower()
    no_autorizado = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Correo o contraseña incorrectos",
        headers={"WWW-Authenticate": "Bearer"},
    )
    # Ningún usuario válido supera estas longitudes; se rechaza sin tocar el límite ni Argon2.
    if len(correo) > MAX_CORREO or len(formulario.password) > MAX_CLAVE:
        raise no_autorizado
    # La IP real llega del Nginx (la API solo confía en sus cabeceras X-Forwarded-For).
    clave_ip = f"{correo}|{peticion.client.host if peticion.client else ''}"
    espera = max(limite_intentos.segundos_bloqueo(clave_ip), limite_cuenta.segundos_bloqueo(correo))
    if espera:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos. Intente de nuevo en unos minutos.",
            headers={"Retry-After": str(espera)},
        )
    # El intento se cuenta antes de cualquier await para que una ráfaga concurrente no pase
    # completa la comprobación; si resulta correcto, se reinicia abajo.
    limite_intentos.registrar_fallo(clave_ip)
    limite_cuenta.registrar_fallo(correo)
    usuario = await session.scalar(
        select(Usuario).where(Usuario.correo == correo, Usuario.deleted_at.is_(None))
    )
    clave_hash = HASH_FICTICIO if usuario is None else usuario.clave_hash
    clave_correcta = await asyncio.to_thread(verificar_clave, formulario.password, clave_hash)
    if usuario is None or not clave_correcta or not usuario.activo:
        raise no_autorizado
    limite_intentos.reiniciar(clave_ip)
    limite_cuenta.reiniciar(correo)
    return _emitir_tokens(usuario, respuesta, cliente)


@router.post(
    "/renovar",
    response_model=Token,
    summary="Renovar la sesión",
    description="Cambia un token de renovación vigente (cookie `icota_renovacion` o, para "
    "clientes nativos, `refresh_token` en el cuerpo) por un token de acceso nuevo y rota el de "
    "renovación. Falla si el usuario fue desactivado o eliminado, si su sesión fue revocada "
    "(cambio de clave, rol o estado) o si pasaron más de `SESION_MAX_DIAS` desde el inicio.",
    responses=ERROR_401,
)
async def renovar(
    session: SessionDep,
    respuesta: Response,
    entrada: RenovarEntrada | None = None,
    cookie: CookieRenovacionDep = None,
    cliente: ClienteDep = None,
) -> Token:
    # Cada tipo de cliente usa solo su canal: un script en el navegador que agregue
    # `X-Cliente: movil` no puede cambiar la cookie HttpOnly por un token legible en el cuerpo.
    cuerpo = entrada.refresh_token if entrada else None
    recibido = cuerpo if cliente == "movil" else cookie
    renovacion = decodificar_renovacion(recibido or "")
    token, inicio = renovacion if renovacion else (None, None)
    usuario = await cargar_usuario_activo(session, token)
    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sesión inválida o expirada",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _emitir_tokens(usuario, respuesta, cliente, inicio)


@router.post(
    "/salir",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cerrar la sesión en este navegador",
    description="Borra la cookie de renovación. El token de acceso vence solo en minutos; para "
    "invalidar todas las sesiones de una cuenta, el agrónomo cambia su clave.",
)
async def salir(respuesta: Response) -> None:
    respuesta.delete_cookie(
        COOKIE_RENOVACION,
        path=RUTA_COOKIE,
        httponly=True,
        secure=get_settings().cookie_segura,
        samesite="strict",
    )


@router.get(
    "/yo",
    response_model=UsuarioLeer,
    summary="Usuario de la sesión actual",
    description="Identidad y rol de quien envía el token; la app lo usa al abrir para saber qué "
    "menús mostrar.",
    responses=ERROR_401,
)
async def yo(usuario: UsuarioActualDep) -> Usuario:
    return usuario
