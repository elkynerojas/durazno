"""Exportación de lotes y trampas a GeoJSON (RFC 7946) y KML para QGIS y Google Earth."""

import json
from dataclasses import dataclass
from xml.sax.saxutils import escape

TIPOS = {"jackson": "Jackson", "mcphail": "McPhail"}


@dataclass(frozen=True)
class LoteExportado:
    id: str
    codigo: str
    nombre: str | None
    area_ha: float
    geojson: str  # ST_AsGeoJSON
    kml: str  # ST_AsKML


@dataclass(frozen=True)
class TrampaExportada:
    id: str
    codigo_ica: str
    codigo_qr: str
    tipo: str
    atrayente: str
    estado: str
    fecha_instalacion: str
    precision_m: float | None
    lote_codigo: str
    geojson: str
    kml: str


def a_geojson(lotes: list[LoteExportado], trampas: list[TrampaExportada]) -> dict:
    """FeatureCollection RFC 7946 (WGS 84, [longitud, latitud]); `elemento` distingue la capa."""
    elementos = [
        {
            "type": "Feature",
            "id": lote.id,
            "geometry": json.loads(lote.geojson),
            "properties": {
                "elemento": "lote",
                "codigo": lote.codigo,
                "nombre": lote.nombre,
                "area_ha": lote.area_ha,
            },
        }
        for lote in lotes
    ] + [
        {
            "type": "Feature",
            "id": trampa.id,
            "geometry": json.loads(trampa.geojson),
            "properties": {
                "elemento": "trampa",
                "codigo_ica": trampa.codigo_ica,
                "codigo_qr": trampa.codigo_qr,
                "tipo": trampa.tipo,
                "atrayente": trampa.atrayente,
                "estado": trampa.estado,
                "fecha_instalacion": trampa.fecha_instalacion,
                "precision_m": trampa.precision_m,
                "lote": trampa.lote_codigo,
            },
        }
        for trampa in trampas
    ]
    return {"type": "FeatureCollection", "features": elementos}


def _dato(nombre: str, valor: object) -> str:
    texto = "" if valor is None else escape(str(valor))
    return f'<Data name="{nombre}"><value>{texto}</value></Data>'


def a_kml(lotes: list[LoteExportado], trampas: list[TrampaExportada], titulo: str) -> str:
    """Documento KML 2.2 con una carpeta de lotes y otra de trampas. Todo texto que escribe el
    usuario se escapa."""
    marcas_lotes = "".join(
        "<Placemark>"
        f"<name>{escape(lote.codigo)}</name>"
        f"<description>{escape(lote.nombre or '')} · {lote.area_ha:.2f} ha</description>"
        "<styleUrl>#lote</styleUrl>"
        f"<ExtendedData>{_dato('area_ha', lote.area_ha)}</ExtendedData>"
        f"{lote.kml}"
        "</Placemark>"
        for lote in lotes
    )
    marcas_trampas = "".join(
        "<Placemark>"
        f"<name>{escape(trampa.codigo_ica)}</name>"
        f"<description>{TIPOS.get(trampa.tipo, trampa.tipo)} + {escape(trampa.atrayente)} · "
        f"lote {escape(trampa.lote_codigo)} · {escape(trampa.estado)}</description>"
        f"<styleUrl>#trampa-{trampa.tipo}</styleUrl>"
        "<ExtendedData>"
        f"{_dato('codigo_qr', trampa.codigo_qr)}{_dato('tipo', trampa.tipo)}"
        f"{_dato('atrayente', trampa.atrayente)}{_dato('estado', trampa.estado)}"
        f"{_dato('fecha_instalacion', trampa.fecha_instalacion)}"
        f"{_dato('precision_m', trampa.precision_m)}{_dato('lote', trampa.lote_codigo)}"
        "</ExtendedData>"
        f"{trampa.kml}"
        "</Placemark>"
        for trampa in trampas
    )
    # Colores KML en aabbggrr: verde del cultivo para lotes; durazno y azul para las trampas.
    estilos = (
        '<Style id="lote"><LineStyle><color>ff435a1e</color><width>2</width></LineStyle>'
        "<PolyStyle><color>4d546e2b</color></PolyStyle></Style>"
        '<Style id="trampa-jackson"><IconStyle><color>ff5a87e8</color><Icon>'
        "<href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href>"
        "</Icon></IconStyle></Style>"
        '<Style id="trampa-mcphail"><IconStyle><color>ffd77a3a</color><Icon>'
        "<href>http://maps.google.com/mapfiles/kml/shapes/placemark_square.png</href>"
        "</Icon></IconStyle></Style>"
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>'
        f"<name>{escape(titulo)}</name>{estilos}"
        f"<Folder><name>Lotes</name>{marcas_lotes}</Folder>"
        f"<Folder><name>Trampas</name>{marcas_trampas}</Folder>"
        "</Document></kml>"
    )
