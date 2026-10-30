# Cómo correr los scripts de Klassy — paso a paso

Todas las órdenes se corren **desde la carpeta `backend/`**. Casi todos los scripts se pueden repetir: si un dato ya existe, se omite y
no se duplica. Los que borran o cambian datos lo dicen en su paso y **simulan** por defecto (escriben solo con `--aplicar`).

En el VPS (Docker) cada orden se antepone con `docker compose run --rm herramientas` desde la raíz del repo, y después de cada
`git pull` hay que reconstruir la imagen (`docker compose build herramientas`): el contenedor usa una copia del código, no la carpeta.

```bash
docker compose build herramientas
docker compose run --rm herramientas npm run seed
```

---

## Paso 1. Tener MongoDB encendido y con réplica

El sistema usa transacciones, y para eso MongoDB debe correr como **réplica** (`rs0`). Si MongoDB está apagado, los scripts fallan con
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
>
> MongoDB 4.4 no admite algunos índices parciales del sistema (`matricula_viva_unica`): `npm run migrar` falla en
> `migrate:folio-al-matricular` con «unsupported expression in partial index». En el VPS (MongoDB 7) no pasa.

**Opción B — con Docker:** `docker compose up -d mongo` desde la raíz del repo (ver `DOCKER.md`).

## Paso 2. Revisar el archivo `.env`

Si no existe `backend/.env`, cópialo del ejemplo:

```powershell
Copy-Item .env.example .env
```

Revisa estas variables:

| Variable | Para qué sirve | Ejemplo |
|---|---|---|
| `MONGO_URI` | La base a la que escriben los scripts | `mongodb://127.0.0.1:27017/klassy_f?replicaSet=rs0` |
| `SEED_ADMIN_NOMBRE`, `SEED_ADMIN_APELLIDO` | Nombre del primer administrador | `Super` / `Admin` |
| `SEED_ADMIN_TIPO_DOCUMENTO`, `SEED_ADMIN_NUMERO_DOCUMENTO` | Con el número de documento se inicia sesión | `CC` / `0000000001` |
| `SEED_ADMIN_EMAIL` | Correo del administrador | `admin@gmail.com` |
| `SEED_ADMIN_PASSWORD` | Contraseña del administrador | `12345678` |

Solo si vas a usar la **simulación** (paso 10), agrega al final del `.env`:

```bash
# --- Simulacion multi-año (npm run sim) ---
# Base APARTE con el colegio ficticio y su historia; el nombre debe contener "sim" (nunca toca la base de trabajo).
SIM_MONGO_URI=mongodb://127.0.0.1:27017/klassy_sim?replicaSet=rs0
# Archivos que genera (PDF de planes, entregas, soportes). Para verlos: UPLOADS_DIR=uploads-sim al arrancar el backend.
SIM_UPLOADS_DIR=uploads-sim
# Respaldo por fase (necesita mongodump; sin el, correr con --sin-respaldo).
SIM_RESPALDOS_DIR=respaldos-sim
# Contraseñas: ADMIN (documento 1000000001) y todos los demas (su numero de documento).
SIM_ADMIN_PASSWORD=KlassySim2024*
SIM_USUARIOS_PASSWORD=Klassy2024*
```

> El `.env` no se sube a GitHub (está en `.gitignore`): cada equipo y el VPS tienen el suyo.

## Paso 3. Instalar dependencias

```powershell
npm install
```

---

## Instalación nueva: los scripts en orden

### Paso 4. Semilla base (obligatoria)

Crea el **primer usuario ADMIN** (con los datos `SEED_ADMIN_*`) y el **catálogo de grados** (Pre-jardín a Once).

```powershell
npm run seed
```

Debe terminar con `[seed] Listo.`

### Paso 5. Crear el colegio (Colegio Los Corazones, año 2026)

Crea por la API, con el ADMIN del paso 4: la institución, la sede principal, la jornada de la mañana con sus franjas, los 14 grados
activos, el **año lectivo 2026** en planificación con sus 4 periodos (19-ene a 20-nov), el calendario (festivos, Semana Santa,
vacaciones, receso de octubre, ventanas de recuperación), la escala de 1.0 a 5.0, el molde de la planilla y 18 áreas con 23 asignaturas.

```powershell
npm run crear:colegio
```

- Los datos están en `scripts/colegio/los-corazones.json`: **antes de correrlo**, cambia ahí el DANE, el NIT, la resolución, la dirección,
  la ciudad y el departamento reales. Otro colegio: `npm run crear:colegio -- --config=<ruta.json>`.
- Si la instalación ya tiene **otra** institución, se detiene (hay una sola por instalación). Si ya tiene esta, completa lo que falte.
- No crea personas, grupos ni plan de estudios: eso se hace desde la aplicación (o con el paso 8).

Si prefieres crear la institución a mano, en la aplicación: **Configuración institucional** → institución; **Catálogo académico** → áreas.

### Paso 6. Migraciones y catálogos del sistema

Corre en orden la semilla base y todas las migraciones (las que pueden borrar algo solo **simulan**):

```powershell
npm run migrar                  # revisa lo que muestra
npm run migrar -- --aplicar     # además aplica matricula-unica, lideres-de-area y documentos-antiguos
```

En el VPS hay un atajo que primero respalda la base: `bash deploy/migrar.sh` y `bash deploy/migrar.sh --aplicar`.

`migrate:retirar-banco-curricular` borra colecciones: `migrar` solo la simula. Para aplicarla, a mano y con respaldo:
`npm run migrate:retirar-banco-curricular -- --aplicar`.

### Paso 7. Tipos de documento de titulación (opcional)

Crea en **borrador** el acta de grado, el diploma de bachiller y la constancia de culminación (M26). Necesita la institución creada.
`migrar` ya lo incluye; solo hace falta si no corriste el paso 6.

```powershell
npm run sembrar:tipos-titulacion
```

### Paso 8. Personas y matrículas (desde la aplicación)

Con el colegio creado, en la aplicación y en este orden:

1. **Grupos**: los cursos del año 2026 (grado, sede, jornada, nombre y cupo).
2. **Plan de estudios**: horas semanales de cada asignatura por grado.
3. **Usuarios**: coordinación, secretaría y docentes (uno a uno o con la carga por CSV).
4. **Estudiantes**: con el asistente o con la carga masiva por CSV (incluye al acudiente).
5. **Matrículas**: en **Matrículas → «Libro y folios»** confirma primero cómo numera el colegio su Libro de Matrícula; luego matricula
   uno a uno, o a todos los que aún no tienen matrícula con el script:

```powershell
npm run matricular:estudiantes                          # simula: muestra a quién y en qué grupo
npm run matricular:estudiantes -- --aplicar             # matricula
npm run matricular:estudiantes -- --grado=6 --aplicar   # solo los grupos de sexto
```

Las matrículas nacen **condicionales** (plazo de compromiso de 30 días, `--dias-compromiso=`) y pasan a definitiva al aprobar sus
documentos. El script solo matricula a estudiantes que ya existen; no los crea.

### Paso 9. Asignaturas complementarias (opcional, solo si NO usaste el paso 5)

Carga asignaturas de las 9 áreas obligatorias (Ley 115) buscando las áreas por los códigos `MAT-BAS`, `ED-ART`, `EF-REC`, `ET-VAL`,
`ED-REL`, `CS-HGD`, `TEC-INF`. El paso 5 usa otros códigos (`MAT`, `HUM`, `ART`…), así que con él este paso no encuentra las áreas y no
hace falta.

```powershell
npm run seed:subjects
```

---

## Datos de prueba

### Paso 10. Simulación de varios años (opcional, base aparte)

Llena una base **separada** (`klassy_sim`, la de `SIM_MONGO_URI`) con un colegio ficticio y su historia: 2024 y 2025 completos y cerrados
(matrículas, notas, asistencia, convivencia, recuperaciones, promoción, graduados, rematrícula) y 2026 hasta hoy. **Nunca toca la base de
trabajo**: se niega si el nombre de la base no contiene `sim` o si tiene usuarios que no creó. Tarda varias horas.

```powershell
npm run sim -- --listar          # muestra las fases
npm run sim                      # corre todas las que falten (necesita mongodump para el respaldo por fase)
npm run sim -- --sin-respaldo    # sin mongodump: si se corta, hay que repetir desde el inicio
```

Para ver el colegio simulado en la aplicación, arranca el backend apuntando a esa base y a sus archivos:

```powershell
$env:MONGO_URI="mongodb://127.0.0.1:27017/klassy_sim?replicaSet=rs0"; $env:UPLOADS_DIR="uploads-sim"; npm run dev
```

ADMIN: documento `1000000001` y `SIM_ADMIN_PASSWORD`; los demás, su documento y `SIM_USUARIOS_PASSWORD`. La guía completa (fases,
`--desde`, `--rehacer`, `--corte`) está en `scripts/simulacion/LEEME.md`.

Después de la simulación, dos scripts que solo **leen** `klassy_sim`:

```powershell
npm run sim:exportar               # tabla estudiante × corte para el módulo predictivo, en exportacion-sim/
npm run predictivo:modelo-demo     # reentrena el modelo de demostración y reescribe src/modulos/predictivo/modeloDemostracion.ts
```

### Paso 11. Datos de demostración completos (opcional, solo local)

`npm run seed:demo` (`scripts/seedDemoCompleto.ts`) llena **la misma base del `.env`** con un colegio de prueba: institución, sede,
jornada, grados 6° a 11° con 24 grupos, año lectivo en curso, plan de estudios, 45 docentes, un estudiante por grupo y usuarios de gestión.
**No lo combines con el paso 5** (crea su propia institución).

```powershell
npm run seed:demo
```

| Rol | Documento | Contraseña |
|---|---|---|
| ADMIN (solo si no existe ya uno) | `1000000001` | `Admin12345` |
| COORDINADOR | `1000000002` | `Coord12345` |
| SECRETARIA | `1000000003` | `Secre12345` |
| Docentes | su número de documento | su número de documento |

> No lo corras sobre una base con datos reales: le agrega todo el colegio de prueba.

---

## Mantenimiento

| Script | Qué hace | Cuidado |
|---|---|---|
| `npm run reset-admin-password` | Pone al ADMIN más antiguo la contraseña `SEED_ADMIN_PASSWORD` del `.env` e imprime su documento | Solo para recuperar el acceso |
| `npm run notificar:diario` | Lanza a mano los avisos del calendario (cierre de periodo, recuperaciones, actividades del día) | El servidor ya los corre solo una vez al día |
| `npm run storage:purge-periodo -- --periodoId=<id> [--olderThanDays=30] [--dry-run]` | Borra los archivos de entregas de un periodo **cerrado** (deja nota, fechas y estado) | **Irreversible**: corre primero `--dry-run` y respalda `uploads/` |
| `npm run reset:planificacion` | Devuelve el año **2026** a planificación y **borra** sus actividades, entregas, notas y asistencia (deja un respaldo JSON) | **Destructivo**: solo en desarrollo |

## Migraciones después de bajar cambios

Lo normal es correr `npm run migrar` (paso 6), que las incluye todas en orden. Si un `git pull` trae una sola migración nueva y quieres
correrla aparte: **primero sin `--aplicar`** (solo muestra lo que cambiaría) y, si hay algo que cambiar, respaldo de Mongo (`mongodump`) y:

```powershell
npm run migrate:retirar-campos-convivencia                 # simula
npm run migrate:retirar-campos-convivencia -- --aplicar    # escribe
```

Migraciones que existen hoy (todas dentro de `migrar`): `superadmin-to-admin`, `roles-multiples`, `estado-por-defecto`,
`m05-anio-lectivo`, `folio-al-matricular`, `anio-repetible`, `certificados-sede`, `requisitos-documentales`, `retirar-campos-convivencia`,
`matricula-unica`, `lideres-de-area`, `documentos-antiguos` y `retirar-banco-curricular`.

## Problemas frecuentes

| Mensaje | Causa | Solución |
|---|---|---|
| `ECONNREFUSED 127.0.0.1:27017` | MongoDB está apagado | Paso 1 |
| El script se queda colgado o `ReplicaSetNoPrimary` | MongoDB corre sin réplica o no se inició `rs.initiate()` | Paso 1 (réplica) |
| `Missing script: "…"` en el VPS | La imagen de `herramientas` es anterior al `git pull` | `docker compose build herramientas` |
| `[seed] ADMIN ya existe … se omite` | Ya se había corrido | Normal: no es un error |
| `Configura primero la institución antes de expedir certificados` | `sembrar:tipos-titulacion` sin institución | Paso 5 y repetir `migrar` |
| `Esta instalación ya tiene otra institución` | `crear:colegio` sobre una base con otro colegio | Hay una sola institución por instalación |
| `unsupported expression in partial index` | MongoDB 4.4 local | Normal en local; en el VPS no pasa |
| `La base de la simulación debe tener «sim» en su nombre` | `SIM_MONGO_URI` apunta a la base de trabajo | Usa `…/klassy_sim?replicaSet=rs0` |
| `Área con código … no encontrada` | `seed:subjects` con áreas de otros códigos | Ver paso 9 |
| No se puede iniciar sesión | Se usa el correo | El inicio de sesión es con el **número de documento** |
