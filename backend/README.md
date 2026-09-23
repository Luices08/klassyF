# Klassy — Backend (Prompt 1 + Prompt 2 + Prompt 3)

Backend Node.js + **TypeScript** + Express + MongoDB/Mongoose. Implementa:

**Prompt 1 — Núcleo Institucional, RBAC y Matrículas**
1. Autenticación JWT y RBAC estricto (`authenticate`, `checkRole`).
2. Estructura física y académica: institución, sedes, grados, grupos.
3. Años lectivos y calendarios (periodos con validación de suma 100%).
4. Matrículas con control de cupos a prueba de concurrencia (transacciones + update atómico + reintento ante `TransientTransactionError`).

**Prompt 2 — Malla Curricular, Banco de DBA y Planeación Pedagógica**
5. Áreas, asignaturas y malla curricular por grado (`StudyPlanAssignment`) con validación de suma 100% *por área*.
6. Banco de DBA/estándares precargado, filtrable por grado y área.
7. Carga docente (`TeacherAssignment`) con validación de rol e índice único anti-duplicados.
8. Workflow de Desarrollo Curricular (planeación de aula) docente ↔ coordinador: `BORRADOR → ENVIADO_REVISION → APROBADO | DEVUELTO_OBSERVACIONES`, con `historial_revisiones` para trazabilidad.

**Prompt 3 — Actividades, Calificaciones, Asistencia y Motor de Boletines (Decreto 1290)**
9. Actividades por componente SIEE (`Activity`) y entregas/calificaciones (`ActivitySubmission`), con bloqueo extemporáneo por `PeriodLock`.
10. Asistencia diaria por asignatura en lote (`Attendance`).
11. Motor de calificación Decreto 1290: componente → asignatura (Saber 40% + Hacer 40% + Ser 20%) → área (ponderado por malla) → promedio general, con homologación a escala cualitativa.
12. `GET /reports/report-card`: boletín JSON con ranking de grupo (competition ranking, empates comparten puesto).

Este directorio es el paquete `backend/` de un monorepo (`klassyfinal/`); el futuro Prompt 4 añadirá un `frontend/` en React + Vite como hermano de este.

## Requisitos

- Node.js 18+
- MongoDB como **replica set** (las transacciones ACID de Mongoose lo requieren).
  - Local: `mongod --replSet rs0` y luego `mongosh --eval "rs.initiate()"`.
  - O usar MongoDB Atlas (ya es replica set por defecto).

## Instalación

```bash
npm install
cp .env.example .env   # ajustar MONGO_URI, JWT_SECRET, credenciales SEED_*
npm run seed            # crea el primer SUPERADMIN + catálogo de grados (Transición a Once)
npm run dev              # http://localhost:4000  (tsx watch, hot-reload)
```

## Scripts

| Script | Descripción |
| --- | --- |
| `npm run dev` | `tsx watch src/server.ts` — servidor de desarrollo con recarga en caliente. |
| `npm run build` | `tsc` — compila `src/**/*.ts` a `dist/` (JS plano, listo para producción). |
| `npm start` | `node dist/server.js` — ejecuta el build compilado. |
| `npm run seed` | `tsx scripts/seed.ts` — crea el SUPERADMIN inicial y el catálogo de grados. |
| `npm run typecheck` | `tsc --noEmit` — valida tipos de `src/` sin emitir archivos. |
| `npm run typecheck:all` | Igual, pero incluye también `scripts/` (fuera de `rootDir`, por eso usa `tsconfig.scripts.json`). |

## Estructura

```
tsconfig.json          rootDir: ./src, outDir: ./dist, strict: true
tsconfig.scripts.json  type-check adicional para scripts/ (no emite, no toca dist/)
src/
  types/express/       augmentación de Request (req.user: UserDocument)
  config/              env.ts, db.ts
  constants/           enums.ts (fuente única de verdad + union types), roles.ts
  models/              User, Institution, Campus, AcademicYear, Grade, Group, StudentProfile,
                        Enrollment, Counter — cada uno con su interfaz IXxx + XxxDocument
  middlewares/         auth (authenticate/checkRole), validate (Joi), error (centralizado)
  services/            token, folio (auto-incremento atómico), institution (setup transaccional),
                        enrollment (matrícula/retiro a prueba de condiciones de carrera),
                        studyPlan (malla, validación 100% por área), teacherAssignment,
                        curricularDevelopment (workflow docente ↔ coordinador),
                        activity (crear/entregar/calificar), attendance (registro en lote),
                        periodLock (abrir/cerrar + guardia de bloqueo extemporáneo),
                        reportCard (motor de boletines Decreto 1290)
  utils/                ApiError, catchAsync, runTransaction (retry con backoff), siee (desempenoCualitativo, round2)
  constants/           enums.ts, roles.ts, siee.ts (SIEE_WEIGHTS)
  validators/          Joi schemas tipados por recurso
  controllers/         handlers HTTP tipados (Request<Params, ResBody, ReqBody, ReqQuery>)
  routes/               enrutamiento + RBAC por endpoint
scripts/seed.ts
```

Modelos de Prompt 2 (`src/models/`): `Area`, `Subject`, `StudyPlanAssignment`, `DBABank`,
`TeacherAssignment`, `CurricularDevelopment`. Modelos de Prompt 3: `Activity`, `ActivitySubmission`,
`Attendance`, `PeriodLock` — mismo patrón en todos (interfaz `IXxx` + `XxxDocument = HydratedDocument<IXxx>`).

## Flujo de prueba end-to-end (curl)

```bash
BASE=http://localhost:4000/api/v1

# 1) Login como SUPERADMIN (credenciales del seed)
TOKEN=$(curl -s -X POST $BASE/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@klassy.edu.co","password":"ChangeMe123!"}' | jq -r .token)

# 2) Crear usuario RECTOR
RECTOR_ID=$(curl -s -X POST $BASE/users \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"nombre":"Ana","apellido":"Gomez","tipo_documento":"CC","numero_documento":"111","email":"rector@colegio.edu.co","password":"password123","rol":"RECTOR"}' \
  | jq -r .data._id)

# 3) Setup institucional (colegio + sede principal + año lectivo con 4 periodos)
curl -s -X POST $BASE/institution/setup \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{
    \"institucion\": {\"nombre\":\"IE Klassy\",\"codigo_dane\":\"111001000123\",\"nit\":\"900123456-1\",\"resolucion_aprobacion\":\"Res. 001 de 2020\",\"rector_id\":\"$RECTOR_ID\"},
    \"sede_principal\": {\"nombre\":\"Sede Principal\",\"codigo_dane_sede\":\"111001000123\",\"direccion\":\"Cra 1 # 2-34\"},
    \"anio_lectivo\": {\"year\":2026,\"calendario\":\"A\",\"periodos\":[
      {\"numero\":1,\"nombre\":\"Periodo 1\",\"porcentaje\":25,\"fecha_inicio\":\"2026-01-26\",\"fecha_fin\":\"2026-04-03\"},
      {\"numero\":2,\"nombre\":\"Periodo 2\",\"porcentaje\":25,\"fecha_inicio\":\"2026-04-06\",\"fecha_fin\":\"2026-06-19\"},
      {\"numero\":3,\"nombre\":\"Periodo 3\",\"porcentaje\":25,\"fecha_inicio\":\"2026-07-13\",\"fecha_fin\":\"2026-09-25\"},
      {\"numero\":4,\"nombre\":\"Periodo 4\",\"porcentaje\":25,\"fecha_inicio\":\"2026-09-28\",\"fecha_fin\":\"2026-12-04\"}
    ]}
  }"

# 4) Crear un grupo (usando sede_id, academic_year_id, grade_id devueltos arriba / GET /grades manual)
# jornada_id referencia una JornadaOperativa (sede_id + nombre) ya creada; aun no hay endpoint expuesto para crearla.
curl -s -X POST $BASE/groups \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"sede_id":"<sede_id>","academic_year_id":"<academic_year_id>","grade_id":"<grade_id>","jornada_id":"<jornada_id>","nomenclatura":"10-A","cupo_maximo":35}'

# 5) Crear un estudiante y matricularlo
curl -s -X POST $BASE/enrollments \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"student_id":"<student_user_id>","group_id":"<group_id>","academic_year_id":"<academic_year_id>"}'

# 6) Retirar la matrícula (libera el cupo automáticamente)
curl -s -X PATCH $BASE/enrollments/<enrollment_id>/status \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"estado":"RETIRADO"}'
```

## Flujo de prueba Prompt 2 (curl)

```bash
# 1) Area y asignaturas (ejemplo del enunciado: Ciencias Naturales -> Biología/Química/Física)
AREA_ID=$(curl -s -X POST $BASE/curriculum/areas -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"institucion_id":"<institucion_id>","nombre":"Ciencias Naturales y Educación Ambiental","codigo":"CNAT"}' | jq -r .data._id)

BIO_ID=$(curl -s -X POST $BASE/curriculum/subjects -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"area_id\":\"$AREA_ID\",\"nombre\":\"Biología\",\"intensidad_horaria_semanal\":3}" | jq -r .data._id)
# ... (repetir para Química y Física)

# 2) Malla del grado: la suma de porcentaje_en_area debe dar 100 por área
curl -s -X POST $BASE/curriculum/study-plan -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"grade_id\":\"<grade_id>\",\"academic_year_id\":\"<academic_year_id>\",\"asignaciones\":[
    {\"subject_id\":\"$BIO_ID\",\"porcentaje_en_area\":50},
    {\"subject_id\":\"<quimica_id>\",\"porcentaje_en_area\":30},
    {\"subject_id\":\"<fisica_id>\",\"porcentaje_en_area\":20}
  ]}"

# 3) Banco de DBA (carga individual o masiva con array)
curl -s -X POST $BASE/curriculum/dba-bank -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"grade_id\":\"<grade_id>\",\"area_id\":\"$AREA_ID\",\"numero_dba\":1,\"enunciado\":\"...\",\"eje_tematico\":\"Los seres vivos\"}"
curl -s "$BASE/curriculum/dba-bank?grade_id=<grade_id>&area_id=$AREA_ID" -H "Authorization: Bearer $TOKEN"

# 4) Carga docente
TA_ID=$(curl -s -X POST $BASE/teacher-assignments -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"docente_id\":\"<docente_user_id>\",\"group_id\":\"<group_id>\",\"subject_id\":\"$BIO_ID\",\"academic_year_id\":\"<academic_year_id>\",\"horas_semanales\":3}" | jq -r .data._id)

# 5) El docente ve su carga (requiere login como ese docente)
curl -s $BASE/teacher-assignments/my-load -H "Authorization: Bearer $DOCENTE_TOKEN"

# 6) Workflow de planeación de aula: crear borrador -> enviar -> revisar
CD_ID=$(curl -s -X POST $BASE/curricular-developments -H "Authorization: Bearer $DOCENTE_TOKEN" -H "Content-Type: application/json" \
  -d "{\"teacher_assignment_id\":\"$TA_ID\",\"periodo_numero\":1,\"dba_seleccionados\":[],\"competencias\":\"...\",\"metodologia_y_recursos\":\"...\",\"criterios_evaluacion\":\"...\"}" | jq -r .data._id)

curl -s -X PATCH $BASE/curricular-developments/$CD_ID/submit -H "Authorization: Bearer $DOCENTE_TOKEN"

# Coordinador/Rector/Superadmin aprueba o devuelve con observaciones
curl -s -X PATCH $BASE/curricular-developments/$CD_ID/review -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"decision":"DEVUELTO_OBSERVACIONES","observacion":"Falta profundizar en evidencias."}'
```

## Flujo de prueba Prompt 3 (curl)

```bash
# 1) Actividad (Biología, componente Saber, periodo 1)
ACT_ID=$(curl -s -X POST $BASE/activities -H "Authorization: Bearer $DOCENTE_TOKEN" -H "Content-Type: application/json" \
  -d "{\"teacher_assignment_id\":\"$TA_ID\",\"periodo_numero\":1,\"titulo\":\"Quiz 1\",\"descripcion\":\"...\",\"componente_siee\":\"COGNITIVO_SABER\",\"peso_en_componente\":100,\"fecha_apertura\":\"2026-01-10\",\"fecha_entrega\":\"2026-01-20\"}" | jq -r .data._id)

curl -s "$BASE/activities?teacher_assignment_id=$TA_ID&periodo=1" -H "Authorization: Bearer $DOCENTE_TOKEN"

# 2) El estudiante entrega evidencia
curl -s -X POST $BASE/activities/$ACT_ID/submissions -H "Authorization: Bearer $ESTUDIANTE_TOKEN" -H "Content-Type: application/json" \
  -d '{"texto_entrega":"Mi respuesta"}'

# 3) El docente califica (uno o por lote)
curl -s -X PATCH $BASE/activities/$ACT_ID/grade -H "Authorization: Bearer $DOCENTE_TOKEN" -H "Content-Type: application/json" \
  -d "[{\"student_id\":\"<id1>\",\"calificacion_numerica\":4.5},{\"student_id\":\"<id2>\",\"calificacion_numerica\":3.8}]"

# 4) Asistencia en lote
curl -s -X POST $BASE/attendance -H "Authorization: Bearer $DOCENTE_TOKEN" -H "Content-Type: application/json" \
  -d "{\"group_id\":\"<group_id>\",\"subject_id\":\"$BIO_ID\",\"fecha\":\"2026-01-15\",\"periodo_numero\":1,\"registros\":[{\"student_id\":\"<id1>\",\"estado\":\"FALTA_JUSTIFICADA\"}]}"
curl -s "$BASE/attendance?group_id=<group_id>&subject_id=$BIO_ID&fecha=2026-01-15" -H "Authorization: Bearer $DOCENTE_TOKEN"

# 5) Cerrar el periodo para el grupo (bloquea nuevas calificaciones)
curl -s -X PATCH $BASE/periods/lock -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"academic_year_id\":\"<academic_year_id>\",\"periodo_numero\":1,\"group_id\":\"<group_id>\",\"estado\":\"CERRADO\"}"

# 6) Boletín (docente/coordinación pueden consultar cualquiera; el estudiante solo el propio;
#    el acudiente solo el de su estudiante a cargo — ver StudentProfile.acudiente_id)
curl -s "$BASE/reports/report-card?student_id=<id1>&academic_year_id=<academic_year_id>&periodo=1" \
  -H "Authorization: Bearer $TOKEN"
```

## Notas de diseño

- **Concurrencia de cupos**: `Group.findOneAndUpdate` usa `$expr: { $lt: ['$cupos_ocupados', '$cupo_maximo'] } }`
  junto con `$inc`, de modo que la verificación y el incremento son una sola operación atómica de MongoDB.
  Esto se ejecuta dentro de una transacción (`session.startTransaction()`, ver `src/utils/runTransaction.ts`)
  que también crea el documento `Enrollment` y el folio, garantizando que todo se confirme o revierta junto.
- **Reintento de transacciones**: bajo contención real (varias matrículas concurrentes contra el mismo grupo),
  MongoDB puede abortar una transacción con `WriteConflict`/`TransientTransactionError` en vez de resolverlo
  por sí solo. `runTransaction()` reintenta automáticamente con backoff exponencial + jitter — verificado con
  una prueba de estrés de 25 matrículas simultáneas contra un grupo con `cupo_maximo=7`: exactamente 7
  matriculadas, 18 con 409 limpio, cero errores.
- **RBAC contextual**: además del `checkRole` por ruta, `user.controller.ts` aplica una regla de negocio
  adicional — solo `SUPERADMIN` puede crear usuarios con rol `SUPERADMIN` o `RECTOR`.
- **Tipado estricto**: cada modelo Mongoose expone una interfaz `IXxx` (forma del documento) y un tipo
  `XxxDocument = HydratedDocument<IXxx, ...>`. `req.user` está tipado globalmente vía
  `src/types/express/index.d.ts`. Los controladores usan los genéricos de Express
  (`Request<Params, ResBody, ReqBody, ReqQuery>`) a través de `catchAsync<P, ResBody, ReqBody, ReqQuery>`.
- **Enums centralizados** en `src/constants/enums.ts`: arrays `as const` que derivan tanto los valores en
  runtime (para schemas Mongoose y Joi) como los union types de TypeScript (`Rol`, `Jornada`, etc.), para que
  modelos y validadores nunca queden desincronizados.
- **Endpoints de soporte** (`POST/GET /users`, `PUT/GET /users/:userId/student-profile`) no estaban en la
  lista explícita de "endpoints requeridos" del prompt, pero son indispensables para poder ejercitar el
  flujo completo (crear rector/docentes/estudiantes antes de matricular) y para dar acceso al modelo
  `StudentProfile` pedido en el modelado de datos.
- **Prompt 2 — malla por área, no por grado completo**: `POST /curriculum/study-plan` reemplaza atómicamente
  (delete + insert en una transacción) todas las `StudyPlanAssignment` de un `grade_id`+`academic_year_id`,
  agrupa las asignaturas enviadas por su `area_id` (vía `Subject.area_id`) y exige que la suma de
  `porcentaje_en_area` de cada área sea exactamente 100 — así se soporta el caso de varias áreas en una
  sola llamada (ej. Ciencias Naturales 100% + Matemáticas 100% en el mismo request).
- **Prompt 2 — consistencia de DBA**: al crear/editar un borrador, cada id en `dba_seleccionados` se valida
  contra el `grade_id` del `Group` y el `area_id` del `Subject` de la `TeacherAssignment` correspondiente,
  para que un docente no pueda asociar un DBA de otro grado o área.
- **Prompt 2 — endpoints de soporte** (`POST/GET /curriculum/areas`, `POST/GET /curriculum/subjects`): no
  estaban en la lista de "endpoints requeridos", pero sin ellos no hay forma de obtener un `area_id`/`subject_id`
  válido vía API para probar `dba-bank`, `study-plan` o `teacher-assignments` — mismo criterio usado en
  Prompt 1 para `/users`.
- **Prompt 2 — historial_revisiones**: se registra en cada decisión del coordinador, tanto al aprobar como al
  devolver (no solo al devolver), para mantener una traza completa de todo el ciclo de revisión.
- **Prompt 3 — motor de calificación (`src/services/reportCard.service.ts`)**: nota de componente = promedio
  ponderado (por `peso_en_componente`) de las actividades *calificadas* de ese componente — un componente sin
  ninguna actividad calificada aporta 0 (no se excluye ni se renormaliza; ver comentarios en el servicio).
  Nota de asignatura = `Saber*0.4 + Hacer*0.4 + Ser*0.2` (`SIEE_WEIGHTS`, `src/constants/siee.ts`, hoy fijo a
  nivel de plataforma). Nota de área = suma ponderada de asignaturas según `StudyPlanAssignment.porcentaje_en_area`.
  Promedio general = promedio aritmético simple de las notas de área (tal como pide el enunciado). Todos los
  cálculos se verificaron a mano en la suite de pruebas (ver más abajo).
- **Prompt 3 — sin N+1 en el boletín**: calcular el ranking del grupo exige el promedio de *todos* los
  matriculados, no solo del consultado. En vez de repetir el cálculo completo por estudiante (N+1 queries),
  el servicio trae una sola vez las actividades, calificaciones y asistencia del grupo+periodo y hace el
  resto puramente en memoria — el número de queries es constante sin importar el tamaño del grupo.
- **Prompt 3 — ranking**: competition ranking (1, 2, 2, 4): los estudiantes empatados comparten puesto y el
  siguiente puesto salta la cantidad de empatados, tal como pide "en empates, comparten puesto".
- **Prompt 3 — `fallas_asignatura` vs `asistencia_periodo`**: el primero cuenta `FALTA_JUSTIFICADA` +
  `FALTA_INJUSTIFICADA` (no `RETARDO`) de una asignatura puntual; el segundo agrega los 3 conteos de *todas*
  las asignaturas del estudiante en el periodo — una decisión de diseño ante un caso no explícito en el
  enunciado, documentada aquí para que sea fácil de ajustar.
- **Prompt 3 — bloqueo extemporáneo**: `assertPeriodNotLocked` (usada solo al calificar, tal como pide el
  enunciado) trata la *ausencia* de `PeriodLock` como `ABIERTO` — no hace falta pre-crear un registro por
  cada grupo/periodo, solo existe uno cuando alguien lo cierra explícitamente.
- **Prompt 3 — calificar sin entrega previa**: `PATCH /activities/:id/grade` hace upsert de `ActivitySubmission`
  aunque el estudiante nunca haya llamado a `POST .../submissions` (útil para actividades actitudinales sin
  evidencia de archivo). Una vez calificada, `POST .../submissions` queda bloqueado (409) para preservar la
  integridad de la nota ya emitida.

## Siguientes prompts

Prompt 1, Prompt 2 y Prompt 3 dejan el backend con su núcleo funcional completo. El Prompt 4 añadirá
`frontend/` (React + Vite) como paquete hermano de este backend, consumiendo esta API — en particular
`GET /reports/report-card` para la vista de boletín.
