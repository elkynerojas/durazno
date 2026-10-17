#!/bin/sh
# Copia de la base con pg_dump (formato personalizado, comprimido) en /respaldos y borrado de las
# de más de DIAS_RETENCION días. Usa PGHOST, PGUSER, PGPASSWORD y PGDATABASE.
set -eu

DESTINO=${DESTINO:-/respaldos}
DIAS=${DIAS_RETENCION:-14}
archivo="${DESTINO}/${PGDATABASE}-$(date +%Y%m%d-%H%M%S).dump"

# Las copias contienen datos personales y hashes de claves: solo las lee su dueño.
umask 077
mkdir -p "$DESTINO"
# Se escribe a un temporal y se renombra: nunca queda una copia a medias con el nombre final.
pg_dump --format=custom --compress=9 --no-owner --file="${archivo}.parcial"
mv "${archivo}.parcial" "$archivo"
find "$DESTINO" -name "${PGDATABASE}-*.dump" -mtime "+${DIAS}" -delete
echo "respaldar.sh: copia lista en ${archivo} ($(du -h "$archivo" | cut -f1))"
