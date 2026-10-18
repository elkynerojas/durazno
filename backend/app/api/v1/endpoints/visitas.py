import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import Numeric, cast, func, select
from sqlalchemy.exc import IntegrityError

from app.api.acceso import ROLES_CAMPO, ROLES_GESTION, exigir_lote, exigir_trampa
from app.api.deps import SessionDep, UsuarioActualDep, requiere_rol
from app.models.lectura_trampa import LecturaTrampa
from app.models.lote import Lote
from app.models.trampa import Trampa
from app.models.usuario import Usuario
from app.models.visita import Visita
from app.schemas.geo import a_geometria
from app.schemas.lectura import LecturaCrear, LecturaLeer, LecturaResumen, PreparacionLectura
from app.services.lecturas import dias_exposicion, fecha_bogota, revision_anterior

router = APIRouter(prefix="/visitas", tags=["visitas"])

CampoDep = Annotated[Usuario, Depends(requiere_rol(*ROLES_CAMPO))]
ERROR_401 = {401: {"description": "Sin sesión o sesión inválida"}}
ERROR_403 = {403: {"description": "El productor no registra lecturas"}}
ERROR_404 = {404: {"description": "Trampa, lote o lectura no encontrada (o no asignada)"}}
ERROR_409 = {409: {"description": "El `id` ya se usó, o la trampa ya tiene lectura en esta visita"}}
ERROR_422 = {
    422: {
        "description": "Datos inválidos: fecha futura o anterior a la instalación, trampa no "
        "activa o días de exposición cambiados sin justificación"
    }
}
# Margen para relojes de teléfono un poco adelantados.
TOLERANCIA_FUTURO = timedelta(minutes=5)
# Máximo atraso al registrar (lecturas guardadas sin conexión, fase 2).
MAX_ATRASO = timedelta(days=30)


def ahora() -> datetime:
    return datetime.now(UTC)


def _no_valida(detalle: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=detalle)


def _consulta():
    return (
        select(LecturaTrampa, Trampa.codigo_ica, Lote.id, Lote.codigo, Usuario.nombre_completo)
        .join(Trampa, Trampa.id == LecturaTrampa.trampa_id)
        .join(Lote, Lote.id == Trampa.lote_id)
        .join(Usuario, Usuario.id == LecturaTrampa.responsable_id)
        .where(LecturaTrampa.deleted_at.is_(None))
    )


def _leer(usuario: Usuario, lectura, codigo_ica, lote_id, lote_codigo, responsable) -> LecturaLeer:
    """Lectura para el usuario. Datos personales (Ley 1581): la posición GPS del técnico solo la
    ven el agrónomo, el administrador y quien la registró; el productor no ve el responsable."""
    datos = {c: getattr(lectura, c) for c in LecturaLeer.model_fields if hasattr(lectura, c)}
    datos.update(
        trampa_codigo_ica=codigo_ica,
        lote_id=lote_id,
        lote_codigo=lote_codigo,
        responsable_nombre=responsable,
    )
    if usuario.rol not in ROLES_GESTION and lectura.responsable_id != usuario.id:
        datos.update(posicion=None, precision_m=None)
    if usuario.rol == "productor":
        datos.update(responsable_id=None, responsable_nombre=None)
    return LecturaLeer.model_validate(datos)


async def _leer_id(
    session: SessionDep, usuario: Usuario, lectura_id: uuid.UUID
) -> LecturaLeer | None:
    fila = (await session.execute(_consulta().where(LecturaTrampa.id == lectura_id))).first()
    return _leer(usuario, *fila) if fila else None


@router.get(
    "/lecturas/preparar",
    response_model=PreparacionLectura,
    summary="Datos para diligenciar una lectura",
    description="Revisión anterior de la trampa, días de exposición calculados hasta "
    "`observado_en` (por defecto, ahora) y la última lectura. Lo usa el formulario antes de "
    "registrar.",
    responses={**ERROR_401, **ERROR_404},
)
async def preparar_lectura(
    trampa_id: uuid.UUID,
    usuario: UsuarioActualDep,
    session: SessionDep,
    observado_en: datetime | None = None,
) -> PreparacionLectura:
    trampa = await exigir_trampa(session, usuario, trampa_id)
    momento = observado_en or ahora()
    referencia, anterior = await revision_anterior(session, trampa, momento)
    return PreparacionLectura(
        trampa_id=trampa.id,
        revision_anterior=referencia,
        dias_exposicion=dias_exposicion(fecha_bogota(momento), referencia),
        ultima_lectura=LecturaResumen.model_validate(anterior) if anterior else None,
    )


@router.post(
    "/lecturas",
    response_model=LecturaLeer,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar la lectura de una trampa",
    description="Formulario de la trampa en campo (una lectura por trampa y día, hasta 30 días "
    "atrás). El servidor calcula los días de exposición "
    "desde la lectura anterior (o la instalación); si se envían otros, exige justificación. "
    "Con `posicion` guarda la ubicación del dispositivo, su precisión y la distancia a la "
    "trampa. La lectura queda en la visita del técnico a ese lote ese día (se crea si no "
    "existe). Reenviar el mismo `id` devuelve la lectura existente con 200.",
    responses={
        200: {"description": "La lectura con ese `id` ya existía", "model": LecturaLeer},
        **ERROR_401,
        **ERROR_403,
        **ERROR_404,
        **ERROR_409,
        **ERROR_422,
    },
)
async def registrar_lectura(
    entrada: LecturaCrear, usuario: CampoDep, session: SessionDep, response: Response
) -> LecturaLeer:
    trampa = await exigir_trampa(
        session, usuario, entrada.trampa_id, escribir=True, roles_escritura=ROLES_CAMPO
    )
    if entrada.id is not None and (existente := await session.get(LecturaTrampa, entrada.id)):
        if (
            existente.deleted_at is not None
            or existente.trampa_id != trampa.id
            or existente.responsable_id != usuario.id
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="Ese id ya está en uso"
            )
        response.status_code = status.HTTP_200_OK
        return await _leer_id(session, usuario, existente.id)

    if trampa.estado != "activa":
        raise _no_valida(f"La trampa {trampa.codigo_ica} está {trampa.estado}: no admite lecturas")
    momento = ahora()
    if entrada.observado_en > momento + TOLERANCIA_FUTURO:
        raise _no_valida("La fecha de observación está en el futuro")
    if entrada.observado_en < momento - MAX_ATRASO:
        raise _no_valida(
            f"La lectura tiene más de {MAX_ATRASO.days} días: pida al agrónomo que la registre"
        )
    fecha = fecha_bogota(entrada.observado_en)
    if fecha < trampa.fecha_instalacion:
        raise _no_valida("La fecha de observación es anterior a la instalación de la trampa")

    referencia, _ = await revision_anterior(session, trampa, entrada.observado_en)
    calculados = dias_exposicion(fecha, referencia)
    dias = calculados if entrada.dias_exposicion is None else entrada.dias_exposicion
    if dias != calculados and entrada.justificacion_dias is None:
        raise _no_valida(
            f"Los días de exposición calculados son {calculados}: para usar {dias} "
            "escriba la justificación"
        )

    lote = await session.get(Lote, trampa.lote_id)
    visita = await session.scalar(
        select(Visita).where(
            Visita.tecnico_id == usuario.id,
            Visita.lote_id == lote.id,
            Visita.fecha == fecha,
            Visita.deleted_at.is_(None),
        )
    )
    # Una lectura por trampa y día (de cualquier técnico): no se duplican capturas en el MTD.
    if await session.scalar(
        select(LecturaTrampa.id).where(
            LecturaTrampa.trampa_id == trampa.id,
            LecturaTrampa.fecha == fecha,
            LecturaTrampa.deleted_at.is_(None),
            LecturaTrampa.estado != "rechazada",
        )
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya hay una lectura de {trampa.codigo_ica} del {fecha:%d/%m/%Y}",
        )
    if visita is None:
        visita = Visita(
            predio_id=lote.predio_id, lote_id=lote.id, tecnico_id=usuario.id, fecha=fecha
        )
        session.add(visita)
        await session.flush()

    lectura = LecturaTrampa(
        **entrada.model_dump(exclude={"id", "posicion", "dias_exposicion", "justificacion_dias"}),
        visita_id=visita.id,
        responsable_id=usuario.id,
        fecha=fecha,
        dias_exposicion=dias,
        dias_calculados=calculados,
        justificacion_dias=entrada.justificacion_dias if dias != calculados else None,
    )
    if entrada.id is not None:
        lectura.id = entrada.id
    if entrada.posicion is not None:
        lectura.posicion = a_geometria(entrada.posicion)
        punto = func.ST_GeomFromWKB(bytes(lectura.posicion.data), 4326)
        distancia = func.ST_Distance(func.Geography(punto), func.Geography(Trampa.geom))
        lectura.distancia_m = await session.scalar(
            select(func.round(cast(distancia, Numeric), 1)).where(Trampa.id == trampa.id)
        )
    session.add(lectura)
    try:
        await session.flush()
    except IntegrityError as error:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="La lectura ya estaba registrada"
        ) from error
    leida = await _leer_id(session, usuario, lectura.id)
    await session.commit()
    return leida


@router.get(
    "/lecturas",
    response_model=list[LecturaLeer],
    summary="Lecturas de una trampa o de un lote",
    description="Lecturas vigentes, de la más reciente a la más antigua (máximo `limite`). "
    "Cualquier rol con el predio asignado. El historial con filtros llega con HU-27.",
    responses={**ERROR_401, **ERROR_404, 422: {"description": "Falta `trampa_id` o `lote_id`"}},
)
async def listar_lecturas(
    usuario: UsuarioActualDep,
    session: SessionDep,
    trampa_id: uuid.UUID | None = None,
    lote_id: uuid.UUID | None = None,
    limite: Annotated[int, Query(ge=1, le=200)] = 50,
) -> list[LecturaLeer]:
    if trampa_id is not None:
        await exigir_trampa(session, usuario, trampa_id)
        condicion = LecturaTrampa.trampa_id == trampa_id
    elif lote_id is not None:
        await exigir_lote(session, usuario, lote_id)
        condicion = Trampa.lote_id == lote_id
    else:
        raise _no_valida("Indique la trampa (trampa_id) o el lote (lote_id)")
    filas = await session.execute(
        _consulta().where(condicion).order_by(LecturaTrampa.observado_en.desc()).limit(limite)
    )
    return [_leer(usuario, *fila) for fila in filas]


@router.get(
    "/lecturas/{lectura_id}",
    response_model=LecturaLeer,
    summary="Obtener una lectura",
    responses={**ERROR_401, **ERROR_404},
)
async def obtener_lectura(
    lectura_id: uuid.UUID, usuario: UsuarioActualDep, session: SessionDep
) -> LecturaLeer:
    lectura = await _leer_id(session, usuario, lectura_id)
    no_existe = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lectura no encontrada")
    if lectura is None:
        raise no_existe
    try:
        await exigir_trampa(session, usuario, lectura.trampa_id)
    except HTTPException as error:
        raise no_existe from error
    return lectura
