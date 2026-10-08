# Klassy en local y en el VPS

El "if" entre los dos modos es `NODE_ENV`:

| | Local (`npm run dev`) | VPS (`docker compose`) |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` (lo fija `docker-compose.yml`) |
| Variables | `backend/.env` | `.env` en la raíz del repo |
| Base de datos | `MONGO_URI` de `backend/.env`; si falta, `mongodb://127.0.0.1:27017/klassy?replicaSet=rs0` | Siempre el contenedor `mongo` (`mongodb://mongo:27017/klassy?replicaSet=rs0`), aunque `.env` diga otra cosa |
| `JWT_SECRET` | cualquiera | obligatorio y distinto del de ejemplo, o el backend no arranca |
| URL de la API en el frontend | `VITE_API_BASE_URL` de `frontend/.env` (`http://localhost:4000/api/v1`) | `/api/v1`: nginx la reenvía al backend (mismo dominio, sin CORS) |
| Archivos subidos | `backend/uploads/` | volumen `uploads` |

La lógica está en `backend/src/config/env.ts`.

## Modo local (desarrollo)

Igual que siempre: ver `README.md`.

```bash
cd backend && cp .env.example .env && npm install && npm run seed && npm run dev
cd frontend && cp .env.example .env && npm install && npm run dev
```

Si no tienes MongoDB instalado, puedes levantar solo el Mongo de Docker:

```bash
docker compose up -d mongo
```

y en `backend/.env` usar `MONGO_URI=mongodb://127.0.0.1:27017/klassy?directConnection=true`
(desde fuera de Docker el replica set no se puede descubrir por el nombre `mongo`; las transacciones funcionan igual).
Este comando necesita que exista el `.env` de la raíz (ver abajo); basta con copiar el de ejemplo.

## Modo VPS (producción)

Requisitos en el servidor: Docker y el plugin `docker compose`.

```bash
git clone https://github.com/Luices08/klassyF.git && cd klassyF
cp .env.produccion.example .env
nano .env              # JWT_SECRET (openssl rand -hex 32), datos del primer ADMIN, PUERTO_WEB
docker compose up -d --build
docker compose run --rm herramientas npm run seed      # solo la primera vez: ADMIN + grados
```

El sitio queda en `http://<ip-del-vps>:<PUERTO_WEB>`. Ingresa con el documento y la contraseña `SEED_ADMIN_*` y cámbiala.

Contenedores:

- `mongo`: MongoDB 7 como replica set de un nodo (Klassy usa transacciones). Datos en el volumen `mongo_datos`.
  Su puerto solo se abre en `127.0.0.1` del servidor: para verlo con Compass usa un túnel SSH
  (`ssh -L 27017:127.0.0.1:27017 usuario@vps`) y `mongodb://127.0.0.1:27017/klassy?directConnection=true`.
- `backend`: la API compilada. No publica puerto; solo la ve nginx.
- `frontend`: nginx con el build de Vite; sirve la app y reenvía `/api` al backend.
- `herramientas` (perfil aparte, no se levanta con `up`): seeds y migraciones.

### Tareas frecuentes

```bash
# Actualizar a la última versión de main
git pull && docker compose up -d --build

# Seeds y migraciones (cualquier script de backend/package.json)
docker compose run --rm herramientas npm run seed:referentes
docker compose run --rm herramientas npm run migrate:estado-por-defecto

# Logs
docker compose logs -f backend

# Respaldo de la base
docker compose exec mongo mongodump --archive --db klassy > respaldo-$(date +%F).archive
```

### HTTPS

nginx del contenedor escucha en HTTP. Para un dominio con certificado, pon delante un proxy
(Caddy, nginx del sistema con certbot, Traefik) apuntando a `PUERTO_WEB` (por ejemplo `PUERTO_WEB=8080`).

### Cuidado

- `docker compose down -v` borra los volúmenes: **la base de datos y los archivos subidos**. Sin `-v` no se pierde nada.
- Los archivos subidos (volumen `uploads`) tienen datos personales: respáldalos junto con la base.
