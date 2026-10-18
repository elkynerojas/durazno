"""Valores de ejemplo para la documentación OpenAPI (HU-31).

Coordenadas reales de la vereda Icota (Cácota) en orden GeoJSON `[longitud, latitud]`: la
trampa del ejemplo queda dentro del polígono del lote. Los ids son UUIDv7 ficticios.
"""

PREDIO_ID = "0192f3a0-5b1c-7d2e-8f30-1a2b3c4d5e01"
LOTE_ID = "0192f3a0-5b1c-7d2e-8f30-1a2b3c4d5e02"
TRAMPA_ID = "0192f3a0-5b1c-7d2e-8f30-1a2b3c4d5e03"
TRAMPA_2_ID = "0192f3a0-5b1c-7d2e-8f30-1a2b3c4d5e04"
RUTA_ID = "0192f3a0-5b1c-7d2e-8f30-1a2b3c4d5e05"
USUARIO_ID = "0192f3a0-5b1c-7d2e-8f30-1a2b3c4d5e06"
LECTURA_ID = "0192f3a0-5b1c-7d2e-8f30-1a2b3c4d5e07"
VISITA_ID = "0192f3a0-5b1c-7d2e-8f30-1a2b3c4d5e08"
ACTIVIDAD_ID = "0192f3a0-5b1c-7d2e-8f30-1a2b3c4d5e09"
CAMBIO_ID = "0192f3a0-5b1c-7d2e-8f30-1a2b3c4d5e0a"

CREADO_EN = "2026-10-12T08:30:00-05:00"
OBSERVADO_EN = "2026-10-14T09:15:00-05:00"

POLIGONO_PREDIO = {
    "type": "Polygon",
    "coordinates": [
        [
            [-72.6440, 7.2690],
            [-72.6390, 7.2690],
            [-72.6390, 7.2730],
            [-72.6440, 7.2730],
            [-72.6440, 7.2690],
        ]
    ],
}
POLIGONO_LOTE = {
    "type": "Polygon",
    "coordinates": [
        [
            [-72.6420, 7.2700],
            [-72.6400, 7.2700],
            [-72.6400, 7.2715],
            [-72.6420, 7.2715],
            [-72.6420, 7.2700],
        ]
    ],
}
PUNTO_TRAMPA = {"type": "Point", "coordinates": [-72.6410, 7.2707]}
PUNTO_TRAMPA_2 = {"type": "Point", "coordinates": [-72.6405, 7.2711]}
PUNTO_TECNICO = {"type": "Point", "coordinates": [-72.64102, 7.27068]}
