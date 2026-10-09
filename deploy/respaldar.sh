#!/usr/bin/env bash
# Respaldo de la base y de los archivos subidos (datos personales: guardarlos fuera del VPS).
# Uso (desde la raiz del repo): ./deploy/respaldar.sh [directorio]   (por defecto ./respaldos)
# Cron diario sugerido:  0 3 * * * cd /ruta/klassyF && ./deploy/respaldar.sh >> respaldos/cron.log 2>&1
set -euo pipefail

destino="${1:-respaldos}"
fecha="$(date +%F_%H%M)"
mkdir -p "$destino"

docker compose exec -T mongo mongodump --archive --gzip --db "${MONGO_DB:-klassy}" > "$destino/mongo-$fecha.archive.gz"
docker compose exec -T backend tar -C /app -czf - uploads > "$destino/uploads-$fecha.tar.gz"

# Conserva los ultimos 14 respaldos de cada tipo.
ls -1t "$destino"/mongo-*.archive.gz 2>/dev/null | tail -n +15 | xargs -r rm --
ls -1t "$destino"/uploads-*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm --
echo "Respaldo listo: $destino/*-$fecha.*"
