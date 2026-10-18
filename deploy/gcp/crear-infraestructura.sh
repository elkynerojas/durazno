#!/bin/sh
# Infraestructura de PERSICA en Google Cloud (Compute Engine). Idempotente: lo que ya existe se
# deja como está.
#
#   PROYECTO=persica-iser sh deploy/gcp/crear-infraestructura.sh
#
# Crea una IP externa fija, una VM e2-small con Debian 12, la regla de firewall para HTTP/HTTPS y
# snapshots diarios del disco (7 días). Al final muestra la IP para el registro A del dominio.
set -eu

PROYECTO=${PROYECTO:?Defina PROYECTO}
REGION=${REGION:-us-east1}
ZONA=${ZONA:-us-east1-b}
VM=${VM:-persica}
TIPO=${TIPO:-e2-small}
DISCO_GB=${DISCO_GB:-20}
G="gcloud --project $PROYECTO --quiet"

existe() { "$@" >/dev/null 2>&1; }

existe $G compute addresses describe "$VM-ip" --region "$REGION" ||
    $G compute addresses create "$VM-ip" --region "$REGION" --network-tier PREMIUM
IP=$($G compute addresses describe "$VM-ip" --region "$REGION" --format 'value(address)')

existe $G compute firewall-rules describe "$VM-web" ||
    $G compute firewall-rules create "$VM-web" --network default --direction INGRESS \
        --allow tcp:80,tcp:443 --target-tags "$VM-web" --source-ranges 0.0.0.0/0 \
        --description "HTTP y HTTPS de PERSICA (nginx)"

existe $G compute resource-policies describe "$VM-snapshots" --region "$REGION" ||
    $G compute resource-policies create snapshot-schedule "$VM-snapshots" --region "$REGION" \
        --daily-schedule --start-time 07:00 --max-retention-days 7 \
        --on-source-disk-delete keep-auto-snapshots --storage-location "$REGION" \
        --description "Snapshot diario del disco de PERSICA (02:00 en Bogotá)"

existe $G compute instances describe "$VM" --zone "$ZONA" ||
    $G compute instances create "$VM" --zone "$ZONA" --machine-type "$TIPO" \
        --image-family debian-12 --image-project debian-cloud \
        --boot-disk-size "${DISCO_GB}GB" --boot-disk-type pd-balanced \
        --address "$IP" --tags "$VM-web" \
        --metadata enable-oslogin=TRUE \
        --labels app=persica

DISCO=$($G compute instances describe "$VM" --zone "$ZONA" --format 'value(disks[0].source.basename())')
$G compute disks describe "$DISCO" --zone "$ZONA" --format 'value(resourcePolicies)' |
    grep -q "$VM-snapshots" ||
    $G compute disks add-resource-policies "$DISCO" --zone "$ZONA" --resource-policies "$VM-snapshots"

echo "IP de $VM: $IP"
echo "Cree en el DNS el registro A del dominio apuntando a $IP."
