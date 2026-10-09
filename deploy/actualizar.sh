#!/usr/bin/env bash
# Actualiza el VPS a la ultima version de main (HTTP o HTTPS segun DOMINIO en .env).
set -euo pipefail
git pull --ff-only
./deploy/levantar.sh
docker image prune -f
