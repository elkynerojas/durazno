#!/bin/sh
# Documento técnico de PERSICA (docs/tecnico/Documento_tecnico_PERSICA.docx).
#
#   NODE_PATH=<carpeta con node_modules/docx> sh docs/tecnico/generar.sh
#
# 1. Modelo de datos desde los metadatos de SQLAlchemy (contenedor «api» en marcha).
# 2. Diagrama entidad-relación generado + diagramas UML de docs/tecnico/diagramas, en PNG con
#    PlantUML (imagen Docker plantuml/plantuml).
# 3. El Word con docs/tecnico/generar.js. El logo se toma de docs/manual/img/logo.png (lo deja
#    el spec del manual) o se pide.
set -eu

RAIZ=$(cd "$(dirname "$0")/../.." && pwd)
TECNICO="$RAIZ/docs/tecnico"
SALIDA="$TECNICO/build"
rm -rf "$SALIDA"
mkdir -p "$SALIDA/img"

cd "$RAIZ"
docker compose exec -T api python - < "$TECNICO/modelo.py" > "$SALIDA/modelo.json"
cp "$TECNICO"/diagramas/*.puml "$TECNICO/diagramas/estilo.iuml" "$SALIDA/img/"
python3 -c "
import json, sys
for nombre, texto in json.load(open(sys.argv[1]))['er'].items():
    open(f'{sys.argv[2]}/{nombre}.puml', 'w').write(texto)" "$SALIDA/modelo.json" "$SALIDA/img"
# Versiones instaladas de las dependencias principales.
docker compose exec -T api pip list --format=json > "$SALIDA/pip.json"
docker compose exec -T frontend npm ls --depth=0 --json > "$SALIDA/npm.json"
docker run --rm -v "$SALIDA/img:/d" -w /d plantuml/plantuml:1.2024.7 -tpng -charset UTF-8 .
cp "$RAIZ/docs/manual/img/logo.png" "$SALIDA/img/logo.png"

TECNICO_IMG="$SALIDA/img" TECNICO_MODELO="$SALIDA/modelo.json" node "$TECNICO/generar.js" \
    "$TECNICO/Documento_tecnico_PERSICA.docx"
