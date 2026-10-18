import uuid
from dataclasses import asdict
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.acceso import exigir_predio
from app.api.deps import SessionDep, UsuarioActualDep
from app.models.lectura_trampa import LecturaTrampa
from app.models.lote import Lote
from app.models.trampa import Trampa
from app.schemas.mtd import FilaMtdLeer, MtdPredio
from app.services.monitoreo import hoy_bogota
from app.services.mtd import Especie, LecturaMtd, mtd_por_semana, resumir

router = APIRouter(prefix="/mtd", tags=["mtd"])

# Semanas por defecto y rango máximo de una consulta.
SEMANAS_POR_DEFECTO = 12
MAX_DIAS = 3 * 366


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
    hasta = hasta or hoy_bogota()
    desde = desde or hasta - timedelta(weeks=SEMANAS_POR_DEFECTO) + timedelta(days=1)
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
    especies: list[Especie] = [especie] if especie else ["capitata", "anastrepha"]

    def leer(fila, por_semana: bool = True) -> FilaMtdLeer:
        datos = asdict(fila)
        if not por_semana:
            datos.update(anio=None, semana=None)
        return FilaMtdLeer(**datos)

    return MtdPredio(
        predio_id=predio_id,
        desde=desde,
        hasta=hasta,
        semanas=[leer(f) for f in mtd_por_semana(lecturas, desde, hasta, especies)],
        periodo=[leer(resumir(e, lecturas), por_semana=False) for e in especies],
    )
