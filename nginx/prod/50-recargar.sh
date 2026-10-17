#!/bin/sh
# Cada 6 horas toma el certificado renovado por certbot sin reiniciar el contenedor.
(while sleep 21600; do /usr/local/bin/certificado.sh && nginx -s reload; done) &
