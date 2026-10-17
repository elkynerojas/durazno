#!/bin/sh
# Restaura una copia SOBRE la base en uso (reemplaza sus datos). Pide confirmación escrita.
#
#   docker compose -f docker-compose.prod.yml stop api
#   docker compose -f docker-compose.prod.yml exec respaldo sh /respaldo/restaurar.sh <archivo>
#   docker compose -f docker-compose.prod.yml start api
set -eu

archivo=${1:?Indique el archivo .dump a restaurar (ls /respaldos)}
[ -f "$archivo" ] || { echo "No existe ${archivo}" >&2; exit 1; }

printf 'Esto REEMPLAZA los datos de %s con %s.\nEscriba el nombre de la base para confirmar: ' \
    "$PGDATABASE" "$archivo"
read -r confirmacion
[ "$confirmacion" = "$PGDATABASE" ] || { echo "Cancelado." >&2; exit 1; }

pg_restore --clean --if-exists --no-owner --exit-on-error --dbname="$PGDATABASE" "$archivo"
echo "restaurar.sh: ${PGDATABASE} restaurada desde ${archivo}."
