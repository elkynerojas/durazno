#!/bin/sh
# Ejecuta respaldar.sh todos los días a las 02:00 (TZ del contenedor) y una vez al arrancar.
set -eu

sh /respaldo/respaldar.sh || echo "programar.sh: falló la copia inicial" >&2
while :; do
    ahora=$(date +%s)
    siguiente=$(date -d "today 02:00" +%s)
    [ "$siguiente" -le "$ahora" ] && siguiente=$(date -d "tomorrow 02:00" +%s)
    sleep $((siguiente - ahora))
    sh /respaldo/respaldar.sh || echo "programar.sh: falló la copia del $(date)" >&2
done
