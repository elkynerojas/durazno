"""Sincronización con la app móvil (HU-32): lo que cambió desde la última vez y las lecturas que
se tomaron sin conexión, en bloque."""

import uuid
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import AwareDatetime
from sqlalchemy import ColumnElement, and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.acceso import ADMINISTRADOR, ROLES_CAMPO
from app.api.deps import SessionDep, UsuarioActualDep, requiere_rol
from app.api.v1.endpoints.plan import leer_actividades, para_usuario
from app.api.v1.endpoints.rutas import leer_ruta
from app.api.v1.endpoints.visitas import (
    consulta_lecturas,
    crear_lectura,
    leer_lectura,
    leer_lectura_id,
)
from app.models.lectura_trampa import LecturaTrampa
from app.models.lote import Lote
from app.models.plan_actividad import PlanActividad
from app.models.predio import Predio
from app.models.predio_usuario import PredioUsuario
from app.models.ruta import Ruta
from app.models.trampa import Trampa
from app.models.usuario import Usuario
from app.schemas.lectura import LecturaLeer
from app.schemas.lote import LoteLeer
from app.schemas.plan import ActividadLeer
from app.schemas.predio import PredioLeer
from app.schemas.ruta import RutaLeer
from app.schemas.sync import (
    Cambios,
    CambiosEntidad,
    LecturasBloque,
    ResultadoBloque,
    ResultadoLectura,
)
from app.schemas.trampa import TrampaLeer
from app.services.monitoreo import hoy_bogota
from app.services.sync import DIAS_LECTURAS, clasificar, siguiente_desde

router = APIRouter(prefix="/sync", tags=["sync"])

CampoDep = Annotated[Usuario, Depends(requiere_rol(*ROLES_CAMPO))]
ERROR_401 = {401: {"description": "Sin sesión o sesión inválida"}}


@dataclass
class Alcance:
    """Predios que el usuario ve hoy. Los recién asignados (o todos, sin `desde`) viajan
    completos; los demás, solo con lo que cambió desde `desde`."""

    desde: datetime | None
    completos: set[uuid.UUID] = field(default_factory=set)
    incrementales: set[uuid.UUID] = field(default_factory=set)
    # Predios que el cliente debe descartar con todo su contenido: borrados o desasignados.
    retirados: set[uuid.UUID] = field(default_factory=set)

    def filtro(
        self, predio: Any, actualizado: Any, borrado: Any, *extra: ColumnElement[bool]
    ) -> ColumnElement[bool]:
        condiciones = [and_(predio.in_(self.completos), borrado.is_(None))]
        if self.incrementales:
            condiciones.append(
                and_(
                    predio.in_(self.incrementales),
                    or_(actualizado > self.desde, borrado > self.desde),
                )
            )
        return or_(*condiciones, *extra)

    def desde_de(self, predio_id: uuid.UUID) -> datetime | None:
        return None if predio_id in self.completos else self.desde


async def _alcance(session: AsyncSession, usuario: Usuario, desde: datetime | None) -> Alcance:
    alcance = Alcance(desde=desde)
    if usuario.rol == ADMINISTRADOR:
        for predio_id, borrado in await session.execute(select(Predio.id, Predio.deleted_at)):
            if borrado is None:
                (alcance.incrementales if desde else alcance.completos).add(predio_id)
            elif desde is not None and borrado > desde:
                alcance.retirados.add(predio_id)
        return alcance
    filas = await session.execute(
        select(PredioUsuario.predio_id, PredioUsuario.created_at, PredioUsuario.deleted_at)
        .join(Predio, Predio.id == PredioUsuario.predio_id)
        .where(PredioUsuario.usuario_id == usuario.id)
        .add_columns(Predio.deleted_at)
    )
    vistos: set[uuid.UUID] = set()
    for predio_id, asignado_en, desasignado_en, predio_borrado in filas:
        if desasignado_en is None and predio_borrado is None:
            vistos.add(predio_id)
            # Recién asignado: el cliente no tiene nada de este predio.
            nuevo = desde is None or asignado_en > desde
            (alcance.completos if nuevo else alcance.incrementales).add(predio_id)
        elif desde is not None and max(desasignado_en or desde, predio_borrado or desde) > desde:
            alcance.retirados.add(predio_id)
    alcance.retirados -= vistos
    alcance.incrementales -= alcance.completos
    return alcance


def _repartir[T](
    filas: Iterable[tuple[T, uuid.UUID, datetime, datetime | None, uuid.UUID]], alcance: Alcance
) -> tuple[list[T], list[T], list[uuid.UUID]]:
    """Separa (objeto, id, creado, borrado, predio) en creados, modificados e ids borrados."""
    creados, modificados, borrados = [], [], []
    for objeto, id_, creado, borrado, predio_id in filas:
        clase = clasificar(creado, borrado, alcance.desde_de(predio_id))
        if clase == "creado":
            creados.append(objeto)
        elif clase == "modificado":
            modificados.append(objeto)
        elif clase == "borrado":
            borrados.append(id_)
    return creados, modificados, borrados


@router.get(
    "/cambios",
    response_model=Cambios,
    summary="Cambios desde la última sincronización",
    description="Lo que la app debe guardar para trabajar sin conexión, por entidad: predios, "
    "lotes, trampas, rutas, actividades del plan (del año en curso en adelante) y lecturas (de "
    f"los últimos {DIAS_LECTURAS} días). Cada entidad trae `creados`, `modificados` (mismos "
    "esquemas de sus endpoints) y los ids `borrados`. Sin `desde` es la carga completa (sin "
    "borrados). Un predio en `borrados` (borrado o desasignado) se descarta con todo su "
    "contenido; lo mismo un lote con sus trampas, ruta y actividades. Un predio recién asignado "
    "llega completo en `creados`. Las actividades de la semana en curso vienen siempre, porque "
    "su estado y avance se calculan con las lecturas. Para la siguiente vez use "
    "`siguiente_desde`. Los datos personales siguen las mismas reglas de cada endpoint "
    "(Ley 1581). Cualquier rol.",
    responses={
        **ERROR_401,
        422: {"description": "`desde` sin zona horaria o en el futuro"},
    },
)
async def cambios(
    usuario: UsuarioActualDep, session: SessionDep, desde: AwareDatetime | None = None
) -> Cambios:
    servidor_en = await session.scalar(select(func.now()))
    if desde is not None and desde > servidor_en:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="`desde` está en el futuro: use el `siguiente_desde` de la sincronización",
        )
    alcance = await _alcance(session, usuario, desde)

    predios = await session.execute(
        select(Predio, Predio.id, Predio.created_at, Predio.deleted_at, Predio.id).where(
            alcance.filtro(Predio.id, Predio.updated_at, Predio.deleted_at)
        )
    )
    p_creados, p_modificados, _ = _repartir(predios, alcance)

    lotes = await session.execute(
        select(Lote, Lote.id, Lote.created_at, Lote.deleted_at, Lote.predio_id)
        .where(alcance.filtro(Lote.predio_id, Lote.updated_at, Lote.deleted_at))
        .order_by(Lote.codigo)
    )
    l_creados, l_modificados, l_borrados = _repartir(lotes, alcance)

    trampas = await session.execute(
        select(Trampa, Trampa.id, Trampa.created_at, Trampa.deleted_at, Lote.predio_id)
        .join(Lote, Lote.id == Trampa.lote_id)
        .where(
            alcance.filtro(Lote.predio_id, Trampa.updated_at, Trampa.deleted_at),
            or_(Lote.deleted_at.is_(None), Trampa.deleted_at.is_not(None)),
        )
        .order_by(Trampa.codigo_ica)
    )
    t_creados, t_modificados, t_borrados = _repartir(trampas, alcance)

    rutas = await session.execute(
        select(Ruta, Ruta.id, Ruta.created_at, Ruta.deleted_at, Lote.predio_id)
        .join(Lote, Lote.id == Ruta.lote_id)
        .where(
            alcance.filtro(Lote.predio_id, Ruta.updated_at, Ruta.deleted_at),
            or_(Lote.deleted_at.is_(None), Ruta.deleted_at.is_not(None)),
        )
    )
    r_creados, r_modificados, r_borrados = _repartir(rutas, alcance)

    hoy = hoy_bogota().isocalendar()
    visibles = alcance.completos | alcance.incrementales
    actividades = await session.execute(
        select(
            PlanActividad.id,
            PlanActividad.id,
            PlanActividad.created_at,
            PlanActividad.deleted_at,
            PlanActividad.predio_id,
        )
        .join(Lote, Lote.id == PlanActividad.lote_id)
        .where(
            PlanActividad.anio >= hoy.year,
            alcance.filtro(
                PlanActividad.predio_id,
                PlanActividad.updated_at,
                PlanActividad.deleted_at,
                # La semana en curso siempre: su estado calculado cambia con las lecturas.
                and_(
                    PlanActividad.predio_id.in_(visibles),
                    PlanActividad.anio == hoy.year,
                    PlanActividad.semana == hoy.week,
                    PlanActividad.deleted_at.is_(None),
                ),
            ),
            or_(Lote.deleted_at.is_(None), PlanActividad.deleted_at.is_not(None)),
        )
    )
    a_creados, a_modificados, a_borrados = _repartir(actividades, alcance)
    actividades_leidas = await leer_actividades(session, [*a_creados, *a_modificados])
    leidas = {a.id: a for a in para_usuario(actividades_leidas, usuario)}

    lecturas = await session.execute(
        select(
            LecturaTrampa.id,
            LecturaTrampa.id,
            LecturaTrampa.created_at,
            LecturaTrampa.deleted_at,
            Lote.predio_id,
        )
        .join(Trampa, Trampa.id == LecturaTrampa.trampa_id)
        .join(Lote, Lote.id == Trampa.lote_id)
        .where(
            LecturaTrampa.fecha >= hoy_bogota() - timedelta(days=DIAS_LECTURAS),
            alcance.filtro(Lote.predio_id, LecturaTrampa.updated_at, LecturaTrampa.deleted_at),
        )
    )
    e_creados, e_modificados, e_borrados = _repartir(lecturas, alcance)
    filas = await session.execute(
        consulta_lecturas()
        .where(LecturaTrampa.id.in_([*e_creados, *e_modificados]))
        .order_by(LecturaTrampa.observado_en)
    )
    lecturas_leidas = {fila[0].id: leer_lectura(usuario, *fila) for fila in filas}

    retirados = sorted(alcance.retirados)
    return Cambios(
        desde=desde,
        servidor_en=servidor_en,
        siguiente_desde=siguiente_desde(servidor_en),
        predios=CambiosEntidad[PredioLeer](
            creados=[PredioLeer.model_validate(p) for p in p_creados],
            modificados=[PredioLeer.model_validate(p) for p in p_modificados],
            borrados=retirados,
        ),
        lotes=CambiosEntidad[LoteLeer](
            creados=[LoteLeer.model_validate(x) for x in l_creados],
            modificados=[LoteLeer.model_validate(x) for x in l_modificados],
            borrados=l_borrados,
        ),
        trampas=CambiosEntidad[TrampaLeer](
            creados=[TrampaLeer.model_validate(x) for x in t_creados],
            modificados=[TrampaLeer.model_validate(x) for x in t_modificados],
            borrados=t_borrados,
        ),
        rutas=CambiosEntidad[RutaLeer](
            creados=[await leer_ruta(session, x) for x in r_creados],
            modificados=[await leer_ruta(session, x) for x in r_modificados],
            borrados=r_borrados,
        ),
        actividades=CambiosEntidad[ActividadLeer](
            creados=[leidas[i] for i in a_creados if i in leidas],
            modificados=[leidas[i] for i in a_modificados if i in leidas],
            borrados=a_borrados,
        ),
        lecturas=CambiosEntidad[LecturaLeer](
            creados=[lecturas_leidas[i] for i in e_creados if i in lecturas_leidas],
            modificados=[lecturas_leidas[i] for i in e_modificados if i in lecturas_leidas],
            borrados=e_borrados,
        ),
    )


@router.post(
    "/lecturas",
    response_model=ResultadoBloque,
    summary="Enviar en bloque las lecturas tomadas sin conexión",
    description="Registra cada lectura con las mismas reglas de `POST /visitas/lecturas` y "
    "responde 200 con un resultado por lectura, en el orden del envío: una que falle no impide "
    "guardar las demás. Las procesa por `observado_en` (así los días de exposición de dos "
    "lecturas de la misma trampa salen bien aunque lleguen desordenadas). Idempotente: el `id` "
    "es obligatorio y reenviar el bloque (p. ej. si se cortó la conexión antes de la respuesta) "
    "devuelve `existente` con la lectura guardada, sin duplicarla. Si el reenvío trae otros "
    "datos con el mismo `id`, se conserva la primera versión (las lecturas no se editan desde "
    "la app): el cliente reemplaza su copia por la que devuelve el servidor, con su estado de "
    "validación. Si otro técnico ya registró esa trampa ese día, el resultado es `error` 409.",
    responses={
        **ERROR_401,
        403: {"description": "El productor no registra lecturas"},
        422: {
            "description": "El bloque está vacío, tiene más de 200 lecturas o alguna es inválida"
        },
    },
)
async def enviar_lecturas(
    entrada: LecturasBloque, usuario: CampoDep, session: SessionDep
) -> ResultadoBloque:
    resultados: dict[int, ResultadoLectura] = {}
    orden = sorted(enumerate(entrada.lecturas), key=lambda par: par[1].observado_en)
    for indice, lectura in orden:
        try:
            # Un punto de guardado por lectura: si falla, se deshace solo esa.
            async with session.begin_nested():
                lectura_id, creada = await crear_lectura(session, usuario, lectura)
        except HTTPException as error:
            resultados[indice] = _error(lectura.id, error.status_code, error.detail)
        except IntegrityError:
            resultados[indice] = _error(
                lectura.id, status.HTTP_409_CONFLICT, "La lectura ya estaba registrada"
            )
        else:
            resultados[indice] = ResultadoLectura(
                id=lectura_id,
                resultado="creada" if creada else "existente",
                codigo=status.HTTP_201_CREATED if creada else status.HTTP_200_OK,
                detalle=None,
                lectura=await leer_lectura_id(session, usuario, lectura_id),
            )
    await session.commit()
    return ResultadoBloque(resultados=[resultados[i] for i in range(len(entrada.lecturas))])


def _error(lectura_id: uuid.UUID, codigo: int, detalle: str) -> ResultadoLectura:
    return ResultadoLectura(
        id=lectura_id, resultado="error", codigo=codigo, detalle=detalle, lectura=None
    )
