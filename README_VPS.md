# Klassy en el VPS — paso a paso

Todas las órdenes se corren **en el VPS, desde la raíz del repo** (`~/repositories/klassyF`). Los scripts del backend se corren
dentro del contenedor `herramientas`: `docker compose run --rm herramientas npm run <script>`.

> **Regla de oro:** después de cada `git pull` hay que reconstruir `herramientas` (`docker compose build herramientas`).
> El contenedor usa una copia del código; si no se reconstruye, sale `Missing script: "…"` o corre una versión vieja.

---

## Paso 0. Entrar a la carpeta y traer la última versión

```bash
cd ~/repositories/klassyF
git pull --ff-only
```

## Paso 1. Revisar el `.env` de la raíz

Solo la primera vez se crea a partir del ejemplo:

```bash
cp .env.produccion.example .env
nano .env
```

Lo mínimo que debe tener:

| Variable | Qué poner |
|---|---|
| `JWT_SECRET` | El resultado de `openssl rand -hex 32` (obligatorio, si no el backend no arranca) |
| `CERT_HMAC_SECRET` | Otro `openssl rand -hex 32`. **No cambiarlo después** de expedir certificados |
| `MONGO_DB` | `klassy` (la base de trabajo) |
| `PUERTO_WEB` | `80`, o el puerto que se use |
| `SEED_ADMIN_*` | Datos del primer administrador (se inicia sesión con `SEED_ADMIN_NUMERO_DOCUMENTO`) |
| `PUBLIC_URL`, `DOMINIO` | Opcionales: la dirección pública y el dominio para HTTPS |

## Paso 2. Construir y levantar el sistema

```bash
./deploy/levantar.sh
docker compose build herramientas
```

Comprobar que los contenedores `mongo`, `backend` y `frontend` estén `Up`:

```bash
docker compose ps
```

## Paso 3. Semilla base (primer ADMIN y catálogo de grados)

```bash
docker compose run --rm herramientas npm run seed
```

Debe terminar con `[seed] Listo.` Si dice `ADMIN ya existe … se omite`, es normal (ya se había corrido).

## Paso 4. Crear el colegio Los Corazones (año 2026)

Antes, revisar los datos reales (DANE, NIT, resolución, dirección, ciudad y departamento) en
`backend/scripts/colegio/los-corazones.json`. Si se edita, reconstruir `herramientas` antes de correrlo:

```bash
nano backend/scripts/colegio/los-corazones.json
docker compose build herramientas
docker compose run --rm herramientas npm run crear:colegio
```

Crea la institución, la sede, la jornada con sus franjas, los grados activos, el año lectivo 2026 con 4 periodos, el calendario, la
escala, el molde de la planilla y las áreas con sus asignaturas. Se puede repetir: completa lo que falte y no duplica.

## Paso 5. Migraciones y catálogos del sistema

Con respaldo automático antes:

```bash
./deploy/migrar.sh              # primero: solo muestra lo que haría
./deploy/migrar.sh --aplicar    # después: aplica
```

Sin el atajo (equivalente):

```bash
./deploy/respaldar.sh
docker compose run --rm herramientas npm run migrar
docker compose run --rm herramientas npm run migrar -- --aplicar
```

## Paso 6. Entrar a la aplicación

Abrir `http://<ip-del-vps>` (o el dominio) e iniciar sesión con el **número de documento** y la contraseña de `SEED_ADMIN_*`.
Cambiar la contraseña al entrar.

## Paso 7. Cargar personas y matrículas (desde la aplicación)

En este orden:

1. **Grupos**: los cursos de 2026 (grado, sede, jornada, nombre y cupo).
2. **Plan de estudios**: horas semanales por asignatura y grado.
3. **Usuarios**: coordinación, secretaría y docentes.
4. **Estudiantes** con su acudiente (uno a uno o por CSV).
5. **Matrículas → «Libro y folios»**: confirmar cómo numera el colegio su libro de matrícula.

## Paso 8. Matricular a los estudiantes ya cargados (opcional)

```bash
docker compose run --rm herramientas npm run matricular:estudiantes                # simula: muestra a quién y en qué grupo
docker compose run --rm herramientas npm run matricular:estudiantes -- --aplicar   # matricula
```

Para un solo grado: agregar `--grado=6`. Las matrículas nacen condicionales y pasan a definitiva al aprobar los documentos.

---

## Paso 9. Simulación de varios años (opcional, base aparte)

Llena una base **separada**, `klassy_sim`, con un colegio ficticio y su historia: 2024 y 2025 completos y cerrados, y 2026 hasta hoy.
**Nunca toca la base de trabajo `klassy`**. Tarda varias horas.

Debe estar en el `.env` (ya viene en el ejemplo):

```bash
SIM_MONGO_URI=mongodb://mongo:27017/klassy_sim?replicaSet=rs0
SIM_UPLOADS_DIR=/app/uploads
SIM_RESPALDOS_DIR=/app/respaldos-sim
SIM_ADMIN_PASSWORD=KlassySim2024*
SIM_USUARIOS_PASSWORD=Klassy2024*
```

Correrla (en el VPS siempre con `--sin-respaldo`, porque la imagen no trae `mongodump`):

```bash
docker compose build herramientas
docker compose run --rm herramientas npm run sim -- --listar          # ver las fases y cuáles faltan
docker compose run --rm herramientas npm run sim -- --sin-respaldo    # corre todas las que falten
```

Para que no se corte si se cierra la conexión SSH, correrla en segundo plano y ver el avance en un archivo:

```bash
nohup docker compose run --rm -T herramientas npm run sim -- --sin-respaldo > sim.log 2>&1 &
tail -f sim.log          # Ctrl+C solo deja de mirar; la simulación sigue
```

Si se interrumpe, se vuelve a correr la misma orden y sigue desde la fase que faltaba. Para repetir desde una fase:

```bash
docker compose run --rm herramientas npm run sim -- --sin-respaldo --desde=2025/periodo-1 --rehacer
```

**Ver el colegio simulado en la aplicación:** en el `.env` cambiar `MONGO_DB=klassy_sim` y reiniciar el backend:

```bash
nano .env                       # MONGO_DB=klassy_sim
docker compose up -d backend
```

- ADMIN: documento `1000000001` y la contraseña `SIM_ADMIN_PASSWORD`.
- Los demás usuarios: su número de documento y la contraseña `SIM_USUARIOS_PASSWORD`.
- Para volver al colegio real: `MONGO_DB=klassy` y otra vez `docker compose up -d backend`.

> Los PDF que genera la simulación (planes, entregas, soportes) se guardan en la misma carpeta de archivos del backend (volumen `uploads`),
> así que se pueden descargar desde la aplicación. Una simulación corrida antes de este cambio no los guardó: hay que repetirla para tenerlos.

---

## Cada vez que se suben cambios nuevos

```bash
cd ~/repositories/klassyF
./deploy/actualizar.sh          # git pull + reconstruye y reinicia
docker compose build herramientas
./deploy/migrar.sh              # revisar lo que muestra
./deploy/migrar.sh --aplicar
```

## Órdenes útiles

```bash
docker compose logs -f backend                                       # ver errores del backend (Ctrl+C para salir)
./deploy/respaldar.sh                                                # respaldo de la base y de uploads/
docker compose run --rm herramientas npm run reset-admin-password    # recuperar el acceso del ADMIN
docker compose restart backend                                       # reiniciar solo el backend
```

## Problemas frecuentes

| Mensaje | Solución |
|---|---|
| `Missing script: "…"` | `docker compose build herramientas` |
| `Falta .env` | Paso 1 |
| El backend se reinicia solo | `docker compose logs backend`: casi siempre falta `JWT_SECRET` o `CERT_HMAC_SECRET` |
| `Esta instalación ya tiene otra institución` | Ya hay un colegio creado: hay una sola institución por instalación |
| `Configura primero la institución…` | Correr el paso 4 y repetir el paso 5 |
| No se puede iniciar sesión | Se entra con el número de documento, no con el correo |

La lista completa de scripts está en `backend/README_SEMILLAS.md`.
