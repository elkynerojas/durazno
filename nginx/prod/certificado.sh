#!/bin/sh
# Apunta /etc/nginx/tls/actual al certificado de Let's Encrypt del dominio si ya existe; si no,
# a uno autofirmado provisional (Nginx no arranca sin certificado y certbot necesita a Nginx).
set -eu

REAL="/etc/letsencrypt/live/${DOMINIO}"
PROVISIONAL="/etc/nginx/tls/provisional"
mkdir -p /etc/nginx/tls

if [ -f "${REAL}/fullchain.pem" ]; then
    ln -sfn "${REAL}" /etc/nginx/tls/actual
    echo "certificado.sh: usando el certificado de Let's Encrypt de ${DOMINIO}"
    exit 0
fi

if [ ! -f "${PROVISIONAL}/fullchain.pem" ]; then
    mkdir -p "${PROVISIONAL}"
    openssl req -x509 -nodes -newkey rsa:2048 -days 30 -subj "/CN=${DOMINIO}" \
        -addext "subjectAltName=DNS:${DOMINIO}" \
        -keyout "${PROVISIONAL}/privkey.pem" -out "${PROVISIONAL}/fullchain.pem" 2>/dev/null
fi
ln -sfn "${PROVISIONAL}" /etc/nginx/tls/actual
echo "certificado.sh: usando un certificado PROVISIONAL autofirmado para ${DOMINIO}"
