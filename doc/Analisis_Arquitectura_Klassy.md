# Análisis de arquitectura de Klassy — diagnóstico y propuesta

> Estado: **propuesta aprobada en sus decisiones de fondo (ver §9); sin código modificado todavía.**
> Fecha del análisis: 2026-10-06 · Base: `main` en `69856a3` (v0.16.0, M16 integrado).
> Método: lectura estática del repositorio (conteos de imports, tamaños, grafo de dependencias) y del documento maestro
> `Idea_Klassy_Gestor_Academico_Administrativo_v2.docx`. No se ejecutó build ni tests.

## 1. Resumen

El proyecto está bien hecho en lo pequeño: TypeScript estricto, capa de servicios casi siempre presente, permisos como funciones
puras con tests, validación Joi en la frontera y pruebas de integración. El problema es de **organización a gran escala**: la
estructura es plana y por capa técnica, así que no refleja los procesos del negocio, los módulos se acoplan por atajos, las mismas
reglas están repetidas en varios sitios y, en el frontend, páginas y tipos se han vuelto monolitos.

Con 32 módulos previstos y 16 construidos, esto se encarece con cada módulo nuevo. La propuesta es un **monolito modular con 6
dominios más un núcleo técnico**, alineado con los 4 subsistemas del documento maestro (y no 32 carpetas, una por módulo).

## 2. Radiografía actual

| | Archivos | Líneas |
|---|---|---|
| Backend `src` | 229 | 27.358 |
| Frontend `src` | 148 | 28.280 |
| Tests / scripts | 22 / 14 | 3.289 / 875 |

**Backend**: 9 carpetas planas por tipo — `services` 53, `models` 43, `controllers` 31, `validators` 31, `routes` 30, `utils` 24.
**Frontend**: `pages/` (16 en la raíz y 19 en `admin/`, dividido por rol), `components/` (algunas carpetas por dominio, otras no),
`hooks/` (23 planos), `types/domain.ts` (993 líneas con los tipos de todos los módulos) y `lib/`.

Tamaño aproximado por dominio funcional (backend):

| Dominio | Archivos | Líneas |
|---|---|---|
| Convivencia, comité y orientación | 37 | 5.552 |
| Inclusión / PIAR | 20 | 3.539 |
| Currículo y plan de estudios | 27 | 3.373 |
| Matrícula, admisiones y estudiantes | 30 | 3.141 |
| Asistencia | 14 | 2.910 |
| Año lectivo y calendario | 17 | 2.264 |
| Institución, sedes, grupos y espacios | 29 | 2.248 |
| Usuarios y auth | 10 | 1.096 |

## 3. Problemas detectados

### 3.1 Backend

1. **Cada funcionalidad queda repartida en 6 carpetas.** Un cambio en M16 toca ~20 archivos en `models`, `services`, `controllers`,
   `routes`, `validators` y `utils`.
2. **Helpers compartidos en un módulo ajeno.** `attendance.service.ts` exporta `hoyColombia`, `fechaDeClase`, `periodoDeFecha` y
   `cargarContextoFechas`; los importan `observacion`, `caso`, `comite`, `remisionOrientacion` y `retencion` (convivencia).
   `inclusionContexto.service` y `convivenciaCatalogo.service` hacen de "cajón compartido" dentro de su área.
3. **Dependencias en dirección contraria al grafo de datos.**
   - `user.controller.ts` (M02) importa 14 modelos, incluidos `Attendance`, `ActivitySubmission`, `CurricularDevelopment`,
     `PeriodoProrroga`, `TeacherAssignment` y `Enrollment`, para saber si un usuario tiene historial antes de borrarlo.
   - `enrollment.service` y `admissionRequest.service` (M04) llaman a `solicitudApoyo.service` (M16).
4. **Reglas duplicadas por falta de un proveedor único.**
   - `Institution.findOne()` aparece más de 30 veces en 17 servicios; al menos 4 reimplementan su propio `obtenerInstitucion()`
     (`academicYear`, `area`, `attendanceState`, `convivenciaCatalogo`).
   - `anioEnCurso()` está implementado dos veces (`observacion.service`, `inclusionContexto.service`) y hay consultas
     `AcademicYear.findOne({estado:'EN_CURSO'})` sueltas en otros 4 servicios.
   - El patrón "obtener o crear la configuración" está duplicado en convivencia e inclusión.
   - Los 6 servicios que usan pdfkit no comparten una base; varios definen su propia paleta de colores.
5. **Permisos y roles repartidos.** Arrays de roles en 6 archivos de rutas, funciones puras en `utils/permisos*`, y
   `permisoSobreClase` / `filtroAlcanceAsistencia` dentro de servicios. Dos tipos casi idénticos de "usuario mínimo"
   (`UsuarioConvivencia`, `UsuarioInclusion`).

### 3.2 Mapeo a SOLID (backend)

| Principio | Hallazgo |
|---|---|
| **S** | `user.controller` (493 líneas) mezcla HTTP, jerarquía, importación CSV, reglas de borrado y token (31 `throw ApiError`). 24 de 31 controladores lanzan errores de negocio. Servicios sobrecargados: `observacion.service` (830), `studyPlan.service` (794), `academicYear.service` (689: año, periodos, eventos, calendarios y cierre). |
| **O** | `ACCIONES_AUDITORIA` es un enum central de más de 120 acciones: cada módulo nuevo edita el modelo de auditoría. `constants/enums.ts` es otro monolito (246 líneas). |
| **L** | No es el punto débil (`ReferenteCurricular` con discriminadores está bien). Fuga menor: los servicios reciben `UserDocument` completo donde solo necesitan `{id, rol, sedes_ids}`. |
| **I** | Mismo punto: el contrato de "usuario" es el documento entero; las utilidades ya demuestran que un contrato mínimo basta. |
| **D** | 10 de 31 controladores importan modelos directamente (3 usan `mongoose` crudo: `group`, `studentProfile`, `user`). Los servicios consultan modelos de otros dominios sin pasar por quien los posee: `reportCard.service` importa 14 modelos, `expedienteInclusion` 12, `attendance` 11. |

### 3.3 Frontend

1. **Páginas monolito.** 17 de 36 páginas superan las 300 líneas y suman 10.370 de 13.268 líneas de `pages/`. `StudyPlanPage` tiene
   1.694 líneas con tres pestañas completas dentro del mismo archivo; `TeacherAssignmentsPage` 989; `AnioLectivoPage` 807.
2. **El sistema de diseño depende de los dominios.** `components/ui/Badge.tsx` (311 líneas, 20 componentes) importa tipos de
   `types/domain.ts` y de los hooks `useCasos`, `useInclusion` y `useObservaciones`.
3. **Tipos en dos lugares.** `types/domain.ts` (M01–M13) y ~95 tipos exportados desde `hooks/` (convivencia, inclusión, asistencia).
   `useInclusion.ts` (682 líneas) mezcla tipos, claves de query, consultas y mutaciones.
4. **Permisos triplicados.** Roles en `App.tsx` (arrays inline), en `navigation.ts` (26 ítems) y 66 chequeos `rol ===` en páginas y
   componentes; además se repiten en el backend.
5. **Estructura inconsistente.** `ComitePage` está en `pages/admin/` y `ObservadorPage` en la raíz; convivencia, inclusión y asistencia
   tienen carpeta de componentes propia, pero usuarios, estudiantes, grupos, matrículas y plan de estudios tienen su lógica dentro
   de las páginas. `lib/` mezcla infraestructura con piezas de dominio.

### 3.4 Transversal

- El contrato frontend/backend se sincroniza a mano: ~77 declaraciones `as const` en `backend/src/constants` copiadas a
  `types/domain.ts` (34). El `package.json` raíz está vacío.
- Mezcla español/inglés en nombres de archivo, comentarios de proceso en `routes/index.ts` ("Prompt 2", "Prompt 3"), tests y scripts planos.
- `CLAUDE.md` es hoy la especificación de todo el sistema en un solo archivo.

## 4. Qué se conserva

Capa de servicios, validadores Joi, `runTransaction`, funciones puras con tests, la ausencia de ciclos entre servicios, los modelos
que no importan servicios, el patrón TanStack Query, la librería `components/ui` (solo se desacopla de los dominios) y el modelo
de negocio de `CLAUDE.md`.

## 5. Arquitectura propuesta

### 5.1 Principio

Monolito modular por **dominios** (contextos de negocio), no por módulo. Los 32 módulos se agrupan en 6 dominios más un núcleo
técnico. Dentro de cada dominio, los archivos que cambian juntos viven juntos, **agrupados por subárea** (decisión §9).

### 5.2 Dominios

| Dominio | Módulos | Contenido (ya construido → futuro) |
|---|---|---|
| **`nucleo`** (técnico, sin reglas de negocio) | M31 (registro) | configuración y BD, errores y middlewares, autenticación, token, roles y jerarquía, auditoría, transacciones, consecutivos (`Counter`), base de PDF (paleta, encabezado, huella SHA-256), lectura CSV/Excel, uploads y firma de bytes, tiempo (`hoyColombia`, `fechaDeClase`) |
| **`institucional`** | M01, M02, M05, M10, M32 | institución, sedes, jornadas, grados, grupos, espacios; usuarios; año lectivo, periodos, prórrogas, `PeriodLock`; parámetros |
| **`registro`** | M03, M04, M26, M29 | estudiantes, acudientes; admisiones y preinscripción pública; matrículas y folio → certificados y archivo |
| **`curricular`** | M06, M07, M08, M09, M23 | plan de estudios, referentes DBA/EBC, desarrollo curricular, carga docente → horarios, proyectos |
| **`academico`** | M11, M12, M13, M17, M18, M19, M20, M21, M22 | actividades y notas, asistencia, boletines → recuperación, promoción, comisión, planillas |
| **`bienestar`** | M14, M15, M16 | observador, convivencia y comité, orientación, inclusión/PIAR y lo común (alcance por sede, buscador de estudiantes, datos sensibles, retención) |
| **`comunicacion`** (reservado) | M24, M25, M27, M28, M30 | agenda, portal del acudiente, notificaciones, reportes (solo lectura) |

Dos decisiones que se apartan del UML del documento maestro:

- **M10 (espacios) va en `institucional`**, no en Currículo/Horarios: `Group.aula_id` depende de `Espacio` desde M01; si M10 viviera
  en `curricular`, `institucional` dependería de un nivel superior. M09 (horarios) lo consumirá.
- **M13 (asistencia) queda en `academico`** (como el UML); lo importante es que deje de ser proveedor de utilidades de fecha de otros dominios.

### 5.3 Regla de dependencias (el grafo de datos del documento, hecho regla)

```
Nivel 4:  comunicacion  (lee de todos, solo mediante contratos públicos)
Nivel 3:  academico        bienestar
Nivel 2:  registro         curricular      (no se importan entre sí)
Nivel 1:  institucional
Nivel 0:  nucleo
```

- Un dominio depende solo de niveles inferiores; nunca de uno superior ni de un igual, salvo mediante contrato.
- Otro dominio **no consulta modelos ajenos**: pide el dato a la API pública (`index.ts`) de quien lo posee
  (`obtenerInstitucion()`, `obtenerAnioEnCurso()`, `matriculaActiva(estudiante, año)`, `docenteDictaClase(...)`).
- No se agrega una capa de repositorios sobre Mongoose (sobreingeniería según `CLAUDE.md`): el servicio propietario es la abstracción.
- La regla se verifica automáticamente con una herramienta de límites de imports (p. ej. `dependency-cruiser`; confirmar si
  `oxlint` ofrece algo equivalente).

Los dos casos que hoy violan la regla:

- **Borrar usuario con historial** (`institucional` ← niveles superiores): cada dominio registra un "veto de eliminación"
  (`tieneHistorial(usuarioId)`) y M02 solo los recorre.
- **Matrícula con apoyo declarado** (`registro` → `bienestar`): `registro` define un puerto (`recibirApoyoDeclarado`) y `bienestar`
  lo implementa; se conecta en la composición de `app.ts`, dentro de la misma transacción.

### 5.4 Estructura física del backend

Los archivos conservan nombres y sufijos actuales (`.model`, `.service`, `.controller`, `.routes`, `.validator`); solo cambian de
carpeta. No se renombra ningún identificador (regla 1 de `CLAUDE.md`); las carpetas nuevas van en español.

```
backend/src/
├─ app.ts · server.ts · rutas.ts        (compone las rutas de cada dominio)
├─ nucleo/  configuracion · http · seguridad · auditoria · datos · documentos · importacion · tiempo
└─ dominios/
   ├─ institucional/  institucion · estructura · calendario · usuarios · index.ts
   ├─ registro/       estudiantes · admisiones · matriculas · index.ts
   ├─ curricular/     plan-estudios · referentes · desarrollo · carga-docente · index.ts
   ├─ academico/      actividades-notas · asistencia · boletines · index.ts
   ├─ bienestar/      observador · convivencia · orientacion · inclusion · comun · index.ts
   └─ comunicacion/   (reservado)
```

- Dentro de una subárea: `x.routes → x.controller → x.service → x.model`, más un `permisos.ts` puro por dominio; las listas de
  roles salen de las rutas.
- Controladores delgados: solo traducen HTTP ↔ servicio (la lógica de `user.controller` pasa a un servicio de usuarios).
- Auditoría: cada dominio declara sus acciones y el núcleo las compone (adiós al enum central).
- Tests colocados por dominio; scripts separados en `migraciones/` y `seeds/`.

### 5.5 Estructura física del frontend

```
frontend/src/
├─ app/         main · App · proveedores · AppShell · navegación derivada
├─ compartido/  ui (kit visual puro) · lib · hooks transversales · tipos (api, roles)
└─ dominios/
   ├─ institucional/ registro/ curricular/ academico/ bienestar/
   │   cada uno: paginas · componentes · hooks · tipos · rutas.ts
   └─ publico/    (HomePage y preinscripción, sin login)
```

- **Manifiesto de rutas por dominio** (`rutas.ts`): cada dominio declara una sola vez sus rutas, roles, entrada de menú,
  `soloPresencial` y carga diferida (`React.lazy`); `App.tsx` y `navigation.ts` se derivan de él.
- **Kit `ui` puro**: los badges de dominio (`EstadoCasoBadge`, `EstadoExpedienteBadge`, `TipoSituacionBadge`…) pasan a su dominio;
  `ui/` conserva `Chip` y las variantes genéricas, sin importar nada de `hooks/` ni de dominios.
- **Páginas de composición** (orientativo ≤ 250–300 líneas): pestañas y drawers a `componentes/` del dominio.
- **Tipos y hooks por dominio**: `types/domain.ts` se reparte; `useInclusion.ts` se divide por subárea con `queryKeys` por dominio.
- **Regla de imports**: `compartido ← dominios ← app`; un dominio usa a otro solo por su `index.ts`.

### 5.6 Contrato frontend/backend — opción B (aprobada)

Paquete compartido (workspaces de npm, aprovechando el `package.json` raíz vacío) solo para enums, constantes y la matriz de
roles. Requiere compatibilidad con el `module: CommonJS` del backend; se hace en una fase propia, después de mover los dominios.

## 6. Problema → solución

| Problema | Solución | Principio |
|---|---|---|
| Funcionalidad repartida en 6 carpetas | Colocación por subárea dentro de un dominio | S / cohesión |
| Utilidades de fecha viven en asistencia | `nucleo/tiempo` e `institucional/calendario` | D |
| `Institution.findOne()` ×30 | `institucional.obtenerInstitucion()` | DRY / D |
| `anioEnCurso` duplicado | Una función en `institucional/calendario` | DRY |
| `user.controller` con 14 modelos | Servicio de usuarios + vetos de eliminación | S / D |
| Matrícula → apoyo (M04 → M16) | Puerto en `registro`, implementación en `bienestar` | D |
| Enum de auditoría central | Acciones por dominio, compuestas en el núcleo | O |
| Roles en rutas, `App.tsx` y menú | `permisos.ts` por dominio + manifiesto de rutas | DRY |
| `StudyPlanPage` 1.694 líneas | Páginas de composición + componentes por pestaña | S |
| `ui` depende de hooks de dominio | Badges de dominio en su dominio; `ui` puro | D |
| `types/domain.ts` monolito | Tipos por dominio junto a sus hooks | I |

## 7. Ruta de migración (sin cambio de comportamiento)

Cada fase es un PR independiente y deja `typecheck:all`, `lint`, `npm test` y `build` en verde.

0. **Línea base y guardas.** Fijar los checks en verde, capturar el grafo actual de dependencias y documentar la convención en
   `CLAUDE.md`. Sin mover archivos.
1. **Extraer el núcleo y los duplicados** (proveedores de institución y año en curso, tiempo, base de PDF, patrón de configuración).
2. **Mover el backend a dominios** con `git mv` y actualización de imports, un dominio por PR. Empezar por `bienestar`.
3. **Corregir las inversiones** (borrado de usuario, apoyo declarado) y adelgazar controladores (`user`, `group`, `studentProfile`,
   `auth`, `campus`, `grade`, `jornadaOperativa`, `activity`, `public`).
4. **Frontend**: `compartido/`, badges de dominio, tipos y hooks por dominio, manifiesto de rutas, división de páginas gigantes
   (empezando por `StudyPlanPage`).
5. **Contrato compartido** (opción B) y activar la regla de límites como error.
6. **Tests, scripts y documentación por dominio** (incluye un `CLAUDE.md` corto por dominio).

## 8. Riesgos

- Los movimientos masivos de archivos entran en conflicto con cualquier rama que edite esos archivos en paralelo: se hacen en una
  **ventana sin trabajo en vuelo** (ver §10).
- El backend compila a CommonJS con `tsc`, que no reescribe alias de rutas: usar imports relativos a través de los `index.ts` o
  añadir una herramienta de alias. En el frontend (Vite) el alias es directo.
- `CLAUDE.md` pide no renombrar identificadores existentes: la propuesta lo respeta (solo cambian carpetas).

## 9. Decisiones tomadas

1. **Aprobado**: 6 dominios + núcleo, con M10 en `institucional` y convivencia, orientación e inclusión juntas en `bienestar`.
2. **Aprobado**: colocación **por subárea** dentro de cada dominio.
3. **Aprobado**: contrato compartido **opción B** (paquete compartido para enums, constantes y matriz de roles).
4. **Pendiente de coordinar**: ventana sin trabajo en vuelo (ver §10).
5. **Hecho**: este análisis queda guardado en el repo.
6. **Pendiente**: estrategia de ramas (ver §10).

## 10. Estrategia de ramas y ventana de trabajo (recomendación)

**Ventana sin trabajo en vuelo** significa un periodo en el que nadie tiene ramas abiertas que editen archivos que se van a mover.
Si alguien modifica `services/observacion.service.ts` en su rama mientras otra rama lo mueve a
`dominios/bienestar/observador/`, Git no sabe reconciliar los cambios y el merge se vuelve manual y propenso a errores. Estado al
2026-10-06: el único PR abierto es el de release-please y las ramas `feature/*` ya fueron integradas, así que **hoy hay ventana**.

Recomendación:

- **Nunca directo a `main`** (la `GUIA_DESARROLLO.md` ya lo prohíbe).
- **Una rama corta por fase**, partiendo de `main` actualizado y volviendo a `main` mediante PR (p. ej. `refactor/fase1-nucleo`,
  `refactor/fase2-bienestar`), en vez de una rama única de larga duración. Cada fase queda revisable, con los checks en verde, y
  `main` no se aleja de la rama de refactor.
- Si se prefiere una rama paraguas (`refactor/arquitectura-modular`), usarla solo como rama de integración, con las ramas por fase
  apuntando a ella y trayendo `main` a menudo; no debe vivir semanas sin sincronizarse.
- Durante las fases de movimiento (2 y 4) se acuerda un **congelamiento de módulos nuevos**: si hay que seguir con M09 o M12, se hace
  después de cada merge a `main`, no en paralelo.
- Agregar el prefijo `refactor/` a la tabla de ramas de `GUIA_DESARROLLO.md` (hoy solo lista `feature`, `fix`, `docs` y `ci`).
