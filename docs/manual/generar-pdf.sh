#!/bin/sh
# PDF del manual de usuario para el aplicativo (frontend/public/manual-usuario.pdf).
#
#   NODE_PATH=<carpeta con node_modules/docx> sh docs/manual/generar-pdf.sh <carpeta de imágenes> <salida.pdf>
#
# LibreOffice no llena bien el campo de índice de Word, así que el índice se escribe con las
# páginas reales en dos pasadas: la primera (con páginas de relleno, para que la diagramación sea
# la misma) dice en qué página cae cada título; la segunda las escribe y se convierte a PDF.
set -eu

IMG=$(cd "$1" && pwd)
SALIDA=$2
MANUAL=$(cd "$(dirname "$0")" && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

convertir() {
  docker run --rm -v "$TMP:/t" debian:bookworm-slim sh -c "
    apt-get update -qq >/dev/null &&
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
      libreoffice-writer poppler-utils fonts-liberation python3 >/dev/null 2>&1 &&
    cd /t && soffice --headless --convert-to pdf $1.docx >/dev/null 2>&1 && $2"
}

# Pasada 1: títulos con páginas de relleno.
MANUAL_IMG="$IMG" MANUAL_TITULOS="$TMP/titulos.json" node "$MANUAL/generar.js" "$TMP/sin-paginas.docx" >/dev/null
node -e "
const t = require('$TMP/titulos.json');
require('fs').writeFileSync('$TMP/relleno.json', JSON.stringify(t.map((x) => ({ ...x, pagina: '00' }))));"
MANUAL_IMG="$IMG" MANUAL_TOC="$TMP/relleno.json" node "$MANUAL/generar.js" "$TMP/pasada1.docx" >/dev/null

# Página de cada título, en orden: la primera página desde la anterior cuyo texto empieza por él.
convertir pasada1 "python3 - <<'EOF'
import json, subprocess
titulos = json.load(open('/t/titulos.json'))
paginas = int([l for l in subprocess.run(['pdfinfo', 'pasada1.pdf'], capture_output=True, text=True).stdout.splitlines() if l.startswith('Pages')][0].split()[-1])
texto = [subprocess.run(['pdftotext', '-f', str(p), '-l', str(p), 'pasada1.pdf', '-'], capture_output=True, text=True).stdout for p in range(1, paginas + 1)]
desde = 3
for t in titulos:
    for p in range(desde, paginas + 1):
        if any(linea.strip() == t['texto'] for linea in texto[p - 1].splitlines()):
            t['pagina'] = p
            desde = p
            break
    else:
        raise SystemExit('No se encontró el título: ' + t['texto'])
json.dump(titulos, open('/t/indice.json', 'w'))
EOF"

# Pasada 2: el índice con las páginas reales.
MANUAL_IMG="$IMG" MANUAL_TOC="$TMP/indice.json" node "$MANUAL/generar.js" "$TMP/manual.docx" >/dev/null
convertir manual "true"
cp "$TMP/manual.pdf" "$SALIDA"
echo "PDF: $SALIDA"
