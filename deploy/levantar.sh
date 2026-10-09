#!/usr/bin/env bash
# Construye y levanta Klassy. Sirve para HTTP y para HTTPS:
#   - DOMINIO vacio en .env  -> HTTP en PUERTO_WEB (por IP).
#   - DOMINIO definido       -> HTTPS con Caddy y certificado automatico.
# Uso (desde la raiz del repo): ./deploy/levantar.sh
set -euo pipefail

[ -f .env ] || { echo "Falta .env: cp .env.produccion.example .env y editarlo."; exit 1; }

archivos=(-f docker-compose.yml)
if grep -qE '^DOMINIO=.+' .env; then
  archivos+=(-f docker-compose.https.yml)
  echo "Modo HTTPS ($(grep -E '^DOMINIO=' .env | cut -d= -f2))"
else
  echo "Modo HTTP (sin DOMINIO)"
fi

docker compose "${archivos[@]}" up -d --build
docker compose "${archivos[@]}" ps
