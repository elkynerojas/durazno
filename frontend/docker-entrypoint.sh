#!/bin/sh
set -e

# node_modules vive en un volumen de Docker que sobrevive a los reinicios: si
# package-lock.json cambió desde la última instalación (git pull, npm install en
# otro equipo), se reinstalan las dependencias antes de arrancar.
HUELLA=node_modules/.huella-package-lock
ACTUAL=$(sha256sum package-lock.json | cut -d' ' -f1)

if [ ! -f "$HUELLA" ] || [ "$(cat "$HUELLA")" != "$ACTUAL" ]; then
  echo "package-lock.json cambió: instalando dependencias con npm ci..."
  npm ci
  echo "$ACTUAL" > "$HUELLA"
fi

exec "$@"
