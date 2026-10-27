# Cómo correr las semillas (seeds) de Klassy — paso a paso

Todas las órdenes se corren **desde la carpeta `backend/`**. Las semillas se pueden repetir: si un dato ya existe, se omite y no se duplica.

---

## Paso 1. Tener MongoDB encendido y con réplica

El sistema usa transacciones, y para eso MongoDB debe correr como **réplica** (`rs0`). Si MongoDB está apagado, las semillas fallan con
`ECONNREFUSED 127.0.0.1:27017`.

**Opción A — a mano (Windows, en una terminal que se deja abierta):**

```powershell
& "C:\Program Files\MongoDB\Server\4.4\bin\mongod.exe" --replSet rs0 --dbpath C:\data\db --port 27017 --bind_ip 127.0.0.1
```

Solo la **primera vez** que se usa esa carpeta de datos, en otra terminal, inicia la réplica:

```powershell
& "C:\Program Files\MongoDB\Server\4.4\bin\mongo.exe" --eval "rs.initiate()"
```

Para comprobar que quedó lista (debe responder `PRIMARY`):

```powershell
& "C:\Program Files\MongoDB\Server\4.4\bin\mongo.exe" --quiet --eval "rs.status().members[0].stateStr"
```

> El servicio de Windows «MongoDB» **no** trae la réplica configurada (su `mongod.cfg` tiene `#replication:` comentado).
> Si se prefiere usar el servicio, hay que agregar en ese archivo `replication:` con `replSetName: rs0`, iniciarlo como
> administrador y correr `rs.initiate()` una vez.

**Opción B — con Docker:** `docker compose up -d mongo` desde la raíz del repo (ver `DOCKER.md`).

## Paso 2. Revisar el archivo `.env`

Si no existe `backend/.env`, cópialo del ejemplo:

```powershell
Copy-Item .env.example .env
```

Revisa estas variables:

| Variable | Para qué sirve | Ejemplo |
|---|---|---|
| `MONGO_URI` | La base a la que escriben las semillas | `mongodb://127.0.0.1:27017/klassy_f?replicaSet=rs0` |
| `SEED_ADMIN_NOMBRE`, `SEED_ADMIN_APELLIDO` | Nombre del primer administrador | `Super` / `Admin` |
| `SEED_ADMIN_TIPO_DOCUMENTO`, `SEED_ADMIN_NUMERO_DOCUMENTO` | Con el número de documento se inicia sesión | `CC` / `0000000001` |
| `SEED_ADMIN_EMAIL` | Correo del administrador | `admin@gmail.com` |
| `SEED_ADMIN_PASSWORD` | Contraseña del administrador | `12345678` |

## Paso 3. Instalar dependencias

```powershell
npm install
```

## Paso 4. Semilla base (obligatoria)

Crea el **primer usuario ADMIN** (con los datos `SEED_ADMIN_*`) y el **catálogo de grados** (Pre-jardín a Once).

```powershell
npm run seed
```

Debe terminar con `[seed] Listo.`

## Paso 5. Configurar la institución en la aplicación

Las siguientes semillas necesitan datos que se crean desde la pantalla:

1. Arranca el backend (`npm run dev`) y el frontend (`npm run dev` dentro de `frontend/`).
2. Inicia sesión con el **número de documento** y la contraseña del ADMIN del paso 4.
3. En **Configuración institucional** crea la institución.
4. En **Catálogo académico** crea las áreas (las asignaturas del paso 6 se cuelgan de ellas por su código, p. ej. `MAT-BAS`, `ED-ART`).

## Paso 6. Asignaturas complementarias (opcional)

Carga las asignaturas de las 9 áreas obligatorias (Ley 115). Si un área todavía no existe, avisa
«Área con código … no encontrada. Se omite» y sigue con las demás.

```powershell
npm run seed:subjects
```

## Paso 7. Tipos de documento de titulación (opcional)

Crea en **borrador** el acta de grado, el diploma de bachiller y la constancia de culminación (M26). Secretaría ajusta el texto y el
administrador los activa.

```powershell
npm run sembrar:tipos-titulacion
```

## Paso 8. Datos de demostración completos (opcional, solo local)

`npm run seed:demo` (`scripts/seedDemoCompleto.ts`) llena **la misma base del `.env`** con un colegio de prueba: institución, sede,
jornada, grados 6° a 11° con 24 grupos, año lectivo en curso, plan de estudios, 45 docentes, un estudiante por grupo y usuarios de gestión.

```powershell
npm run seed:demo
```

Usuarios que crea:

| Rol | Documento | Contraseña |
|---|---|---|
| ADMIN (solo si no existe ya uno) | `1000000001` | `Admin12345` |
| COORDINADOR | `1000000002` | `Coord12345` |
| SECRETARIA | `1000000003` | `Secre12345` |
| Docentes | su número de documento | su número de documento |

> ⚠️ Este archivo no está en el repositorio (lo excluye `.gitignore`); solo existe en los equipos donde se creó.
> No lo corras sobre una base con datos reales: le agrega todo el colegio de prueba.

## Paso 9. Simulación de varios años (opcional, base aparte)

Para tener un colegio con 2024, 2025 y 2026 completos (notas, asistencia, convivencia, promoción) en una base **separada** (`klassy_sim`):

```powershell
npm run sim
```

La guía completa está en `scripts/simulacion/LEEME.md`.

---

## Migraciones después de bajar cambios

Cuando un `git pull` trae un script `migrate:*`, se corre **primero sin `--aplicar`** (solo muestra lo que cambiaría) y, si hay algo que
cambiar, se hace un respaldo de Mongo (`mongodump`) y se aplica:

```powershell
npm run migrate:retirar-campos-convivencia                 # simula
npm run migrate:retirar-campos-convivencia -- --aplicar    # escribe
```

## Problemas frecuentes

| Mensaje | Causa | Solución |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:27017` | MongoDB está apagado | Paso 1 |
| El script se queda colgado o `ReplicaSetNoPrimary` | MongoDB corre sin réplica o no se inició `rs.initiate()` | Paso 1 (réplica) |
| `[seed] ADMIN ya existe … se omite` | Ya se había corrido | Normal: no es un error |
| `Área con código … no encontrada` | Falta crear esa área, o se creó con otro código (`seed:subjects` busca `MAT-BAS`, `ED-ART`, `EF-REC`, `ET-VAL`, `ED-REL`, `CS-HGD`, `TEC-INF`) | Paso 5 con esos códigos y repetir el paso 6 |
| No se puede iniciar sesión | Se usa el correo | El inicio de sesión es con el **número de documento** |
