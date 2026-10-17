#!/bin/sh
# Primera emisión del certificado de Let's Encrypt (después lo renueva el servicio certbot).
# Requisitos: el dominio apunta a este servidor, los puertos 80 y 443 están abiertos y el
# stack de producción está arriba. Con STAGING=1 usa el entorno de pruebas de Let's Encrypt
# (sin límites de emisión; el certificado no es de confianza).
#
#   sh deploy/obtener-certificado.sh
set -eu

cd "$(dirname "$0")/.."
DOMINIO=$(grep -E '^DOMINIO=' .env | cut -d= -f2-)
CORREO=$(grep -E '^CORREO_LETSENCRYPT=' .env | cut -d= -f2-)
[ -n "$DOMINIO" ] && [ -n "$CORREO" ] || {
    echo "Defina DOMINIO y CORREO_LETSENCRYPT en .env" >&2
    exit 1
}
COMPOSE="docker compose -f docker-compose.prod.yml"

$COMPOSE run --rm --entrypoint certbot certbot certonly \
    --webroot -w /var/www/certbot -d "$DOMINIO" \
    --email "$CORREO" --agree-tos --no-eff-email --non-interactive \
    ${STAGING:+--staging}

# Nginx deja el certificado provisional y toma el de Let's Encrypt.
$COMPOSE exec nginx sh -c '/usr/local/bin/certificado.sh && nginx -s reload'
echo "Listo: https://${DOMINIO}"
