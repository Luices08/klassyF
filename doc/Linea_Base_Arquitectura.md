# Línea base de la refactorización de arquitectura (fase 0)

Punto de partida contra el que se comparan las fases 1–6 de `doc/Analisis_Arquitectura_Klassy.md`.
Commit de referencia: `f41d3d0` sobre `main` en `69856a3` (v0.16.0) · 2026-10-06.

## 1. Estado de los checks

| Check | Resultado |
|---|---|
| Backend `npm run typecheck:all` | ✅ sin errores |
| Backend `npm run lint` | ✅ sin avisos |
| Frontend `npm run lint` | ✅ sin errores, **18 avisos** (12 `StudyPlanPage`, 3 `DesarrolloCurricularPage`, 1 `Alert`, 1 `Badge`, 1 `AuthContext`) |
| Frontend `npm run build` | ✅ un solo chunk JS de 859 kB (aviso de >500 kB: no hay división de código) |
| Backend `npm test` — pruebas unitarias | ✅ 12 archivos, 127 pruebas |
| Backend `npm test` — pruebas de integración | ⚠️ **120 pruebas en 8 archivos sin ejecutar en esta línea base** (ver §2) |

## 2. Hallazgos sobre las pruebas (hay que cerrarlos antes de mover código)

1. **El CI no ejecutaba `npm test`.** `.github/workflows/ci.yml` solo corría lint, typecheck y build. Las 22 pruebas (incluidas las 8 de
   integración) no protegían ningún PR. La fase 0 agrega un job `Backend (Pruebas)`.
2. **Las pruebas de integración no se pudieron ejecutar en el entorno cloud de la sesión**: `mongodb-memory-server` descarga el binario
   de MongoDB desde `fastdl.mongodb.org`, que la política de red de ese entorno bloquea (HTTP 403). Quedan sin verificar localmente
   las 120 pruebas de `tests/integracion/` (casos, comité, importación, inclusión, observaciones, orientación, retención y seguridad).
   - Para ejecutarlas en cloud hay que permitir `fastdl.mongodb.org` (y `downloads.mongodb.org`) en el acceso de red del entorno.
   - En una máquina local o en el runner de GitHub no hay restricción: la primera ejecución descarga el binario.
3. **`seguridad.int.test.ts` necesita `MONGO_URI` y `JWT_SECRET` en el entorno al importarse** (`config/env.ts` falla en la importación
   estática de `token.service`), aunque la prueba los fije después. En local salen del `.env`; en CI se declaran en el job.

**Criterio para pasar a la fase 2 (mover código):** las 20 suites en verde al menos una vez en CI sobre `main` antes del primer movimiento.

## 3. Métricas (reproducibles)

Se miden desde la raíz del repo. Son las que cada fase debe mejorar; la columna "Meta" indica hacia dónde deben moverse.

| Métrica | Línea base | Meta | Comando |
|---|---|---|---|
| Archivos / líneas backend `src` | 229 / 27.358 | — | `find backend/src -type f \| wc -l` |
| Archivos / líneas frontend `src` | 148 / 28.280 | — | `find frontend/src -type f \| wc -l` |
| Llamadas directas `Institution.findOne(` | 23 en 15 archivos | 1 (el proveedor) | `grep -rE 'Institution\.findOne\(' backend/src` |
| Consultas `AcademicYear.findOne({estado:'EN_CURSO'})` | 10 en 6 archivos | 1 (el proveedor) | `grep -rE "AcademicYear\.findOne\(\{ ?estado: ?'EN_CURSO'" backend/src` |
| Controladores que importan modelos | 10 de 31 | 0 | `grep -lE "from '\.\./models/" backend/src/controllers/*.ts` |
| Controladores que importan `mongoose` | 3 | 0 | `grep -lE "from 'mongoose'" backend/src/controllers/*.ts` |
| Controladores con `throw new ApiError` (negocio) | 24 de 31 | solo validación HTTP | `grep -l 'throw new ApiError' backend/src/controllers/*.ts` |
| Modelos importados por `user.controller` | 14 | 0 | `grep -cE "from '\.\./models/" backend/src/controllers/user.controller.ts` |
| Servicios de convivencia que importan `attendance.service` | 5 | 0 | `grep -lE "from './attendance.service'" backend/src/services/{caso,comite,observacion,remisionOrientacion,retencion}.service.ts` |
| `registro` (matrícula/admisión) que importa `solicitudApoyo.service` | 2 | 0 (vía puerto) | `grep -lE 'solicitudApoyo.service' backend/src/services/{enrollment,admissionRequest}.service.ts` |
| Arrays de roles declarados en rutas | 11 | 0 (`permisos.ts` por dominio) | `grep -cE '^const [A-Z_]+: Rol\[\]' backend/src/routes/*.ts` |
| Acciones en el enum central de auditoría | 127 líneas | enum por dominio | `awk '/ACCIONES_AUDITORIA = \[/,/\] as const/' backend/src/models/auditLog.model.ts \| grep -c "'"` |
| Páginas ≥ 300 líneas | 17 (10.370 líneas) | 0 | `wc -l frontend/src/pages/*.tsx frontend/src/pages/admin/*.tsx frontend/src/pages/public/*.tsx` |
| Componentes `ui/` que importan hooks o tipos de dominio | 1 (`Badge.tsx`) | 0 | `grep -lE "from '\.\./\.\./(hooks\|types/domain)" frontend/src/components/ui/*.tsx` |
| Tipos exportados desde `hooks/` | 158 | 0 (tipos por dominio) | `grep -hE '^export (interface\|type) ' frontend/src/hooks/*.ts \| wc -l` |
| Líneas de `types/domain.ts` | 993 | repartido por dominio | `wc -l frontend/src/types/domain.ts` |
| Comparaciones directas de rol (`rol ===` / `rol !==`) en frontend | 25 | derivadas del manifiesto | `grep -rE "rol ===\|rol !==" frontend/src/pages frontend/src/components frontend/src/hooks` |

## 4. Mapa de dependencias entre servicios (instantánea)

Servicios que importan a otros servicios, fuera de `audit.service` (que casi todos usan). Una flecha `→` significa "importa de".
Las marcadas con ⚠️ cruzan hoy los límites de los dominios propuestos.

```
caso            → attendance ⚠️ · convivenciaCatalogo · observacion · remisionOrientacion
comite          → attendance ⚠️ · caso · convivenciaCatalogo
observacion     → attendance ⚠️ · convivenciaCatalogo
remisionOrient. → attendance ⚠️
retencion       → attendance ⚠️ · convivenciaCatalogo
enrollment      → folio · solicitudApoyo ⚠️ (registro → bienestar)
admissionReq.   → preinscripcionPublica · solicitudApoyo ⚠️ (registro → bienestar)
periodLock      → academicYear · periodoProrroga
curricularDev.  → academicYear
teacherAssign.  → academicYear · institution
studyPlan       → institution · planEstudiosDependencias
reportCard      → attendanceStats
attendance*     → attendance · attendanceState · attendanceStats
inclusion*      → inclusionContexto · expedienteInclusion (hub propio)
```

No hay ciclos entre servicios. Los cruces ⚠️ son los que corrigen las fases 1 y 3.

## 5. Reglas de la refactorización (se mantienen en todas las fases)

- Cada fase es un PR corto con ramas `refactor/faseN-<tema>` creadas desde `main` actualizado; no hay rama paraguas.
- Cada PR deja en verde backend (`typecheck:all`, `lint`, `npm test`) y frontend (`lint`, `build`).
- Las fases 0–1 y 3 no cambian el comportamiento; las fases de movimiento (2, 4) solo cambian rutas de archivo e imports (`git mv`).
- Durante las fases 2 y 4 se congela el trabajo en módulos nuevos hasta fusionar cada PR.
- No se renombran identificadores existentes; las carpetas nuevas van en español.

## 6. Avance por fase

### Fase 1 — proveedores únicos y utilidades compartidas (`refactor/fase1-nucleo`)

Sin cambio de comportamiento ni de carpetas (los archivos se mueven en la fase 2). Se crearon los puntos únicos y se reemplazaron los usos duplicados:

| Qué | Dónde queda | Antes → después |
|---|---|---|
| Lectura de la institución | `buscarInstitucion()` / `exigirInstitucion(mensaje, estado?)` en `institution.service.ts` | 23 llamadas directas en 15 archivos → 1 (el proveedor) |
| Año lectivo en curso | `buscarAnioEnCurso()` / `exigirAnioEnCurso(mensaje)` en `academicYear.service.ts` | 10 consultas en 6 archivos → 1 (el proveedor) |
| Fechas de Colombia | `utils/tiempo.ts` (`hoyColombia`, `fechaDeClase`, `diaIso`) | vivían en `attendance.service`; convivencia ya no depende de asistencia (5 → 0) |
| Contexto de calendario de un grupo | `services/calendarioContexto.service.ts` (`cargarContextoFechas`, `periodoDeFecha`) | vivía en `attendance.service`; lo usaban asistencia y observador |
| Base de PDF | `utils/pdf.ts` (`COLOR`, `Documento`, `bufferDeDocumento`) | 3 paletas y 3 bloques idénticos de stream → Buffer → 1 |

Cada llamador conserva su mensaje de error (la sustitución no cambia el texto ni el código HTTP). Decisiones:

- **No se abstrajo "obtener o crear la configuración"** (convivencia e inclusión): son dos usos de ~10 líneas con modelos distintos; por YAGNI se deja hasta que aparezca un tercero.
- **No se tocaron** `actaCompromiso` ni `comprobantePreinscripcion` (PDF de 80 líneas con otro patrón: crean el documento dentro de la promesa); los reemplazará M21/M29.
- `asistenciaPdf.service` conserva su paleta ampliada porque ahora es la paleta común (`utils/pdf.ts`), con los mismos valores hexadecimales de antes.

### Fase 2 — dominio `bienestar` (`refactor/fase2-bienestar`)

Solo cambian carpetas e imports (59 archivos movidos con `git mv`, 402 imports reescritos con un script que resuelve cada import y recalcula su ruta
relativa; el historial de Git conserva los renombres). Ningún identificador ni ruta HTTP cambió.

| Qué | Resultado |
|---|---|
| Ubicación | `backend/src/dominios/bienestar/{observador, convivencia, comite, orientacion, inclusion, comun}` |
| Puerta pública | `dominios/bienestar/index.ts` (`rutasBienestar`, `crearDesdeMatricula`) |
| Consumidores externos del dominio | `routes/index.ts` y, por ahora, matrícula y admisión (la inversión `registro` → `bienestar` que corrige la fase 3) |
| Equivalencia de rutas | La tabla de rutas de Express (294 entradas, con el número de manejadores de cada una) es idéntica antes y después |
| Convención nueva | Los archivos de constantes que se mueven llevan el sufijo `.constants.ts` (hubo un choque `constants/inclusion.ts` / `utils/inclusion.ts`) |
| Se quedó fuera | `datosSensibles`, `counter.model`, `csv`, `importacion`, `firmasArchivo` y `uploadPaths` (los usan otros dominios; irán al núcleo) |

### Fase 2 — dominio `institucional` (`refactor/fase2-institucional`)

50 archivos movidos con `git mv` y 337 imports reescritos (mismo método que `bienestar`). La tabla de rutas de Express es idéntica como conjunto
(294 entradas); el orden de registro cambió, pero los prefijos son distintos entre sí, así que no hay efecto.

| Qué | Resultado |
|---|---|
| Ubicación | `backend/src/dominios/institucional/{institucion, estructura, calendario, parametros, usuarios}` |
| Puerta pública | `dominios/institucional/index.ts` (`export *` de 7 archivos: institución, año lectivo, contexto de calendario, `PeriodLock`, calendario académico, escala y SIEE) |
| Imports externos redirigidos a la puerta | 32 en 23 archivos (servicios y utilidades; los modelos siguen directos) |
| Rutas | `dominios/institucional/rutas.ts`, montadas por `routes/index.ts`; la puerta de `bienestar` ya no incluye sus rutas (evita ciclos de carga) |
| Fuera del dominio | `models/user.model.ts`, `auth.controller`, `auth.middleware`, `token.service` y `constants/roles.ts` (van a `nucleo/seguridad`) |

**Dependencias hacia arriba que ya existían y quedan documentadas para la fase 3** (no se corrigen en un movimiento):

1. `usuarios/user.controller.ts` importa 9 modelos de otros dominios (`Attendance`, `ActivitySubmission`, `CurricularDevelopment`, `PeriodoProrroga`, `TeacherAssignment`, `Enrollment`, `StudentProfile`, `Guardian`, `StudentGuardian`, `AdmissionRequest`) para decidir si un usuario tiene historial → vetos de eliminación por dominio.
2. `usuarios/user.routes.ts` monta controladores y validadores de `registro` (`guardian`, `studentProfile`) bajo `/users/:userId/...` → `registro` debe exponer su router y montarse en la misma ruta.
3. `institucion/institution.controller.ts` llama a `studyPlan.service` (`curricular`) en `PATCH /institution/limites-horas-plan` para devolver `grados_excedidos`.
4. `estructura/espacio.service.ts` importa el modelo `Area` (`curricular`).

