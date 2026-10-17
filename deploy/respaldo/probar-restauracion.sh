#!/bin/sh
# Prueba de restauración: restaura una copia (la más reciente si no se indica) en una base
# temporal, compara el número de filas vigentes de las tablas del dominio con la base en uso y
# borra la base temporal. Sale con error si algo no coincide. No toca la base en uso.
#
#   docker compose -f docker-compose.prod.yml exec respaldo sh /respaldo/probar-restauracion.sh
set -eu

DESTINO=${DESTINO:-/respaldos}
archivo=${1:-$(ls -1t "$DESTINO"/"${PGDATABASE}"-*.dump | head -n 1)}
prueba="${PGDATABASE}_prueba_restauracion"
TABLAS="usuario predio lote trampa"

echo "Restaurando ${archivo} en ${prueba}..."
dropdb --if-exists "$prueba"
createdb "$prueba"
trap 'dropdb --if-exists "$prueba"' EXIT
pg_restore --no-owner --exit-on-error --dbname="$prueba" "$archivo"

contar() {
    psql --dbname="$1" -tAc "SELECT count(*) FROM $2 WHERE deleted_at IS NULL"
}
fallas=0
for tabla in $TABLAS; do
    original=$(contar "$PGDATABASE" "$tabla")
    restaurada=$(contar "$prueba" "$tabla")
    estado="ok"
    if [ "$original" != "$restaurada" ]; then
        estado="DIFERENTE"
        fallas=$((fallas + 1))
    fi
    printf '  %-10s en uso: %6s   restaurada: %6s   %s\n' "$tabla" "$original" "$restaurada" "$estado"
done
version=$(psql --dbname="$prueba" -tAc "SELECT version_num FROM alembic_version")
echo "  migración restaurada: ${version}"

if [ "$fallas" -gt 0 ]; then
    echo "probar-restauracion.sh: ${fallas} tabla(s) no coinciden (¿hubo cambios después de la copia?)" >&2
    exit 1
fi
echo "probar-restauracion.sh: restauración correcta."
