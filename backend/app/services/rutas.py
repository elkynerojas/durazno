"""Rutas de monitoreo (HU-19): validación del orden y propuesta por vecino más cercano."""

import uuid
from collections import Counter
from collections.abc import Hashable, Mapping, Sequence

from sqlalchemy import func, select, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.ruta import Ruta, RutaTrampa
from app.models.trampa import Trampa

Distancias = Mapping[tuple[Hashable, Hashable], float]
# Inicios que se prueban en la propuesta: acota el costo (O(n²) por inicio) en lotes grandes.
MAX_INICIOS = 50


def errores_de_orden(orden: Sequence[uuid.UUID], activas: Mapping[uuid.UUID, str]) -> list[str]:
    """Problemas del orden enviado frente a las trampas activas del lote (`id → código ICA`).
    Vacío si el orden las incluye a todas, una sola vez cada una."""
    errores = []
    repetidas = [t for t, n in Counter(orden).items() if n > 1]
    if repetidas:
        errores.append("Repite " + ", ".join(sorted(activas.get(t, str(t)) for t in repetidas)))
    ajenas = [t for t in dict.fromkeys(orden) if t not in activas]
    if ajenas:
        errores.append(f"Incluye {len(ajenas)} trampa(s) que no están activas en el lote")
    omitidas = sorted(codigo for t, codigo in activas.items() if t not in set(orden))
    if omitidas:
        errores.append("Omite " + ", ".join(omitidas))
    return errores


def longitud(orden: Sequence[Hashable], distancias: Distancias) -> float:
    return sum(distancias[a, b] for a, b in zip(orden, orden[1:], strict=False))


def _desde(inicio: Hashable, puntos: Sequence[Hashable], distancias: Distancias) -> list:
    orden, pendientes = [inicio], [p for p in puntos if p != inicio]
    while pendientes:
        # Empate: gana el primero de `puntos`, para que el resultado sea estable.
        siguiente = min(pendientes, key=lambda p: distancias[orden[-1], p])
        orden.append(siguiente)
        pendientes.remove(siguiente)
    return orden


def vecino_mas_cercano(
    puntos: Sequence[Hashable], distancias: Distancias, inicio: Hashable | None = None
) -> list:
    """Recorrido que va siempre a la trampa más cercana aún no visitada. Sin `inicio`, prueba
    a partir de cada trampa (hasta `MAX_INICIOS`) y se queda con el recorrido más corto."""
    if not puntos:
        return []
    candidatos = [inicio] if inicio is not None else list(puntos)[:MAX_INICIOS]
    return min(
        (_desde(c, puntos, distancias) for c in candidatos),
        key=lambda orden: longitud(orden, distancias),
    )


async def matriz_distancias(
    session: AsyncSession, ids: Sequence[uuid.UUID]
) -> dict[tuple[uuid.UUID, uuid.UUID], float]:
    """Distancia geodésica en metros entre cada par de trampas (sobre `geography`)."""
    if not ids:
        return {}
    a, b = aliased(Trampa), aliased(Trampa)
    filas = await session.execute(
        select(
            a.id,
            b.id,
            func.ST_Distance(func.Geography(a.geom), func.Geography(b.geom)),
        )
        # Todos contra todos: producto cartesiano explícito.
        .join(b, true())
        .where(a.id.in_(ids), b.id.in_(ids))
    )
    return {(origen, destino): float(metros) for origen, destino, metros in filas}


async def ruta_de_trampa(session: AsyncSession, trampa_id: uuid.UUID) -> dict | None:
    """Posición de la trampa en la ruta vigente de su lote, o `None` si no está en ninguna."""
    ruta_id = await session.scalar(
        select(RutaTrampa.ruta_id)
        .join(Ruta, Ruta.id == RutaTrampa.ruta_id)
        .where(
            RutaTrampa.trampa_id == trampa_id,
            RutaTrampa.deleted_at.is_(None),
            Ruta.deleted_at.is_(None),
        )
    )
    if ruta_id is None:
        return None
    paradas = (
        await session.execute(
            select(Trampa.id, Trampa.codigo_ica)
            .join(RutaTrampa, RutaTrampa.trampa_id == Trampa.id)
            .where(
                RutaTrampa.ruta_id == ruta_id,
                RutaTrampa.deleted_at.is_(None),
                Trampa.deleted_at.is_(None),
            )
            .order_by(RutaTrampa.orden)
        )
    ).all()
    posicion = next(i for i, (id_, _) in enumerate(paradas) if id_ == trampa_id)
    siguiente = paradas[posicion + 1][1] if posicion + 1 < len(paradas) else None
    return {"id": ruta_id, "orden": posicion + 1, "total": len(paradas), "siguiente": siguiente}
