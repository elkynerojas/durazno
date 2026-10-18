"""Exporta el esquema OpenAPI a `backend/openapi.json` (entregable de la fase 2, HU-31).

    docker compose exec api python -m app.scripts.exportar_openapi

La prueba `tests/test_openapi.py` falla si el archivo versionado no coincide con la API.
"""

import json
from pathlib import Path

from app.main import app

ARCHIVO = Path(__file__).resolve().parents[2] / "openapi.json"


def esquema_json() -> str:
    return json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n"


def main() -> None:
    ARCHIVO.write_text(esquema_json(), encoding="utf-8")
    print(f"Esquema OpenAPI exportado en {ARCHIVO}")


if __name__ == "__main__":
    main()
