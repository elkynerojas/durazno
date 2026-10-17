import re
import uuid
from datetime import UTC, datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.acceso import ADMINISTRADOR, ROLES_GESTION, exigir_lote, exigir_predio
from app.api.deps import SessionDep, UsuarioActualDep, requiere_rol
from app.models.lote import Lote
from app.models.predio import Predio
from app.models.reemplazo_qr import ReemplazoQr
from app.models.trampa import Trampa
from app.models.usuario import Usuario
from app.schemas.geo import a_geometria
from app.schemas.trampa import (
    EstadoTrampa,
    ReemplazoQrCrear,
    ReemplazoQrLeer,
    TrampaActualizar,
    TrampaCrear,
    TrampaLeer,
    TrampaResuelta,
)
from app.services.etiquetas import Etiqueta, generar_pdf
from app.services.qr import ALFABETO, LONGITUD, generar_codigo, qr_png, qr_svg
from app.services.trampas import punto_en_lote

router = APIRouter(tags=["trampas"])

ZONA_PREDIO = ZoneInfo("America/Bogota")

GestionDep = Annotated[Usuario, Depends(requiere_rol(*ROLES_GESTION))]
# Reponer una etiqueta en campo (HU-17): técnico, agrónomo o administrador; el productor consulta.
ROLES_CAMPO = ("tecnico", "agronomo", ADMINISTRADOR)
CampoDep = Annotated[Usuario, Depends(requiere_rol(*ROLES_CAMPO))]

ERROR_401 = {401: {"description": "Sin sesión o sesión inválida"}}
ERROR_403 = {403: {"description": "Solo el agrónomo o el administrador gestionan las trampas"}}
ERROR_404 = {404: {"description": "Trampa o lote no encontrado (o de un predio no asignado)"}}
ERROR_409 = {409: {"description": "Código ICA repetido o `id` en uso"}}
ERROR_422 = {422: {"description": "Datos inválidos o punto fuera del polígono de su lote"}}

CODIGO_REPETIDO = "Ya existe una trampa con ese código ICA"
ID_EN_USO = "El id ya pertenece a otra trampa"
FUERA_DEL_LOTE = "La ubicación de la trampa debe quedar dentro del polígono de su lote"


async def _obtener(
    session: SessionDep,
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


async def _exigir_ubicacion(session: SessionDep, trampa: Trampa) -> None:
    if not await punto_en_lote(session, trampa.lote_id, trampa.geom):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=FUERA_DEL_LOTE
        )


async def _codigo_qr_libre(session: SessionDep) -> str:
    # 31^8 ≈ 8,5 × 10^11 combinaciones: un choque es casi imposible, pero se descarta igual.
    while True:
        codigo = generar_codigo()
        en_uso = await session.scalar(select(Trampa.id).where(Trampa.codigo_qr == codigo))
        # Los códigos de etiquetas reemplazadas tampoco se reutilizan.
        retirado = await session.scalar(
            select(ReemplazoQr.id).where(ReemplazoQr.codigo_anterior == codigo)
        )
        if en_uso is None and retirado is None:
            return codigo


async def _guardar(session: SessionDep, trampa: Trampa) -> Trampa:
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        restriccion = getattr(getattr(error.orig, "diag", None), "constraint_name", None)
        detalle = ID_EN_USO if restriccion == "pk_trampa" else CODIGO_REPETIDO
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detalle) from None
    await session.refresh(trampa)
    return trampa


@router.get(
    "/trampas",
    response_model=list[TrampaLeer],
    summary="Listar trampas",
    description="Trampas vigentes del predio ordenadas por código ICA. Filtros opcionales por "
    "lote y estado.",
    responses={**ERROR_401, 404: {"description": "Predio no encontrado o no asignado"}},
)
async def listar_trampas(
    predio_id: uuid.UUID,
    usuario: UsuarioActualDep,
    session: SessionDep,
    lote_id: uuid.UUID | None = None,
    estado: EstadoTrampa | None = None,
) -> list[Trampa]:
    await exigir_predio(session, usuario, predio_id)
    consulta = (
        select(Trampa)
        .join(Lote, Lote.id == Trampa.lote_id)
        .where(Lote.predio_id == predio_id, Trampa.deleted_at.is_(None))
    )
    if lote_id is not None:
        consulta = consulta.where(Trampa.lote_id == lote_id)
    if estado is not None:
        consulta = consulta.where(Trampa.estado == estado)
    return list(await session.scalars(consulta.order_by(Trampa.codigo_ica)))


@router.get(
    "/lotes/{lote_id}/trampas",
    response_model=list[TrampaLeer],
    summary="Listar las trampas de un lote",
    responses={**ERROR_401, 404: {"description": "Lote no encontrado"}},
)
async def listar_trampas_del_lote(
    lote_id: uuid.UUID, usuario: UsuarioActualDep, session: SessionDep
) -> list[Trampa]:
    await exigir_lote(session, usuario, lote_id)
    consulta = (
        select(Trampa)
        .where(Trampa.lote_id == lote_id, Trampa.deleted_at.is_(None))
        .order_by(Trampa.codigo_ica)
    )
    return list(await session.scalars(consulta))


@router.get(
    "/trampas/qr/{codigo}",
    response_model=TrampaResuelta,
    summary="Resolver el código QR de una trampa",
    description="Servicio que usa la app móvil al leer una etiqueta: recibe el código corto del "
    "QR (`<QR_URL_BASE>/t/<código>`, sin distinguir mayúsculas) y devuelve la trampa con su "
    "lote. Una trampa retirada se resuelve igual y lo indica en `trampa.estado`; una trampa "
    "eliminada ya no se resuelve.",
    responses={
        **ERROR_401,
        404: {"description": "No hay ninguna trampa con ese código QR"},
        410: {"description": "La etiqueta fue reemplazada por otra (HU-17)"},
    },
)
async def resolver_qr(codigo: str, usuario: UsuarioActualDep, session: SessionDep) -> dict:
    codigo = codigo.strip().upper()
    no_existe = HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"No hay ninguna trampa con el código QR {codigo[:LONGITUD]}",
    )
    # Un código mal formado no puede existir: se responde sin consultar la base.
    if len(codigo) != LONGITUD or any(c not in ALFABETO for c in codigo):
        raise no_existe
    fila = (
        await session.execute(
            select(Trampa, Lote)
            .join(Lote, Lote.id == Trampa.lote_id)
            .where(Trampa.codigo_qr == codigo, Trampa.deleted_at.is_(None))
        )
    ).first()
    if fila is None:
        reemplazo = (
            await session.execute(
                select(ReemplazoQr.created_at, Trampa.codigo_ica, Lote.predio_id)
                .join(Trampa, Trampa.id == ReemplazoQr.trampa_id)
                .join(Lote, Lote.id == Trampa.lote_id)
                .where(ReemplazoQr.codigo_anterior == codigo, Trampa.deleted_at.is_(None))
            )
        ).first()
        if reemplazo is not None:
            await exigir_predio(session, usuario, reemplazo[2], detalle_404=no_existe.detail)
            fecha = reemplazo[0].astimezone(ZONA_PREDIO).strftime("%d/%m/%Y")
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail=f"La etiqueta {codigo} fue reemplazada el {fecha}: use la etiqueta nueva "
                f"de la trampa {reemplazo[1]}.",
            )
        raise no_existe
    trampa, lote = fila
    # Un código de otro predio responde igual que uno inexistente.
    await exigir_predio(session, usuario, lote.predio_id, detalle_404=no_existe.detail)
    return {"trampa": trampa, "lote": lote}


@router.get(
    "/trampas/{trampa_id}",
    response_model=TrampaLeer,
    summary="Obtener una trampa",
    responses={**ERROR_401, **ERROR_404},
)
async def obtener_trampa(
    trampa_id: uuid.UUID, usuario: UsuarioActualDep, session: SessionDep
) -> Trampa:
    return await _obtener(session, usuario, trampa_id)


@router.post(
    "/trampas",
    response_model=TrampaLeer,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar una trampa",
    description="Ubica la trampa con un punto GeoJSON `[longitud, latitud]`, que debe quedar "
    "dentro del polígono de su lote (`ST_Contains`). El servidor le asigna `codigo_qr`. "
    "`precision_m` se envía cuando la "
    "coordenada viene del GPS. Reenviar el mismo `id` con el mismo código ICA devuelve la "
    "trampa existente con 200.",
    responses={
        200: {"description": "La trampa con ese `id` ya existía", "model": TrampaLeer},
        **ERROR_401,
        **ERROR_403,
        **ERROR_404,
        **ERROR_409,
        **ERROR_422,
    },
)
async def crear_trampa(
    entrada: TrampaCrear, usuario: GestionDep, session: SessionDep, response: Response
) -> Trampa:
    await exigir_lote(session, usuario, entrada.lote_id, escribir=True)
    if entrada.id is not None:
        existente = await session.get(Trampa, entrada.id)
        if existente is not None:
            if (
                existente.deleted_at is not None
                or existente.codigo_ica != entrada.codigo_ica
                or existente.lote_id != entrada.lote_id
            ):
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=ID_EN_USO)
            response.status_code = status.HTTP_200_OK
            return existente

    trampa = Trampa(
        **entrada.model_dump(exclude={"id", "geom"}),
        geom=a_geometria(entrada.geom),
        codigo_qr=await _codigo_qr_libre(session),
    )
    if entrada.id is not None:
        trampa.id = entrada.id
    await _exigir_ubicacion(session, trampa)
    session.add(trampa)
    return await _guardar(session, trampa)


@router.patch(
    "/trampas/{trampa_id}",
    response_model=TrampaLeer,
    summary="Editar o mover una trampa",
    description="Cambia solo los campos enviados. Mover la trampa (nuevo `geom` o `lote_id`) "
    "conserva su `id` y su historial de lecturas; la nueva ubicación debe quedar dentro del "
    "lote. Un `geom` nuevo sin `precision_m` borra la precisión anterior. Para retirarla del "
    "campo use `estado: retirada`.",
    responses={**ERROR_401, **ERROR_403, **ERROR_404, **ERROR_409, **ERROR_422},
)
async def actualizar_trampa(
    trampa_id: uuid.UUID, entrada: TrampaActualizar, usuario: GestionDep, session: SessionDep
) -> Trampa:
    trampa = await _obtener(session, usuario, trampa_id, escribir=True)
    cambios = entrada.model_dump(exclude_unset=True, exclude={"geom"})
    if "lote_id" in cambios and cambios["lote_id"] != trampa.lote_id:
        actual = await session.get(Lote, trampa.lote_id)
        nuevo = await exigir_lote(session, usuario, cambios["lote_id"], escribir=True)
        if nuevo.predio_id != actual.predio_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="La trampa solo puede moverse a otro lote del mismo predio",
            )
    for campo, valor in cambios.items():
        setattr(trampa, campo, valor)
    if entrada.geom is not None:
        trampa.geom = a_geometria(entrada.geom)
        # La precisión del GPS describe el punto anterior: sin una nueva, deja de aplicar.
        if "precision_m" not in cambios:
            trampa.precision_m = None
    if entrada.geom is not None or "lote_id" in cambios:
        await _exigir_ubicacion(session, trampa)
    return await _guardar(session, trampa)


@router.delete(
    "/trampas/{trampa_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar una trampa",
    description="Borrado lógico, para registros hechos por error. Una trampa que se quita del "
    "campo se marca `estado: retirada` y conserva su historial.",
    responses={**ERROR_401, **ERROR_403, **ERROR_404},
)
async def eliminar_trampa(trampa_id: uuid.UUID, usuario: GestionDep, session: SessionDep) -> None:
    trampa = await _obtener(session, usuario, trampa_id, escribir=True)
    trampa.deleted_at = datetime.now(UTC)
    await session.commit()


ERROR_QR = {**ERROR_401, 404: {"description": "Trampa no encontrada"}}


@router.get(
    "/trampas/{trampa_id}/qr.svg",
    summary="QR de la trampa en SVG",
    description="QR (corrección de errores nivel Q) que codifica solo la URL "
    "`<QR_URL_BASE>/t/<codigo_qr>`. Vectorial: ideal para imprimir etiquetas.",
    response_class=Response,
    responses={200: {"content": {"image/svg+xml": {}}}, **ERROR_QR},
)
async def descargar_qr_svg(
    trampa_id: uuid.UUID, usuario: UsuarioActualDep, session: SessionDep
) -> Response:
    trampa = await _obtener(session, usuario, trampa_id)
    return _archivo_qr(await run_in_threadpool(qr_svg, trampa.codigo_qr), trampa, "svg")


@router.get(
    "/trampas/{trampa_id}/qr.png",
    summary="QR de la trampa en PNG",
    description="El mismo QR que `qr.svg`, como imagen PNG.",
    response_class=Response,
    responses={200: {"content": {"image/png": {}}}, **ERROR_QR},
)
async def descargar_qr_png(
    trampa_id: uuid.UUID, usuario: UsuarioActualDep, session: SessionDep
) -> Response:
    trampa = await _obtener(session, usuario, trampa_id)
    return _archivo_qr(await run_in_threadpool(qr_png, trampa.codigo_qr), trampa, "png")


def _archivo_qr(contenido: bytes, trampa: Trampa, extension: str) -> Response:
    tipo = "image/svg+xml" if extension == "svg" else "image/png"
    # El nombre usa solo el código QR (alfabeto seguro), no el código ICA que escribe el usuario.
    nombre = f"qr-trampa-{trampa.codigo_qr}.{extension}"
    return Response(
        content=contenido,
        media_type=tipo,
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )


NOMBRES_TIPO = {"jackson": "Jackson", "mcphail": "McPhail"}


def _etiqueta(trampa: Trampa, lote_codigo: str) -> Etiqueta:
    return Etiqueta(
        codigo_ica=trampa.codigo_ica,
        codigo_qr=trampa.codigo_qr,
        lote=lote_codigo,
        tipo=f"{NOMBRES_TIPO[trampa.tipo]} + {trampa.atrayente.lower()}",
    )


@router.get(
    "/lotes/{lote_id}/etiquetas.pdf",
    summary="PDF de etiquetas QR de un lote",
    description="Hoja carta con 8 etiquetas por página (QR de 3,6 cm, código ICA, lote, tipo y "
    "código corto para escribirlo a mano), con márgenes para papel adhesivo y líneas de corte. "
    "Incluye las trampas activas e inactivas del lote, no las retiradas.",
    response_class=Response,
    responses={
        200: {"content": {"application/pdf": {}}},
        **ERROR_401,
        404: {"description": "Lote no encontrado"},
        409: {"description": "El lote no tiene trampas instaladas"},
    },
)
async def descargar_etiquetas(
    lote_id: uuid.UUID, usuario: UsuarioActualDep, session: SessionDep
) -> Response:
    lote = await exigir_lote(session, usuario, lote_id)
    trampas = list(
        await session.scalars(
            select(Trampa)
            .where(
                Trampa.lote_id == lote.id,
                Trampa.deleted_at.is_(None),
                Trampa.estado != "retirada",
            )
            .order_by(Trampa.codigo_ica)
        )
    )
    if not trampas:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"El lote {lote.codigo} no tiene trampas instaladas para imprimir",
        )
    predio = await session.scalar(select(Predio.nombre).where(Predio.id == lote.predio_id))
    etiquetas = [_etiqueta(t, lote.codigo) for t in trampas]
    pdf = await run_in_threadpool(generar_pdf, etiquetas, predio or "Predio", lote.codigo)
    # El código del lote lo escribe el usuario: solo caracteres seguros en el nombre del archivo.
    nombre = re.sub(r"[^A-Za-z0-9_-]", "_", lote.codigo)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="etiquetas-lote-{nombre}.pdf"'},
    )


@router.get(
    "/trampas/{trampa_id}/etiqueta.pdf",
    summary="Reimprimir la etiqueta de una trampa",
    description="PDF con la etiqueta de una sola trampa, con su código QR actual (no cambia).",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}, **ERROR_QR},
)
async def descargar_etiqueta(
    trampa_id: uuid.UUID, usuario: UsuarioActualDep, session: SessionDep
) -> Response:
    trampa = await _obtener(session, usuario, trampa_id)
    lote = await session.get(Lote, trampa.lote_id)
    predio = await session.scalar(select(Predio.nombre).where(Predio.id == lote.predio_id))
    pdf = await run_in_threadpool(
        generar_pdf, [_etiqueta(trampa, lote.codigo)], predio or "Predio", lote.codigo
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="etiqueta-{trampa.codigo_qr}.pdf"'},
    )


@router.post(
    "/trampas/{trampa_id}/qr/reemplazar",
    response_model=TrampaLeer,
    summary="Reemplazar la etiqueta QR de una trampa",
    description="Genera un código QR nuevo para la trampa e invalida el anterior: leerlo "
    "responde 410 con el aviso de reemplazo. El cambio queda en el historial. Reenviar el mismo "
    "`id` no genera otro código. Técnico o agrónomo.",
    responses={
        **ERROR_401,
        403: {"description": "El productor no reemplaza etiquetas"},
        404: {"description": "Trampa no encontrada"},
        409: {"description": "La trampa está retirada"},
    },
)
async def reemplazar_qr(
    trampa_id: uuid.UUID, entrada: ReemplazoQrCrear, usuario: CampoDep, session: SessionDep
) -> Trampa:
    trampa = await _obtener(session, usuario, trampa_id, escribir=True, roles_escritura=ROLES_CAMPO)
    if entrada.id is not None and await session.get(ReemplazoQr, entrada.id) is not None:
        return trampa
    if trampa.estado == "retirada":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La trampa está retirada: no necesita etiqueta nueva",
        )
    reemplazo = ReemplazoQr(
        trampa_id=trampa.id,
        codigo_anterior=trampa.codigo_qr,
        codigo_nuevo=await _codigo_qr_libre(session),
        motivo=entrada.motivo,
        usuario_id=usuario.id,
    )
    if entrada.id is not None:
        reemplazo.id = entrada.id
    trampa.codigo_qr = reemplazo.codigo_nuevo
    session.add(reemplazo)
    return await _guardar(session, trampa)


@router.get(
    "/trampas/{trampa_id}/qr/reemplazos",
    response_model=list[ReemplazoQrLeer],
    summary="Historial de reemplazos de la etiqueta",
    description="Reemplazos del código QR de la trampa, del más reciente al más antiguo.",
    responses={**ERROR_401, 404: {"description": "Trampa no encontrada"}},
)
async def listar_reemplazos_qr(
    trampa_id: uuid.UUID, usuario: UsuarioActualDep, session: SessionDep
) -> list[dict]:
    await _obtener(session, usuario, trampa_id)
    filas = await session.execute(
        select(ReemplazoQr, Usuario.nombre_completo)
        .join(Usuario, Usuario.id == ReemplazoQr.usuario_id)
        .where(ReemplazoQr.trampa_id == trampa_id, ReemplazoQr.deleted_at.is_(None))
        .order_by(ReemplazoQr.created_at.desc(), ReemplazoQr.id.desc())
    )
    return [
        {
            "id": r.id,
            "codigo_anterior": r.codigo_anterior,
            "codigo_nuevo": r.codigo_nuevo,
            "motivo": r.motivo,
            "responsable": nombre,
            "created_at": r.created_at,
        }
        for r, nombre in filas
    ]
