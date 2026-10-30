#!/usr/bin/env bash
# Respaldo + imagen actualizada + `npm run migrar` (la lista y el orden viven en backend/scripts/migrarTodo.ts).
# Uso (desde la raiz del repo): ./deploy/migrar.sh [--aplicar]
set -euo pipefail

./deploy/respaldar.sh
docker compose build herramientas
if [[ "${1:-}" == "--aplicar" ]]; then
  docker compose run --rm herramientas npm run migrar -- --aplicar
else
  docker compose run --rm herramientas npm run migrar
fi
