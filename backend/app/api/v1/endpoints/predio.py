from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.deps import SessionDep, UsuarioActualDep, requiere_rol
from app.models.predio import Predio
from app.models.usuario import Usuario
from app.schemas.geo import a_geometria
from app.schemas.predio import PredioGuardar, PredioLeer
from app.services.geo import motivo_invalidez

router = APIRouter(prefix="/predio", tags=["predio"])

AgronomoDep = Annotated[Usuario, Depends(requiere_rol("agronomo"))]

ERROR_401 = {401: {"description": "Sin sesión o sesión inválida"}}
PREDIO_YA_REGISTRADO = "Ya hay un predio registrado; esta versión admite uno solo"


async def _predio_actual(session: SessionDep) -> Predio | None:
    return await session.scalar(select(Predio).where(Predio.deleted_at.is_(None)))


@router.get(
    "",
    response_model=PredioLeer,
    summary="Obtener el predio",
    description="Datos del único predio registrado, con su límite en GeoJSON si lo tiene.",
    responses={**ERROR_401, 404: {"description": "El predio aún no se ha registrado"}},
)
async def obtener_predio(_usuario: UsuarioActualDep, session: SessionDep) -> Predio:
    predio = await _predio_actual(session)
    if predio is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="El predio aún no se ha registrado"
        )
    return predio


@router.put(
    "",
    response_model=PredioLeer,
    summary="Registrar o actualizar el predio",
    description="Registra el predio si aún no existe (201) o reemplaza sus datos (200). "
    "Es idempotente: reenviar los mismos datos deja el predio igual. El `limite` es opcional y "
    "debe ser un polígono válido (sin bordes que se crucen).",
    responses={
        201: {"description": "Predio registrado", "model": PredioLeer},
        **ERROR_401,
        403: {"description": "Solo el agrónomo registra el predio"},
        409: {"description": "El `id` enviado no corresponde al predio registrado"},
        422: {"description": "Datos o polígono inválidos"},
    },
)
async def guardar_predio(
    entrada: PredioGuardar, _agronomo: AgronomoDep, session: SessionDep, response: Response
) -> Predio:
    limite = a_geometria(entrada.limite) if entrada.limite else None
    if limite is not None and (motivo := await motivo_invalidez(session, limite)):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=motivo)

    predio = await _predio_actual(session)
    if predio is None:
        predio = Predio()
        if entrada.id is not None:
            predio.id = entrada.id
        session.add(predio)
        response.status_code = status.HTTP_201_CREATED
    elif entrada.id is not None and entrada.id != predio.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=PREDIO_YA_REGISTRADO)

    for campo, valor in entrada.model_dump(exclude={"id", "limite"}).items():
        setattr(predio, campo, valor)
    predio.limite = limite
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=PREDIO_YA_REGISTRADO
        ) from None
    await session.refresh(predio)
    return predio
