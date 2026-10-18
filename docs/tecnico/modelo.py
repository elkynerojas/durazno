"""Modelo de datos de PERSICA desde los metadatos de SQLAlchemy, para el documento técnico.

    docker compose exec -T api python - < docs/tecnico/modelo.py > modelo.json

Imprime un JSON con los diagramas entidad-relación en PlantUML («er», por área) y el diccionario
de datos («tablas»: columnas, tipos, nulos, valores por defecto, llaves, índices y restricciones).
"""

import json
import re

from sqlalchemy import CheckConstraint
from sqlalchemy.dialects import postgresql

import app.models  # noqa: F401  (registra todos los modelos en Base.metadata)
from app.db.base import Base

DIALECTO = postgresql.dialect()
# Columnas comunes de EntidadSincronizable: van al final y se explican una vez en el documento.
COMUNES = ("id", "created_at", "updated_at", "deleted_at")
# Modelos sin docstring: descripción de la tabla de dominio de CLAUDE.md.
DESCRIPCIONES = {
    "predio": "Finca o cultivo. El administrador lo crea; es el nivel al que se consolida el MTD.",
    "usuario": "Cuenta del personal con su rol (técnico, agrónomo, productor o administrador).",
    "lote": "Unidad del predio con su polígono; código único dentro del predio.",
    "trampa": "Punto dentro del polígono de su lote, con código ICA, tipo, atrayente y código QR.",
}


def tipo(columna) -> str:
    texto = columna.type.compile(dialect=DIALECTO)
    if texto.startswith("geometry"):
        return texto
    return {"TIMESTAMP WITH TIME ZONE": "timestamptz"}.get(texto, texto.lower())


def por_defecto(columna) -> str | None:
    if columna.server_default is None:
        return None
    return str(getattr(columna.server_default, "arg", columna.server_default))


def descripcion_tabla(tabla) -> str:
    for mapper in Base.registry.mappers:
        if mapper.local_table is tabla and mapper.class_.__doc__:
            return " ".join(mapper.class_.__doc__.split())
    return DESCRIPCIONES.get(tabla.name, "")


def indices(tabla) -> list[dict]:
    resultado = []
    for indice in sorted(tabla.indexes, key=lambda i: i.name or ""):
        partes = [c.name for c in indice.columns] or [str(e) for e in indice.expressions]
        donde = indice.dialect_options["postgresql"].get("where")
        resultado.append(
            {
                "nombre": indice.name,
                "columnas": partes,
                "unico": bool(indice.unique),
                "donde": str(donde) if donde is not None else None,
            }
        )
    return resultado


def tablas() -> list[dict]:
    salida = []
    for tabla in Base.metadata.sorted_tables:
        propias = [c for c in tabla.columns if c.name not in COMUNES]
        comunes = [c for c in tabla.columns if c.name in COMUNES]
        columnas = []
        for c in [*propias, *comunes]:
            fk = next(iter(c.foreign_keys), None)
            columnas.append(
                {
                    "nombre": c.name,
                    "tipo": tipo(c),
                    "nulo": c.nullable,
                    "por_defecto": por_defecto(c),
                    "pk": c.primary_key,
                    "fk": fk.target_fullname if fk else None,
                    "unico": bool(c.unique),
                    "comun": c.name in COMUNES,
                }
            )
        salida.append(
            {
                "nombre": tabla.name,
                "descripcion": descripcion_tabla(tabla),
                "columnas": columnas,
                "indices": indices(tabla),
                "checks": sorted(
                    (k.name, re.sub(r"\s+", " ", str(k.sqltext)))
                    for k in tabla.constraints
                    if isinstance(k, CheckConstraint)
                ),
            }
        )
    return salida


# El diagrama completo no se lee en una página carta: va en dos áreas. Las tablas de la otra área
# que se referencian aparecen solo con su llave.
AREAS = {
    "er-predio": (
        "Modelo entidad-relación: predio, lotes, trampas y rutas",
        [
            "predio",
            "usuario",
            "predio_usuario",
            "lote",
            "trampa",
            "ruta",
            "ruta_trampa",
            "reemplazo_qr",
        ],
    ),
    "er-operacion": (
        "Modelo entidad-relación: visitas, lecturas y plan de actividades",
        ["visita", "lectura_trampa", "plan_actividad", "plan_cambio"],
    ),
}


def er(datos: list[dict], titulo: str, nombres: list[str]) -> str:
    """Diagrama entidad-relación (Crow's foot) con las columnas propias de las tablas."""
    por_nombre = {t["nombre"]: t for t in datos}
    referidas = sorted(
        {
            c["fk"].split(".")[0]
            for n in nombres
            for c in por_nombre[n]["columnas"]
            if c["fk"] and c["fk"].split(".")[0] not in nombres
        }
    )
    lineas = [
        "@startuml",
        "!include estilo.iuml",
        f"title {titulo}",
        "hide circle",
        "skinparam linetype ortho",
    ]
    for nombre in nombres:
        t = por_nombre[nombre]
        lineas.append(f'entity "{nombre}" as {nombre} {{')
        lineas.append("  * id : uuid <<PK>>")
        lineas.append("  --")
        for c in t["columnas"]:
            if c["comun"]:
                continue
            marca = "* " if not c["nulo"] else "  "
            extra = " <<FK>>" if c["fk"] else ""
            lineas.append(f"  {marca}{c['nombre']} : {c['tipo']}{extra}")
        lineas.append("  ..")
        lineas.append("  created_at, updated_at, deleted_at")
        lineas.append("}")
    for nombre in referidas:
        lineas.append(f'entity "{nombre}" as {nombre} #EEEEEE {{')
        lineas.append("  * id : uuid <<PK>>")
        lineas.append("}")
    for nombre in nombres:
        for c in por_nombre[nombre]["columnas"]:
            if c["fk"]:
                destino = c["fk"].split(".")[0]
                cardinalidad = "|o" if c["nulo"] else "||"
                lineas.append(f'{destino} {cardinalidad}--o{{ {nombre} : "{c["nombre"]}"')
    lineas.append("@enduml")
    return "\n".join(lineas)


datos = tablas()
diagramas = {clave: er(datos, titulo, nombres) for clave, (titulo, nombres) in AREAS.items()}
if sorted(n for _, ns in AREAS.values() for n in ns) != sorted(t["nombre"] for t in datos):
    raise SystemExit("Cada tabla debe estar en un área del diagrama entidad-relación (AREAS)")
print(json.dumps({"tablas": datos, "er": diagramas}, ensure_ascii=False, indent=1))
