#!/bin/sh
# Prepara la VM y levanta PERSICA (se ejecuta en el servidor, como un usuario con sudo):
#
#   gcloud compute ssh persica --zone us-east1-b --command \
#     "DOMINIO=persica.ejemplo.co CORREO=responsable@ejemplo.co VERSION=v1.0.0 sh -s" \
#     < deploy/gcp/instalar-servidor.sh
#
# Instala Docker y Compose, agrega 2 GB de swap (la compilación del frontend necesita memoria),
# descarga la versión indicada del repositorio en /opt/persica, crea .env con claves generadas
# aquí mismo (no se muestran ni salen del servidor) y levanta el stack de producción. Si .env ya
# existe, se conserva. Después falta el certificado: sh deploy/obtener-certificado.sh
set -eu

DOMINIO=${DOMINIO:?Defina DOMINIO}
CORREO=${CORREO:?Defina CORREO (avisos de Let\'s Encrypt)}
VERSION=${VERSION:-v1.0.0}
REPO=${REPO:-https://github.com/elkynerojas/durazno.git}
DESTINO=/opt/persica

if ! command -v docker >/dev/null 2>&1; then
    sudo apt-get update -qq
    sudo apt-get install -y -qq ca-certificates curl git
    sudo install -m 0755 -d /etc/apt/keyrings
    sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" |
        sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
    sudo apt-get update -qq
    sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

if ! sudo swapon --show | grep -q /swapfile; then
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile >/dev/null
    sudo swapon /swapfile
    grep -q /swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

if [ ! -d "$DESTINO/.git" ]; then
    sudo git clone --quiet --branch "$VERSION" "$REPO" "$DESTINO"
else
    sudo git -C "$DESTINO" fetch --quiet --tags
    sudo git -C "$DESTINO" checkout --quiet "$VERSION"
fi

if [ ! -f "$DESTINO/.env" ]; then
    URL="https://$DOMINIO"
    sudo sed \
        -e "s|^DOMINIO=.*|DOMINIO=$DOMINIO|" \
        -e "s|^CORREO_LETSENCRYPT=.*|CORREO_LETSENCRYPT=$CORREO|" \
        -e "s|^CORS_ORIGINS=.*|CORS_ORIGINS=$URL|" \
        -e "s|^QR_URL_BASE=.*|QR_URL_BASE=$URL|" \
        -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" \
        -e "s|^SECRET_KEY=.*|SECRET_KEY=$(openssl rand -hex 32)|" \
        "$DESTINO/.env.prod.example" | sudo tee "$DESTINO/.env" >/dev/null
    sudo chmod 600 "$DESTINO/.env"
    echo ".env creado con claves nuevas (no se muestran)."
fi

cd "$DESTINO"
sudo docker compose -f docker-compose.prod.yml up -d --build
sudo docker compose -f docker-compose.prod.yml ps
