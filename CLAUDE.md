# Klassy — Reglas generales para Claude Code

Este archivo se lee siempre al iniciar una sesión en este repositorio. Contiene las reglas
que ya se han dado en el proyecto para que no haya que repetirlas cada vez.

## 1. Idioma del código

- **Código nuevo en español**: variables, funciones, nombres de archivo y comentarios que se
  agreguen de aquí en adelante van en español (ej. `crearJornada`, `actualizarEstadoGrupo`,
  `jornadaOperativa.model.ts`).
- **No renombrar identificadores ya existentes** solo por consistencia de idioma — genera
  diffs innecesarios y riesgo de romper referencias. Si un identificador en inglés ya existe
  (`createGroup`, `Institution`, `catchAsync`, etc.), se deja como está.
- Sufijos y convenciones técnicas ya establecidas (`Document`, `Model`, `Schema`, `Input`,
  `use...` en hooks de React, `...Page` en páginas) se mantienen aunque estén en inglés: son
  parte del patrón del framework, no vocabulario de negocio.
- Comentarios solo cuando explican un **porqué** no obvio (una regla de negocio, una
  invariante, un workaround). No se documenta el qué — el código ya lo dice.

## 2. Modelo de negocio y despliegue: una institución por instalación

- Klassy se vende y se despliega **por institución**: cada colegio cliente tiene su propio
  dominio/instalación del sistema (y su propia base de datos). No es un SaaS multi-institución
  compartido ni tiene un panel para "elegir institución".
- El **multitenant existe únicamente dentro de una institución, a nivel de sedes** (`Campus`):
  una misma instalación puede tener varias sedes, cada una con sus propias jornadas operativas
  (`JornadaOperativa`), grupos, etc. — pero nunca más de una institución (`Institution`) en la
  misma base de datos.
- Consecuencia práctica en el backend: `POST /institution/setup` crea la única institución de
  la instalación y responde 409 si ya existe una — no es un alta repetible. Para modificar los
  datos de la institución ya creada se usa `PATCH /institution`, que exige confirmar con la
  contraseña del propio usuario ADMIN que hace el cambio. Para agregar, editar o eliminar
  sedes se usa el módulo de Sedes y jornadas (frontend `/admin/sedes`, backend `/campuses`).
- Consecuencia práctica en el frontend: la página "Configuración institucional"
  (`InstitutionSetupPage`) muestra el asistente de creación **solo si todavía no existe una
  institución** (`GET /institution` devuelve `null`); si ya existe, muestra sus datos como
  estáticos con un botón "Modificar" (drawer + contraseña), y un acceso directo al módulo de
  Sedes — nunca un formulario para crear una segunda institución.
- Si una tarea futura pide soporte multi-institución real (varias instituciones en una misma
  instalación), es un cambio de modelo de negocio, no un ajuste de M01: confirmar con el
  usuario antes de tocar `Institution`/`institution.service.ts` en ese sentido.
- **Un solo rol administrativo: `ADMIN`.** El rol `SUPERADMIN` se eliminó del enum `ROLES`
  (backend `constants/enums.ts`, frontend `types/api.ts`) porque no tiene sentido tener un nivel
  "por encima" del admin cuando el sistema ya es de una sola institución — `ADMIN` es el máximo
  privilegio. No reintroducir `SUPERADMIN` ni un rol equivalente sin que el usuario lo pida
  explícitamente. Los usuarios `SUPERADMIN` que hayan quedado en Mongo de antes de este cambio
  se migran con `npm run migrate:superadmin-to-admin` (`backend/scripts/migrateSuperadminToAdmin.ts`).
- **Login por documento de identidad, no por correo.** `POST /auth/login` recibe
  `{ numero_documento, password }` (`numero_documento` ya es único por usuario en el schema, no
  hace falta también el tipo de documento). El campo `email` del usuario sigue existiendo en el
  modelo, pero no se usa para autenticar.

## 3. Alcance estricto por módulo (M01–M32)

- **No implementar lógica de otro módulo** que no se haya pedido explícitamente (ej. si se
  pide M01, no tocar M02 usuarios completos, M09 horarios, M10 salones, M12 notas, etc.).
- Cuando un cambio en un módulo obliga a tocar código de **otro** módulo porque comparten un
  recurso (un enum, un campo de un modelo, un rol), aplicar **solo el cambio mecánico mínimo**
  para que ese otro módulo siga compilando y funcionando igual que antes — nunca aprovechar
  para agregarle funcionalidad nueva.
- Si hay duda sobre si algo entra en el alcance pedido, preguntar antes de tocarlo.
- Regla de oro de datos: la información se crea una sola vez y se consume por llave foránea
  (ver `doc/Idea_Klassy_Gestor_Academico_Administrativo_v2.docx`, sección de reglas M01). No
  duplicar entidades ni "quemar" en código escalas, periodos, reglas de promoción, etc. — eso
  vive en configuración institucional (M32).

### M01 (Núcleo institucional) — estado: completo

Los 5 sub-módulos de M01 están implementados; no rehacer, solo extender si se pide algo nuevo:

1. **Institución** — `Institution` (nombre, código DANE, NIT, resolución, `logo_url` como data
   URI, `estado` activo/inactivo). `GET/PATCH /institution`, página `InstitutionSetupPage`.
2. **Sedes** — `Campus` (nombre, código DANE de sede, dirección, `telefono`, `es_principal`,
   `estado`). CRUD completo en `/campuses` (crear/editar/desactivar/eliminar — eliminar solo si
   no es principal y no tiene jornadas/grupos), página `SedesPage`.
3. **Jornadas por sede** — `JornadaOperativa` (`nombre` en `MANANA/TARDE/UNICA/NOCTURNA/SABATINA`,
   `hora_inicio`/`hora_fin` en formato `HH:MM`), única por sede (índice compuesto). Rutas `/shifts`.
4. **Catálogo de grados** — `Grade` (nivel, número, nombre, `estado`). Catálogo global sembrado
   por `scripts/seed.ts`; se activa/desactiva por institución (no por sede) vía
   `PATCH /grades/:id/estado`, página `GradesPage` (`/admin/grades`).
5. **Grupos y cupos** — `Group` (sede+jornada+grado+nomenclatura únicos por año lectivo vía
   índice compuesto, `max_capacity`, `estado` ACTIVE/CLOSED). `GroupsPage` filtra por sede,
   jornada y grado.

**Dos reglas transversales que salieron de bugs reales de M01:**

- **"Activo" en una consulta es `ESTADO_ACTIVO`** (`utils/filtroEstado.ts`, `{ $ne: 'inactivo' }`), nunca `{ estado: 'activo' }`.
  Los documentos creados antes de que existiera el campo `estado` no lo tienen guardado: Mongoose los lee como
  'activo' (default del schema) pero ese filtro los excluye (el catálogo de grados mostraba 2 de 12). Datos viejos:
  `npm run migrate:estado-por-defecto`.
- **Ninguna pantalla depende de estado guardado en el navegador** (se eliminó `InstitutionConfigContext`, que solo se
  llenaba al correr el asistente en ese navegador y dejaba "Grupos"/"Matrículas" inutilizables en cualquier otro).
  La institución sale de `useInstitution()` y el año de trabajo de `useAnioDeTrabajo()` (vigencia activa, o el más
  reciente sin cerrar); un ID no se pide ni se pega a mano.

### M02 (Usuarios) — Jerarquía institucional de gestión

Backend `/users` (modelo `User`), frontend `/admin/users` (`UsersPage`).
- **Matriz de permisos y jerarquía estricta** (`backend/src/constants/roles.ts`, `frontend/src/types/api.ts`):
  `ADMIN (100) > COORDINADOR (70) > SECRETARIA (40) = DOCENTE (40) > ESTUDIANTE (10) = ACUDIENTE (10)`.
  Un usuario solo puede crear, editar, cambiar estado, resetear contraseña, cerrar sesiones o eliminar a
  usuarios de rango estrictamente MENOR (con la excepción de que un ADMIN sí puede gestionar a otros ADMIN,
  salvo a sí mismo).
- **Secretaría en M02**: mantiene la consulta global del directorio de usuarios, pero todas las acciones sobre
  roles jerárquicamente iguales o superiores (`ADMIN`, `COORDINADOR`, `DOCENTE`, `SECRETARIA`) quedan bloqueadas
  tanto en frontend (`IconButton disabled` con tooltip explicativo) como en backend (403 con mensaje de
  jerarquía). Solo puede gestionar o crear usuarios con roles de soporte escolar (`ESTUDIANTE` y `ACUDIENTE`).

### M05 (Año lectivo y periodos) — estado: completo

Backend `/academic-years` (modelo `AcademicYear` + `PeriodoProrroga`), frontend `/anio-lectivo`
(`AnioLectivoPage`, visible para todos los roles: los controles de gestión dependen del rol). No rehacer,
solo extender si se pide algo nuevo. Reglas que no se ven leyendo un solo archivo:

- **Estados del año**: `PLANIFICACION` → `EN_CURSO` (la vigencia activa, única por institución: lo garantiza
  un índice único parcial además del chequeo del servicio) → `CERRADO` (histórico de solo lectura, no se
  reactiva). Crear un año nuevo puede copiar los grupos ACTIVOS del anterior (grupos nuevos, sin matrículas).
- **Semáforo del periodo**: `PROGRAMADO` → `ABIERTO` → `EN_DIGITACION` → `CERRADO` (tabla
  `TRANSICIONES_PERIODO` en `constants/anioLectivo.ts`); reabrir uno CERRADO solo lo hace ADMIN y con motivo.
  `ESTADOS_PERIODO` (ABIERTO/CERRADO) es otra cosa: el cierre de un periodo *para un grupo* (`PeriodLock`).
- **Permisos**: ADMIN crea/edita/activa/cierra el año y edita eventos y calendarios por sede; ADMIN y
  COORDINADOR cambian el estado de los periodos y otorgan/revocan prórrogas; el resto de roles solo consulta.
- **`assertPeriodNotLocked(año, grupo, periodo, docenteId)` es el único punto que decide si se pueden digitar
  notas**: año EN_CURSO, periodo ABIERTO/EN_DIGITACION y dentro de su ventana (la de la sede del grupo si esta
  tiene calendario propio), o una prórroga vigente para ese docente/grupo; además el `PeriodLock` del grupo.
  Todo módulo que mute notas debe pasar por ahí (hoy lo hace `gradeActivity`).
- **Fechas**: las fechas de calendario se guardan a medianoche UTC. Para compararlas con "ahora" se usa
  `inicioDelDia`/`finDelDia` de `utils/calendarioAcademico.ts` (UTC-5, cierre inclusivo); en el frontend se
  formatean con `lib/fechas.ts`, nunca con `toLocaleDateString()` (mostraría el día anterior).
- `esDiaLectivo(dia, eventos)` es el contrato para que M13 (asistencia) no exija lista en recesos/vacaciones/
  desarrollo institucional; las semanas lectivas (mínimo 40) se calculan con las mismas reglas.
- **Cierre de vigencia en dos pasos**: `GET /:id/cierre` (verificación) y `POST /:id/cerrar` (contraseña del
  ADMIN + escribir el año). Revoca las prórrogas pendientes. Todo cambio queda en auditoría (M31).
- Años creados antes de M05: `npm run migrate:m05-anio-lectivo` (idempotente).
- **Pendiente, a propósito fuera de alcance**: la verificación de cierre no revisa las comisiones de evaluación
  (M20, aún no existe); M13 aplica las mismas reglas de calendario pero con los días hábiles de la jornada (ver M13), no con `esDiaLectivo`, que es solo lunes a viernes; matrículas y admisiones no se bloquean en un
  año cerrado (solo `POST /groups` lo valida); los festivos colombianos no se descuentan de las semanas.

### Estructura de tiempo de las jornadas (M01/M05, la comparte M10 y la usará M09)

- **Nunca hay días ni horas fijos en el código.** Cada `JornadaOperativa` guarda sus `dias_habiles` (ISO 1=lunes … 7=domingo;
  por defecto L–V, y solo sábado para `SABATINA`, editable para tener sábado/domingo) y sus `franjas`: bloques reales de
  `CLASE` y `DESCANSO` con hora de inicio y fin. Empiezan vacías: hasta que se definan, la malla de espacios muestra un aviso, no
  una cuadrícula inventada. El modelo valida que estén dentro de la jornada, en orden y sin traslapes (`utils/franjas.ts`).
- **Plantilla base**: `Institution.plantilla_franjas` (bloques por *duración*, sin hora fija, para que sirva a mañana y tarde). Se
  edita en Configuración institucional (`PUT /institution/plantilla-franjas`, ADMIN) y se "carga" en una jornada
  (`GET /shifts/:id/horario/plantilla` devuelve las franjas encadenadas desde su hora de inicio, sin guardar; el usuario las revisa y
  guarda con `PATCH /shifts/:id/horario`, ADMIN o COORDINADOR). Si la plantilla no cabe en la jornada da 409, no recorta en silencio;
  cambiar la plantilla no toca las jornadas ya configuradas. **M09 debe leer `JornadaOperativa.franjas`, no definir su propia estructura.**

### M07 (Currículo — Banco de Referentes y Desarrollo Curricular) — estado: núcleo completo

Backend `/curriculum/referentes` (modelo `ReferenteCurricular` con discriminadores `Dba`/`Ebc`/
`Lineamiento`) y `/curricular-developments` (modelo `CurricularDevelopment`), frontend
`DesarrolloCurricularPage` (docente) y `RevisionCurricularPage` (`/admin/...`, coordinador).
Reglas que no se ven leyendo un solo archivo:

- **Un banco, tres contratos.** `ReferenteCurricular` es una sola colección Mongo con
  discriminador por `tipo_referente` (`DBA`/`EBC`/`LINEAMIENTO`; `MATRIZ_ICFES` queda reservado
  en el enum sin discriminador propio hasta que se aporte esa fuente): así `Activity.dba_id`
  (M12) y `CurricularDevelopment.dba_seleccionados` (M07) siguen apuntando a la misma colección
  por `_id` sin importar el tipo, pero cada tipo tiene su propio contrato estricto (`Dba` exige
  `grade_id`+`numero_dba`+`organizador`; `Ebc` exige `grupo_grados`+`competencia`; `Lineamiento`
  exige `titulo`+`contenido`, y su `area_id` es el único que puede ser `null` — un lineamiento
  transversal, no propio de un área).
- **El área del banco es la del Plan de Estudios (M06), nunca una nueva.**
  `scripts/seedReferentesCurriculares.ts` no crea `Area` — resuelve las 4 áreas troncales
  (Matemáticas, Lengua Castellana, Ciencias Naturales, Ciencias Sociales) buscando, entre las
  `Subject` que la institución ya creó en M06, una cuyo nombre calce (ej. "Lengua Castellana") y
  reutiliza su `area_id`, sea cual sea el área a la que esa asignatura pertenezca (ej.
  "Humanidades..."). Si esa asignatura todavía no existe en M06, esa parte del banco no se
  siembra — nunca se inventa un área nueva para forzarlo (regla de oro de datos de la sección 3).
- **`estado` (activo/inactivo) se muestra como Vigente/Histórico** en este módulo
  (`EstadoVigenciaReferenteBadge`), mismo campo/enum genérico que el resto del sistema — no es un
  enum nuevo.
- **EBC↔DBA no es un cruce oficial del MEN.** `dba_relacionados` de cada EBC se calcula al
  sembrar por área + organizador (normalizado, exacto o por contención) + grado dentro de su
  `grupo_grados` — es una heurística razonable, documentada como tal en el modelo y en el seed,
  no una tabla que el MEN publique.
- **El docente nunca escribe un DBA.** Elige Grado+Área+Periodo (vía su `TeacherAssignment`), el
  banco se filtra solo por ese grado/área (`GET /curriculum/referentes`), y un panel de apoyo
  aparte (`GET /curriculum/referentes/apoyo`) le muestra los EBC de su grupo de grados y los
  Lineamientos del área (más los transversales) — nunca los selecciona, solo los consulta. Todo
  lo demás (contenidos, actividades, metodología, criterios) es texto libre suyo.
- **Banco poblado**: 343 DBA + 188 EBC (Matemáticas, Lenguaje, Ciencias Naturales, Ciencias
  Sociales, grados 1°-11°; ninguno de los 4 documentos DBA del MEN entregados incluye Transición
  pese a mencionarla en su introducción) + 3 Lineamientos transversales (el documento de
  Lineamientos entregado es el marco general 2024 "Un viaje curricular", no los lineamientos
  clásicos de 1998 por área — se usa como tal). Matriz ICFES: sin documento fuente todavía,
  estructura lista pero banco vacío. `npm run seed:referentes` es idempotente.

### M10 (Espacios físicos) — estado: núcleo completo

Backend `/espacios` (modelo `Espacio`), frontend `/admin/espacios` (`EspaciosPage`, ADMIN y COORDINADOR; la lectura de
`GET /espacios` está abierta a cualquier rol autenticado). Reglas que no se ven leyendo un solo archivo:

- **Es opcional en dos niveles (adaptabilidad institucional).** (1) `Institution.modalidad` (`PRESENCIAL` por defecto, o
  `VIRTUAL`) se configura al crear la institución y en Configuración institucional: en una institución virtual M10 se apaga
  por completo (`exigirEspaciosFisicos()` rechaza con 409 crear espacios y asignar aula; se oculta "Espacios y aulas" del menú,
  el selector y la columna de aula en Grupos; la política de aforo deja de mostrarse). Al pasar a virtual, los espacios ya
  registrados se conservan. Los documentos sin el campo cuentan como PRESENCIAL. (2) En una institución presencial, `Group.aula_id`
  sigue siendo nullable: una sede que no registra aulas crea grupos igual que antes. Nada de M01 exige M10.
- **Regla M01 ↔ M10** (`validarAulaParaGrupo` en `espacio.service.ts`, llamada al crear y al reactivar un grupo): el salón
  titular debe ser un `AULA_REGULAR` `DISPONIBLE` de la misma sede; no puede ser titular de otro grupo ACTIVO de la misma
  jornada y año (salvo `admite_grupos_simultaneos`); y el cupo no debe pasar del aforo. Un aula sí puede servir a grupos de
  jornadas distintas (mañana y tarde).
- **Exceder el aforo es política de la institución, no código quemado**: `Institution.politica_aforo_aula` =
  `BLOQUEAR` (por defecto: 409) o `ADVERTIR` (permite, y deja auditoría `GRUPO_EXCEDE_AFORO_AULA`). Se cambia en
  Configuración institucional. El modal "Nuevo grupo" refleja la política (error + botón deshabilitado, o solo aviso).
- Un espacio que fue salón titular de algún grupo no se elimina (se inhabilita: `EN_MANTENIMIENTO`/`INACTIVO`); la sede de un
  espacio no se cambia. Reducir el aforo por debajo del cupo de un grupo asignado no se impide: el espacio y el grupo quedan
  marcados con "sobrecupo".
- `areas_exclusivas` y `recursos`/`computadores_operativos` se guardan y se editan, pero **aún no los consume nadie**: los
  usará el motor de horarios (M09). La malla semanal se arma **por espacio y jornada** con los días y franjas reales de la jornada (ver
  arriba) y solo muestra ocupación por grupo titular; la ocupación por asignatura llega con M09.

### M13 (Asistencia) — estado: núcleo completo

Backend `/attendance` (modelos `AttendanceState`, `Attendance`, `AttendanceJustification`), frontend `/docente/asistencia`
(`AsistenciaPage`, planilla del docente) y `/asistencia/gestion` (`GestionAsistenciaPage`: estadísticas, justificaciones y, solo
ADMIN, estados). Reglas que no se ven leyendo un solo archivo:

- **Los estados son configuración, las banderas son el contrato.** `AttendanceState` (por institución; se siembran 4 la primera vez:
  Presente/Ausencia/Retardo/Excusa) tiene `cuenta_como_falla`, `es_retardo`, `es_justificada` y `es_predeterminado`. Ningún reporte, ni
  el boletín (M17), compara por nombre: renombrar un estado no cambia nada. Un estado es falla, retardo o ninguno (nunca ambos), el
  predeterminado no puede ser falla/retardo y siempre hay uno activo. Los estados no se eliminan, se desactivan (los registros viejos
  siguen resolviendo su estado). El `tono` es uno de los 5 de `Chip`, no un color nuevo.
- **La planilla es una por grupo+asignatura+día** (índice único) con `registros[]` embebidos. Volver a guardar **actualiza** cada registro
  por estudiante, no reemplaza el arreglo: el `_id` del registro es estable porque la justificación se ancla a él.
- **Qué fecha admite asistencia** (`evaluarFecha` en `attendance.service.ts`, lee M05): año EN_CURSO, dentro de un periodo (con las fechas de
  la sede si tiene calendario propio) que no esté CERRADO ni cerrado por `PeriodLock` del grupo, no futura (hora Colombia), día en
  `JornadaOperativa.dias_habiles` (así un grupo SABATINA toma lista el sábado) y fuera de recesos/vacaciones (`hayEventoNoLectivo`). La
  ventana de digitación de notas y las prórrogas **no** aplican: son de notas. Solo el docente con `TeacherAssignment` CLASE activa (M08)
  toma lista, y solo de estudiantes con matrícula activa en el grupo (M04).
- **Falla justificada = el estado ya lo es (`es_justificada`) o tiene una justificación APROBADA.** La aprobación no modifica el registro del
  docente: se deriva al contar (`attendanceStats.service.ts`, el único lugar que cruza planillas con justificaciones). Una justificación se
  ancla a un registro cuyo estado cuenta como falla; solo una viva (PENDIENTE/APROBADA) por registro, una RECHAZADA se puede reenviar.
- **Evidencia**: el soporte (PDF/JPG/PNG/WEBP, 5 MB, validado por firma de bytes) vive en `uploads/asistencia/<planilla>/`, nunca en Mongo, y se
  descarga con sesión (`GET /attendance/justificaciones/:id/archivo`). Mientras no exista M27 la carga el personal (ADMIN, COORDINADOR,
  SECRETARIA, o el docente de esa clase desde el botón "Justificar" de la planilla) en nombre del acudiente (`acudiente_id` debe estar
  vinculado al estudiante en M03); la API ya es la que consumirá el portal. Revisar (aprobar/rechazar) es solo ADMIN/COORDINADOR; rechazar
  exige motivo.
- **M17**: `resumenAsistenciaParaBoletin` es lo que lee `reportCard.service.ts` (justificadas, injustificadas, retardos y fallas por asignatura).
- **Pendiente, a propósito fuera de alcance**: la carga offline por Excel/Google Sheets (CU-DOC-05); la vista del acudiente (CU-ACU-02, depende
  de M27); umbrales de ausentismo (alertas por %), que serían política institucional.

### Cargas masivas por CSV (M02 usuarios, M03 estudiantes)

- Todo CSV subido se lee con `leerCsv` (`backend/src/utils/csv.ts`), nunca con `toString('utf-8')` + parser a mano:
  detecta el separador (coma o punto y coma, que es lo que guarda Excel en español), quita el BOM, cae a
  Windows-1252 si el archivo no es UTF-8 (tildes y ñ), tolera la línea `sep=;` y normaliza los encabezados
  (`Tipo Documento` = `tipo_documento`). Exige las columnas obligatorias una sola vez y con mensaje claro.
- Las listas cerradas (tipo de documento, rol, género, RH, régimen, grupo étnico, parentesco) aceptan minúsculas pero un
  valor fuera de la lista es **error de fila**, nunca se descarta en silencio. Las fechas van YYYY-MM-DD (también
  DD/MM/AAAA, lo que Excel guarda). Toda la fila se valida antes de crear el usuario, y si algo falla después se
  deshace (no quedan estudiantes sin perfil). Varias sedes en `sedes_codigos` se separan con `|`.
- La guía de formato que ve el usuario es `GuiaColumnas` (colapsable) alimentada por `lib/columnasImportacion.ts`, que
  toma los valores válidos de las mismas constantes de dominio: al agregar o cambiar una columna del importador,
  se actualiza ahí en el mismo cambio.

### Folio del Libro de Matrícula (M04)

- **El folio se asigna al legalizar la matrícula, no al preinscribir**: `Enrollment.folio_matricula`,
  `numero_libro` y `numero_folio` son `null` mientras la matrícula está `PREINSCRITO` (así un aspirante que
  desiste no deja huecos en el consecutivo oficial). Se generan en `updateEnrollmentStatus` en la transición
  `PREINSCRITO` → `MATRICULADO_CONDICIONAL|DEFINITIVO`, dentro de la misma transacción del cambio de estado
  (rollback si algo falla). `createEnrollment` (matrícula directa, ya matriculada) lo asigna al crearla.
- Reglas: la condicional exige `fecha_limite_compromiso`; una matrícula con folio no vuelve a `PREINSCRITO`;
  retirar/anular una ya legalizada conserva su folio (es un asiento del libro). Invariante en el modelo: todo
  `MATRICULADO_*` tiene folio. Los índices únicos de folio son parciales (ignoran `null`).
- **Preinscripción pública (sitio sin login)**: cuando la solicitud está APROBADA, `GET /public/admission-requests/status`
  devuelve `preinscripcion` (grado/grupo/sede/jornada asignados, `fecha_limite_legalizacion`, documentos con su estado
  y motivo de rechazo). Comprobante en PDF: `POST /public/admission-requests/comprobante`; carga de documentos:
  `POST /public/admission-requests/documentos/:tipo`. Sin sesión, todo se autoriza con documento del aspirante +
  fecha de nacimiento (por eso `POST`: no van en la URL) y se valida el tipo real por firma de bytes. Un documento
  APROBADO no se reemplaza; solo se sube mientras la matrícula es PREINSCRITO o MATRICULADO_CONDICIONAL. El plazo
  (`Enrollment.fecha_limite_legalizacion`) lo fija secretaría al aprobar; por omisión `DIAS_PLAZO_LEGALIZACION` (15).
  Es informativo: no se anula nada automáticamente al vencer.
- Nunca asumir que `folio_matricula` es un string: en frontend y PDFs manejar `null`.
- Bases anteriores a este cambio: `npm run migrate:folio-al-matricular` (libera folios de preinscritos, reemplaza
  los índices y reajusta el contador; un hueco en medio del libro solo se reporta, no se renumera).

### Acceso al portal del acudiente (M03 → M02/M27)

- `POST /users/:userId/guardians` acepta `habilitar_portal` (checkbox en el drawer "Vincular acudiente", solo al
  registrar uno nuevo). Sin marcar, M02 no se toca. Marcado, `vincularAcudiente` corre **todo en una transacción**
  (`runTransaction`: acudiente + cuenta + vínculo; si algo falla no queda nada a medias).
- Dato único: si ya existe un `User` con ese `numero_documento` se reutiliza su id (si su rol no es `ACUDIENTE` →
  409, no se mezclan roles); si no, se crea con rol `ACUDIENTE`, contraseña temporal = número de documento y
  `debe_cambiar_password: true`. Requiere correo del acudiente (el `email` de `User` es obligatorio y único).
  El id queda en `Guardian.user_id`, que es lo que usa M27/boletín para ubicar al acudiente.

## 4. Principios SOLID

- **S — Responsabilidad única**: un modelo valida su propia forma; un servicio orquesta una
  operación de negocio (transacciones, validaciones cruzadas); un controlador solo traduce
  HTTP ↔ servicio. No mezclar reglas de negocio en el controlador.
- **O — Abierto/cerrado**: las reglas variables (escalas, periodos, ponderaciones, roles que
  pueden crear qué) se leen de configuración/enums centralizados, no de `if` fijos — así se
  extienden sin modificar el código que ya funciona.
- **L — Sustitución de Liskov**: cualquier implementación de un tipo/interfaz (`IXxx`,
  `XxxDocument`) debe poder usarse donde se espera el tipo base sin sorpresas de contrato.
- **I — Segregación de interfaces**: `ValidationSchema`, inputs de servicio, etc. exponen solo
  los campos que ese endpoint necesita — no interfaces gigantes compartidas "por si acaso".
- **D — Inversión de dependencias**: los controladores dependen de servicios (abstracción de
  la operación), no de detalles de Mongoose desperdigados; los servicios dependen de modelos,
  no al revés.

## 5. Principios de diseño de código

- **YAGNI / no sobreingeniería**: no agregar endpoints, flags, abstracciones o validaciones
  para casos que no se han pedido. Tres líneas parecidas no ameritan un helper todavía.
- **DRY con medida**: reutilizar (`constants/enums.ts` como fuente única de verdad para
  enums, reusados por Mongoose y Joi) pero sin forzar una abstracción prematura.
- **Validar en la frontera**: la validación de entrada vive en `validators/*.ts` (Joi), no
  repartida en controladores o modelos.
- **Consistencia de nombres de API**: los campos que viajan en el JSON (`jornada_id`,
  `max_capacity`, `sede_id`, etc.) son el contrato entre backend y frontend — se cambian en
  ambos lados a la vez, nunca solo de un lado.

## 6. Guía de diseño visual (frontend) — Klassy UI Spec

Referencia completa: `doc/Klassy_UI_Spec_1.docx`. Resumen para uso diario:

- **Color con propósito**: el color guía la acción y el estado, no decora. 4 familias ×
  2 tonos (oscuro = texto/icono/relleno sólido, claro = fondo de chip/botón suave):
  - Azul `#2878EA` / `#EAF3FF` — acción, navegación activa, nivel académico, roles
    administrativos (Administrador, Secretaría, Director).
  - Verde `#1FAF73` / `#E5F7EF` — éxito, activo, reactivar, rol Docente.
  - Naranja `#F2A23A` / `#FFF5E6` — advertencia, en proceso, cupo casi lleno, rol Estudiante.
  - Rojo `#EF5350` / `#FFF0F0` — peligro, inactivo, cupo lleno, eliminar.
  - Neutros: `#172235` (títulos), `#3F4D61` (texto general), `#788794` (texto secundario),
    `#DDE4EC` (bordes), `#FFFFFF` (superficies), `#F1F5F9` (gris suave / estado Pendiente).
- **Tipografía**: Plus Jakarta Sans. H1 42/48 SemiBold, H2 28/34 SemiBold, H3 20/26 SemiBold,
  Cuerpo 15/22 Regular, Etiqueta 13/18 Medium.
- **Botones**: usar las variantes ya definidas, no inventar nuevas — principal (azul sólido),
  outline de acción, búsqueda (azul sólido + icono), acción suave (editar, azul suave),
  peligro suave (eliminar, rojo suave + icono papelera), desactivar (gris neutro suave + icono círculo tachado),
  éxito suave (reactivar, verde suave + icono refrescar), secundario (cancelar, blanco/gris).
  Botones de icono en tablas: círculo 32px, icono 16px.
- **Chips/estados**: píldora con fondo claro y texto en el tono oscuro de su misma familia.
- **Tabla**: contenedor blanco con borde `#DDE4EC`, encabezado azul suave con texto en
  mayúsculas, acciones por fila con botones circulares.
- **Formularios de creación/edición**: drawer lateral, no modal — cabecera con título y botón
  cerrar, pie con "Cancelar" (secundario) + acción principal. Sin exceso de color.

### Implementación técnica (frontend) — ya construida, reusar siempre

El rediseño de `frontend/` (2026-09) implementó la guía anterior como tokens de Tailwind v4 y
una librería de componentes en `frontend/src/components/ui/`. **No crear tokens ni componentes
nuevos para lo que ya existe aquí** — extenderlos si falta un caso, no duplicarlos:

- **Tokens de color** (`frontend/src/index.css`, bloque `@theme`): `primary` / `primary-soft`
  (azul), `success` / `success-soft` (verde), `warning` / `warning-soft` (naranja), `danger` /
  `danger-soft` (rojo), y neutros `ink`, `body`, `muted`, `border`, `surface`, `soft`. Se usan
  como utilidades normales de Tailwind: `bg-primary`, `text-danger`, `bg-soft`, etc. — nunca
  `slate-*`, `indigo-*` ni otros colores por defecto de Tailwind.
- **Tipografía**: fuente Plus Jakarta Sans cargada en `index.html`; utilidades de tamaño
  `text-h1`, `text-h2`, `text-h3`, `text-body`, `text-label` (definidas en el mismo `@theme`).
- **Componentes base** (`components/ui/`): `Button` (variantes `primary`, `outline`,
  `secondary`, `soft-edit`, `soft-danger`, `soft-success`), `IconButton` (botón circular 32px
  para acciones de tabla, tonos `edit`/`danger`/`success`/`neutral`), `Chip` (píldora de
  estado/tono; alias `Badge` se mantiene por compatibilidad pero usar `Chip` en código nuevo),
  `RolBadge`/`EstadoUsuarioBadge`/`EstadoGrupoBadge`/`EstadoMatriculaBadge`/`EstadoEstudianteBadge`/
  `CupoBadge`/`DesempenoBadge`/`EstadoAnioLectivoBadge`/`EstadoPeriodoBadge` (M05) (chips ya mapeados a la familia de color correcta — no reinventar el
  mapeo rol→color o estado→color en una página), `Card`/`CardHeader`, `Table`/`TableHead`/`Th`/
  `TableBody`/`Td`/`EmptyRow`, `Drawer` (formularios de creación/edición; su botón principal
  acepta `submitVariant` para casos como confirmar un borrado en rojo), `PageHeader` (título +
  subtítulo + acción de la página), `Field` (`Input`/`Select`), `MultiSelect` (selector desplegable de selección múltiple con checkboxes, contador y badges de rol/estado), `Alert`, `Spinner`, `EstadoEspacioBadge` (M10), `EstadoAsistenciaChip`/`EstadoJustificacionBadge` (M13), `GuiaColumnas` (guía colapsable de columnas de una carga CSV), `ProgressBar` (barra de avance con tono, ej. semanas lectivas vs. el mínimo de 40), `Tabs`/`TabPanel` (navegación por pestañas con subrayado azul en la activa; reusar en vez de reinventar un switch de pestañas en otra página), `Stepper` (indicador de pasos para formularios largos por secciones, ej. el asistente de creación de estudiante en M03), e iconos SVG propios en `components/ui/icons.tsx` (no se agregó ninguna librería de iconos).
- **Contenedor global y densidad** (`components/layout/AppShell.tsx`): el `<main>` centra el
  contenido en `max-w-7xl` (no `max-w-5xl`) para que las tablas anchas (Usuarios, Grupos) no
  scrolleen antes de tiempo en pantallas grandes. Cada página usa `space-y-4` (no `space-y-6`)
  como separación entre sus secciones (`PageHeader`, `Alert`, `Card`, `Table`). Este ancho y
  este espaciado son el estándar del contenedor global — no se reduce el ancho ni se vuelve a
  `space-y-6` en una pantalla nueva sin pedirlo explícitamente, y el padding interno de
  `Table`/`Th`/`Td` no se toca por esta regla de densidad (es un ajuste del contenedor, no de
  las tablas).
- `Drawer` acepta `size="lg"` (opcional, por defecto `md`) para formularios de varias columnas, como la
  parametrización del año lectivo. Los componentes propios de M05 viven en `components/anioLectivo/`
  (`PeriodoCard`, drawers de año, cierre, prórroga, eventos y calendario por sede); las reglas de aviso de
  calendario A/B están en `lib/calendarioColombia.ts` y el formato de fechas en `lib/fechas.ts`.
- Todo módulo nuevo del frontend (M02 en adelante) debe construirse sobre estas mismas piezas.

### Regla dura para módulos futuros: reusar antes de crear

El objetivo de esta librería es que cada módulo nuevo (M02–M32) se vea como parte del mismo
producto sin que cada pantalla reinvente su propio estilo. Para que el ajuste visual de M01 no
se rompa ni se desvíe en pantallas futuras:

- **Buscar primero en `components/ui/` antes de escribir un color o estilo a mano.** Si la
  pantalla necesita un botón, chip, tabla, formulario o drawer, ya existe el componente — no se
  escribe `className` con colores Tailwind literales (`bg-blue-500`, `text-red-600`, etc.) en
  una página nueva.
- **No agregar tokens de color nuevos** (otro hex, otra familia) sin que el usuario lo pida
  explícitamente. Las 4 familias (`primary`/`success`/`warning`/`danger`, cada una con su
  variante `-soft`) más los neutros (`ink`/`body`/`muted`/`border`/`surface`/`soft`) ya cubren
  acción, éxito, advertencia, peligro y los roles/estados del negocio.
- **No agregar variantes nuevas** a `Button`, `Chip`/`Badge`, `IconButton`, etc. "por si acaso".
  Si un caso realmente no encaja en las variantes existentes, preguntar antes de inventar una
  nueva — casi siempre el caso ya está cubierto por una combinación de las que existen.
- **Los cambios a un componente compartido deben ser aditivos**, nunca romper su uso en las
  pantallas que ya existen: una prop nueva se agrega opcional con un valor por defecto que
  preserva el comportamiento actual (así se hizo con `submitVariant` en `Drawer`). No se cambia
  la firma, el comportamiento por defecto ni los estilos base de un componente ya usado en otra
  página sin revisar antes qué otras pantallas lo consumen.
- **Un patrón visual que no existe todavía** (ej. un selector de rango de fechas, un stepper de
  varios pasos) se construye como componente nuevo en `components/ui/`, no inline dentro de la
  página del módulo — y se agrega a esta lista antes de dar la tarea por terminada, para que la
  siguiente sesión lo encuentre aquí en vez de reconstruirlo.

## 7. Manejo de datos en frontend: TanStack Query (v5)

Todo el frontend ya migró su fetching de datos de servidor a `@tanstack/react-query` v5
(`QueryClientProvider` en `main.tsx`, cliente configurado en `lib/queryClient.ts`). Todo módulo
nuevo (M02 en adelante) — incluyendo notificaciones, actividades y entregas de docentes/
estudiantes — se construye sobre este mismo patrón, nunca con `useEffect` + `useState` manual:

- **Un hook por dominio, no por página**: la lógica de datos vive en `frontend/src/hooks/use<Dominio>.ts`
  (ej. `useCatalogs.ts`, `useGroups.ts`, `useUsers.ts`, `useEnrollments.ts`), no inline en el
  componente de página. Un módulo nuevo (`useNotifications.ts`, `useActividades.ts`,
  `useEntregas.ts`, etc.) sigue el mismo esquema.
- **Lectura con `useQuery`**, sintaxis de objeto de v5:
  `useQuery({ queryKey: ['dominio', ...params], queryFn: () => api.get(...), staleTime, enabled })`.
  `queryKey` empieza siempre por el nombre del recurso en plural (`'grades'`, `'groups'`,
  `'notifications'`) seguido de los parámetros de filtro que afectan la respuesta — así
  `invalidateQueries` puede apuntar a ese prefijo y refrescar todas las variantes filtradas.
- **Escritura con `useMutation`**, también sintaxis de objeto:
  `useMutation({ mutationFn: (input) => api.post/patch/delete(...), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['dominio'] }); } })`.
  Toda mutación que crea, edita, cambia estado o elimina invalida en su `onSuccess` la(s)
  `queryKey` del recurso afectado — así la tabla se refresca sola sin recargar la página ni
  volver a llamar manualmente al fetch.
- **`useState` se reserva para estado local de UI/formulario** (valores de un drawer, filtros
  antes de aplicarlos, pestaña activa, texto de búsqueda) — nunca para guardar la respuesta de
  una petición al backend ni para un flag de loading/error manual; eso ya lo da `useQuery`/
  `useMutation` (`isLoading`, `isPending`, `isError`, `error`, `data`).
- **No tocar el markup de la tabla** al conectar datos: los componentes de tabla
  (`Table`/`TableHead`/`Th`/`TableBody`/`Td`/`EmptyRow`, ver sección 6) solo reciben `data` del
  `useQuery` correspondiente vía `.map(...)` — el cambio de fetching nunca debe traer cambios de
  clases, estructura de `<table>` o de los componentes de UI.
- El `QueryClient` global (`lib/queryClient.ts`) ya define `retry`, `staleTime` por defecto y
  `refetchOnWindowFocus: false` — no crear un `QueryClient` nuevo ni pasar `defaultOptions` desde
  una página; si un caso puntual necesita otro comportamiento, se pasa como opción de ese
  `useQuery`/`useMutation` específico, no cambiando el cliente global.

## Documentos fuente

- `doc/Idea_Klassy_Gestor_Academico_Administrativo_v2.docx` — documento maestro: 32 módulos,
  actores, reglas de negocio y grafo de dependencias de datos.
- `doc/Klassy_UI_Spec_1.docx` — guía de identidad visual y especificación de componentes UI.
