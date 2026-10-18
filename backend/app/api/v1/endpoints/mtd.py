import uuid
from dataclasses import asdict
from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import Select, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.acceso import exigir_lote, exigir_predio, exigir_trampa
from app.api.deps import SessionDep, UsuarioActualDep
from app.models.lectura_trampa import LecturaTrampa
from app.models.lote import Lote
from app.models.trampa import Trampa
from app.models.usuario import Usuario
from app.schemas.mtd import FilaMtdLeer, Historial, LecturaHistorial, MtdPredio, PuntoSerie
from app.services import reporte_mtd
from app.services.historial import FilaHistorial, a_csv, mtd_de_la_lectura, nombre_archivo
from app.services.monitoreo import hoy_bogota
from app.services.mtd import (
    TRAMPA_DE,
    Especie,
    FilaMtd,
    LecturaMtd,
    mtd_por_semana,
    resumir,
)
from app.services.reporte_mtd import DatosReporte

router = APIRouter(prefix="/mtd", tags=["mtd"])
# Historial de capturas (HU-27): consulta del grupo MTD.
router_historial = APIRouter(prefix="/historial", tags=["mtd"])

ESPECIES: tuple[Especie, ...] = ("capitata", "anastrepha")
# Semanas por defecto y rango máximo de una consulta.
SEMANAS_POR_DEFECTO = 12
MAX_DIAS = 3 * 366


def _rango(desde: date | None, hasta: date | None) -> tuple[date, date]:
    hasta = hasta or hoy_bogota()
    desde = desde or hasta - timedelta(weeks=SEMANAS_POR_DEFECTO) + timedelta(days=1)
    _exigir_rango(desde, hasta)
    return desde, hasta


def _exigir_rango(desde: date, hasta: date) -> None:
    if desde > hasta:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="La fecha inicial es posterior a la final",
        )
    if (hasta - desde).days > MAX_DIAS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Consulte como máximo tres años",
        )


@router.get(
    "",
    response_model=MtdPredio,
    summary="Índice MTD del predio por especie y semana",
    description="MTD = M / (T × D) del Manual Técnico de Trampeo del ICA, consolidado a nivel "
    "de predio y separado por especie: *C. capitata* con las trampas Jackson y *Anastrepha* con "
    "las McPhail. M = moscas capturadas; T = trampas revisadas; D = días promedio de exposición "
    "por trampa revisada. Usa las lecturas vigentes no rechazadas (HU-26) entre `desde` y "
    "`hasta` (fechas de observación en America/Bogota; por defecto las últimas 12 semanas). "
    "Devuelve M, T y D de cada cálculo; si T × D = 0 el MTD es `null` (sin dato). Cualquier "
    "rol con el predio asignado.",
    responses={
        401: {"description": "Sin sesión o sesión inválida"},
        404: {"description": "Predio no encontrado (o no asignado al usuario)"},
        422: {"description": "Rango de fechas inválido (al revés o de más de tres años)"},
    },
)
async def obtener_mtd(
    predio_id: uuid.UUID,
    usuario: UsuarioActualDep,
    session: SessionDep,
    desde: date | None = None,
    hasta: date | None = None,
    especie: Especie | None = None,
) -> MtdPredio:
    await exigir_predio(session, usuario, predio_id)
    desde, hasta = _rango(desde, hasta)
    especies: list[Especie] = [especie] if especie else list(ESPECIES)
    semanas, periodo = await _calcular(session, predio_id, desde, hasta, especies)

    def leer(fila, por_semana: bool = True) -> FilaMtdLeer:
        datos = asdict(fila)
        if not por_semana:
            datos.update(anio=None, semana=None)
        return FilaMtdLeer(**datos)

    return MtdPredio(
        predio_id=predio_id,
        desde=desde,
        hasta=hasta,
        semanas=[leer(f) for f in semanas],
        periodo=[leer(f, por_semana=False) for f in periodo],
    )


async def _calcular(
    session: AsyncSession,
    predio_id: uuid.UUID,
    desde: date,
    hasta: date,
    especies: list[Especie],
) -> tuple[list[FilaMtd], list[FilaMtd]]:
    """Filas por especie y semana, y el consolidado del periodo, con las lecturas vigentes no
    rechazadas del predio."""
    filas = await session.execute(
        select(LecturaTrampa, Trampa.tipo)
        .join(Trampa, Trampa.id == LecturaTrampa.trampa_id)
        .join(Lote, Lote.id == Trampa.lote_id)
        .where(
            Lote.predio_id == predio_id,
            LecturaTrampa.fecha.between(desde, hasta),
            LecturaTrampa.deleted_at.is_(None),
            LecturaTrampa.estado != "rechazada",
            Trampa.deleted_at.is_(None),
            Lote.deleted_at.is_(None),
        )
    )
    lecturas = [
        LecturaMtd(
            trampa_id=lectura.trampa_id,
            tipo_trampa=tipo,
            fecha=lectura.fecha,
            capitata=lectura.capitata_machos + lectura.capitata_hembras,
            anastrepha=lectura.anastrepha,
            dias_exposicion=lectura.dias_exposicion,
            validada=lectura.estado == "validada",
        )
        for lectura, tipo in filas
    ]
    return (
        mtd_por_semana(lecturas, desde, hasta, especies),
        [resumir(e, lecturas) for e in especies],
    )


RESPUESTAS_REPORTE = {
    401: {"description": "Sin sesión o sesión inválida"},
    404: {"description": "Predio no encontrado (o no asignado al usuario)"},
    422: {"description": "Rango de fechas inválido (al revés o de más de tres años)"},
}
DESCRIPCION_REPORTE = (
    "Consolidado semanal del MTD del predio para entregar al ICA (HU-29), con el mismo cálculo "
    "de `GET /mtd` y las dos especies: por semana ISO, M, T, D, MTD y lecturas sin validar. "
    "Formato provisional hasta acordar el del convenio con el ICA. Sin datos personales. "
    "Cualquier rol con el predio asignado; por defecto, las últimas 12 semanas."
)


async def _reporte(
    session: AsyncSession,
    usuario: Usuario,
    predio_id: uuid.UUID,
    desde: date | None,
    hasta: date | None,
) -> tuple[DatosReporte, list[FilaMtd], list[FilaMtd]]:
    predio = await exigir_predio(session, usuario, predio_id)
    desde, hasta = _rango(desde, hasta)
    semanas, periodo = await _calcular(session, predio_id, desde, hasta, list(ESPECIES))
    datos = DatosReporte(
        predio=predio.nombre,
        registro_ica=predio.registro_ica,
        vereda=predio.vereda,
        municipio=predio.municipio,
        desde=desde,
        hasta=hasta,
        generado_en=datetime.now(UTC),
    )
    return datos, semanas, periodo


def _adjunto(contenido: bytes, tipo: str, nombre: str) -> Response:
    return Response(
        content=contenido,
        media_type=tipo,
        headers={"Content-Disposition": f'attachment; filename="{nombre}"'},
    )


@router.get(
    "/reporte.csv",
    summary="Reporte MTD para el ICA en CSV",
    description=DESCRIPCION_REPORTE + " Una fila por especie y semana; separador «;», coma "
    "decimal y BOM UTF-8 para abrirlo en Excel. El MTD va vacío cuando T × D = 0.",
    response_class=Response,
    responses={200: {"content": {"text/csv": {}}}, **RESPUESTAS_REPORTE},
)
async def reporte_csv(
    predio_id: uuid.UUID,
    usuario: UsuarioActualDep,
    session: SessionDep,
    desde: date | None = None,
    hasta: date | None = None,
) -> Response:
    datos, semanas, _ = await _reporte(session, usuario, predio_id, desde, hasta)
    return _adjunto(
        reporte_mtd.a_csv(datos, semanas).encode("utf-8"),
        "text/csv; charset=utf-8",
        reporte_mtd.nombre_archivo(datos.predio, datos.desde, datos.hasta, "csv"),
    )


@router.get(
    "/reporte.pdf",
    summary="Reporte MTD para el ICA en PDF",
    description=DESCRIPCION_REPORTE + " Encabezado del predio, consolidado del periodo y una "
    "tabla semanal por especie; las semanas sin lecturas dicen «sin dato».",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}, **RESPUESTAS_REPORTE},
)
async def reporte_pdf(
    predio_id: uuid.UUID,
    usuario: UsuarioActualDep,
    session: SessionDep,
    desde: date | None = None,
    hasta: date | None = None,
) -> Response:
    datos, semanas, periodo = await _reporte(session, usuario, predio_id, desde, hasta)
    # reportlab es síncrono y CPU: fuera del bucle de eventos.
    contenido = await run_in_threadpool(reporte_mtd.a_pdf, datos, semanas, periodo)
    return _adjunto(
        contenido,
        "application/pdf",
        reporte_mtd.nombre_archivo(datos.predio, datos.desde, datos.hasta, "pdf"),
    )


RESPUESTAS_HISTORIAL = {
    401: {"description": "Sin sesión o sesión inválida"},
    404: {"description": "Trampa, lote o predio no encontrado (o no asignado)"},
    422: {"description": "Falta el ámbito (trampa, lote o predio) o el rango es inválido"},
}
MAX_FILAS_CSV = 50_000


async def _historial(
    session: SessionDep,
    usuario,
    trampa_id: uuid.UUID | None,
    lote_id: uuid.UUID | None,
    predio_id: uuid.UUID | None,
    especie: Especie | None,
) -> tuple[Select, str]:
    """Consulta de las lecturas del ámbito (trampa, lote o predio) y su nombre para el archivo."""
    consulta = (
        select(LecturaTrampa, Trampa.codigo_ica, Trampa.tipo, Lote.id, Lote.codigo)
        .join(Trampa, Trampa.id == LecturaTrampa.trampa_id)
        .join(Lote, Lote.id == Trampa.lote_id)
        .where(
            LecturaTrampa.deleted_at.is_(None),
            LecturaTrampa.estado != "rechazada",
            Trampa.deleted_at.is_(None),
            Lote.deleted_at.is_(None),
        )
    )
    if trampa_id is not None:
        trampa = await exigir_trampa(session, usuario, trampa_id)
        consulta, ambito = consulta.where(Trampa.id == trampa.id), trampa.codigo_ica
    elif lote_id is not None:
        lote = await exigir_lote(session, usuario, lote_id)
        consulta, ambito = consulta.where(Lote.id == lote.id), f"lote-{lote.codigo}"
    elif predio_id is not None:
        predio = await exigir_predio(session, usuario, predio_id)
        consulta, ambito = consulta.where(Lote.predio_id == predio.id), predio.nombre
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Indique la trampa (trampa_id), el lote (lote_id) o el predio (predio_id)",
        )
    if especie is not None:
        consulta = consulta.where(Trampa.tipo == TRAMPA_DE[especie])
    return consulta, ambito


def _fila(lectura, codigo_ica: str, tipo: str) -> FilaHistorial:
    return FilaHistorial(
        observado_en=lectura.observado_en,
        lote_codigo="",
        trampa_codigo_ica=codigo_ica,
        tipo=tipo,
        capitata_machos=lectura.capitata_machos,
        capitata_hembras=lectura.capitata_hembras,
        anastrepha=lectura.anastrepha,
        dias_exposicion=lectura.dias_exposicion,
        estado=lectura.estado,
    )


@router_historial.get(
    "",
    response_model=Historial,
    summary="Historial de capturas de una trampa, un lote o el predio",
    description="Lecturas no rechazadas entre `desde` y `hasta` (por defecto las últimas 12 "
    "semanas), de la más reciente a la más antigua y paginadas, con el MTD de cada trampa y la "
    "serie de capturas por fecha para el gráfico. Con `especie`, solo las trampas que la "
    "vigilan (Jackson para *C. capitata*, McPhail para *Anastrepha*). Consulta: el MTD oficial "
    "se consolida a nivel de predio (`GET /mtd`).",
    responses=RESPUESTAS_HISTORIAL,
)
async def historial(
    usuario: UsuarioActualDep,
    session: SessionDep,
    trampa_id: uuid.UUID | None = None,
    lote_id: uuid.UUID | None = None,
    predio_id: uuid.UUID | None = None,
    desde: date | None = None,
    hasta: date | None = None,
    especie: Especie | None = None,
    pagina: Annotated[int, Query(ge=1)] = 1,
    por_pagina: Annotated[int, Query(ge=1, le=200)] = 50,
) -> Historial:
    desde, hasta = _rango(desde, hasta)
    consulta, _ = await _historial(session, usuario, trampa_id, lote_id, predio_id, especie)
    consulta = consulta.where(LecturaTrampa.fecha.between(desde, hasta))
    base = consulta.subquery()
    total = await session.scalar(select(func.count()).select_from(base))
    serie = await session.execute(
        select(
            base.c.fecha,
            func.sum(
                case(
                    (base.c.tipo == "jackson", base.c.capitata_machos + base.c.capitata_hembras),
                    else_=0,
                )
            ),
            func.sum(case((base.c.tipo == "mcphail", base.c.anastrepha), else_=0)),
            func.count(),
        )
        .group_by(base.c.fecha)
        .order_by(base.c.fecha)
    )
    filas = await session.execute(
        consulta.order_by(LecturaTrampa.observado_en.desc())
        .offset((pagina - 1) * por_pagina)
        .limit(por_pagina)
    )
    return Historial(
        desde=desde,
        hasta=hasta,
        total=total,
        pagina=pagina,
        por_pagina=por_pagina,
        serie=[
            PuntoSerie(fecha=fecha, capitata=capitata, anastrepha=anastrepha, lecturas=n)
            for fecha, capitata, anastrepha, n in serie
        ],
        lecturas=[
            LecturaHistorial(
                id=lectura.id,
                observado_en=lectura.observado_en,
                trampa_id=lectura.trampa_id,
                trampa_codigo_ica=codigo_ica,
                tipo=tipo,
                lote_id=lote_id_,
                lote_codigo=lote_codigo,
                capitata_machos=lectura.capitata_machos,
                capitata_hembras=lectura.capitata_hembras,
                anastrepha=lectura.anastrepha,
                dias_exposicion=lectura.dias_exposicion,
                estado=lectura.estado,
                mtd=mtd_de_la_lectura(_fila(lectura, codigo_ica, tipo)),
            )
            for lectura, codigo_ica, tipo, lote_id_, lote_codigo in filas
        ],
    )


@router_historial.get(
    ".csv",
    summary="Exportar el historial de capturas a CSV",
    description="Las mismas lecturas que `GET /historial` (sin paginar, de la más antigua a la "
    "más reciente; máximo 50 000) en CSV para Excel en español: separador «;», coma decimal y "
    "UTF-8 con BOM. No incluye datos personales del personal.",
    response_class=Response,
    responses={200: {"content": {"text/csv": {}}}, **RESPUESTAS_HISTORIAL},
)
async def historial_csv(
    usuario: UsuarioActualDep,
    session: SessionDep,
    trampa_id: uuid.UUID | None = None,
    lote_id: uuid.UUID | None = None,
    predio_id: uuid.UUID | None = None,
    desde: date | None = None,
    hasta: date | None = None,
    especie: Especie | None = None,
) -> Response:
    desde, hasta = _rango(desde, hasta)
    consulta, ambito = await _historial(session, usuario, trampa_id, lote_id, predio_id, especie)
    filas = await session.execute(
        consulta.where(LecturaTrampa.fecha.between(desde, hasta))
        .order_by(LecturaTrampa.observado_en)
        .limit(MAX_FILAS_CSV)
    )
    contenido = a_csv(
        FilaHistorial(
            observado_en=lectura.observado_en,
            lote_codigo=lote_codigo,
            trampa_codigo_ica=codigo_ica,
            tipo=tipo,
            capitata_machos=lectura.capitata_machos,
            capitata_hembras=lectura.capitata_hembras,
            anastrepha=lectura.anastrepha,
            dias_exposicion=lectura.dias_exposicion,
            estado=lectura.estado,
        )
        for lectura, codigo_ica, tipo, _, lote_codigo in filas
    )
    return Response(
        content=contenido.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{nombre_archivo(ambito, desde, hasta)}"'
        },
    )
