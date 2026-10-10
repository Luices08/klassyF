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
   URI —es el escudo de los documentos oficiales—, `ciudad` y `departamento` opcionales —los usan los certificados de M26—, `estado` activo/inactivo). `GET/PATCH /institution`, página `InstitutionSetupPage`.
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

**Ficha 360° del grupo** (`GrupoFichaPage`, `/admin/groups/:id`; backend `GET /groups/:groupId/ficha` y `/ficha/horario`, `grupoFicha.service.ts`).
Es **solo lectura y solo ADMIN/COORDINADOR** (trae el listado de estudiantes y la carga docente; `GET /groups` sigue abierto a todo rol). Junta lo que otros
módulos son dueños de guardar y cada bloque tiene un botón al módulo de origen, nunca un formulario: aula (M10, no sale si la institución es virtual: muestra
«Modalidad virtual»), director (M08: sale de la `DIRECCION_GRUPO`; el campo `director_grupo_id` del grupo es solo respaldo y se avisa), estudiantes con matrícula
activa (M03/M04, enlazan a `/admin/students/:id`), plan de estudios del grado **con lo que M06 personalizó para ese grupo** (horas ajustadas, materias solo del
grupo) y el docente de cada materia, y el horario del grupo (M09: la versión publicada de su jornada o, si no hay, el último borrador marcado como tal; solo las
sesiones de ese grupo, y se pide al abrir la pestaña). Para que los botones lleguen con el contexto elegido, los destinos aceptan parámetros de URL
**opcionales** (sin ellos funcionan como siempre): Carga académica `?anio=&docente=` (filtra) y `?anio=&grupo=&grado=&asignatura=&tipo=DIRECCION_GRUPO` (abre la
asignación lista para confirmar; las horas de una clase se derivan siempre del plan, no de un "onChange"), Horarios `?anio=&sede=&jornada=&pestana=`, Espacios
`?sede=&espacio=`. Pruebas: `tests/integracion/grupoFicha.int.test.ts`.

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
  `ADMIN (100) > COORDINADOR (70) = COORDINADOR_CONVIVENCIA (70) = ORIENTADOR (70) > SECRETARIA (40) = DOCENTE (40) > ESTUDIANTE (10) = ACUDIENTE (10)`.
  Un usuario solo puede crear, editar, cambiar estado, resetear contraseña, cerrar sesiones o eliminar a
  usuarios de rango estrictamente MENOR (con la excepción de que un ADMIN sí puede gestionar a otros ADMIN,
  salvo a sí mismo).
- **`COORDINADOR_CONVIVENCIA` (M14/M15)**: rol aprobado por el usuario para procesos disciplinarios y comité de convivencia; es
  la excepción documentada a "un solo rol administrativo" (esa regla es sobre `SUPERADMIN`). Rango 70, par de `COORDINADOR`: solo
  un ADMIN lo gestiona. **No hereda nada del coordinador académico y viceversa**: los usos de `ROLES.COORDINADOR` no se amplían a
  este rol (`checkRole` es lista de permitidos). Exige al menos una sede (`ROLES_CON_SEDE_OBLIGATORIA`, validado en el modelo
  `User`). Convivencia decide el acceso con `permisoSobreEstudiante` y `alcanceDeSedes` (`utils/permisosConvivencia.ts`, función
  pura con tests): sin sedes asignadas no ve nada, y SECRETARIA y ACUDIENTE no tienen acceso (el acudiente entra con M27).
- **`ORIENTADOR` (Orientación / Psicología, M14/M15)**: el maestro (§3 y M02) lo lista como actor y rol base; se agregó con la misma lógica que
  `COORDINADOR_CONVIVENCIA`: rango 70 (solo un ADMIN lo gestiona), sede obligatoria (`ROLES_CON_SEDE_OBLIGATORIA`) y sin herencia de ningún
  otro rol. Sus funciones en este alcance son el seguimiento psicosocial (observaciones confidenciales) y las remisiones a orientación que
  recibe de convivencia. **El PIAR vive en M16** (ver su sección): orientación lo lidera. Tampoco ve la salud administrativa del estudiante en M03; dentro de un expediente M16 abierto lee EPS y régimen de M03 sin copiarlos.
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
  Todo módulo que mute notas debe pasar por ahí (hoy lo hace `notas.service#registrarNotas`, que usan la planilla y `gradeActivity`).
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

### M14 (Observaciones y convivencia — Observador) — estado: núcleo completo

Backend `/observaciones` (modelos `TipoObservacion`, `Observacion`, `ConfiguracionConvivencia`; la falta del manual y la solicitud de caso
viven en M15), frontend `ObservadorPage` (`/convivencia/observador`), `CatalogoConvivenciaPage` (`/convivencia/catalogo`), `MiObservadorPage`
(`/mi-observador`) y la pestaña "Observador y bienestar" de la ficha del estudiante. Análisis: `doc/Analisis_M14_M15_Klassy.md`.
Reglas que no se ven leyendo un solo archivo:

- **Una observación NO es una falta.** Una sola colección `Observacion` con `clase` = `OBSERVACION` | `FALTA`, pero con contratos distintos
  (se validan en el modelo y en `observacion.validator.ts`):
  - **Observación** (lo cotidiano, Idea_Klassy M14): `tipo` (configurable), `descripcion` de los hechos (texto libre), `compromiso` (texto
    opcional), `requiere_citacion` (booleano) y `confidencial` (booleano). Se asienta de inmediato en el Observador y en el historial.
  - **Falta** (`POST /observaciones/faltas`, la registra el docente de clase o el titular de grupo, y convivencia): el docente **elige una falta
    del manual** (`FaltaConvivencia`, M15) y **no tipifica**: la gravedad I/II/III sale de la falta. **Tipo I** se queda en el Observador (hechos,
    versión del estudiante y compromiso opcionales; puede marcar "remitir al comité"). **Tipo II/III** (o una Tipo I remitida) crea siempre una
    `SolicitudCaso` con hechos, involucrados con su rol (afectado, presunto responsable, testigo, reportante) y las acciones de contención; el
    coordinador de convivencia abre el caso formal (M15). El antecedente en el Observador solo queda en los presuntos responsables.
- **El catálogo es de cada colegio, no del sistema.** Solo se siembran los tipos base "Académica" y "Comportamental" (no hay `familia`: el sistema
  no distingue tipos por nombre). ADMIN y `COORDINADOR_CONVIVENCIA` agregan, editan, desactivan y eliminan (eliminar solo lo no usado; lo
  usado se desactiva). **No existen categorías ni "frases"**: se eliminaron porque eran de otro módulo; las faltas (con gravedad) son de M15.
- **La observación copia lo que se eligió** (tipo, `visible_estudiante`, falta) al guardarse: editar o desactivar el catálogo no altera ni revela
  lo ya registrado. No se borra: se **enmienda** (versión anterior en `enmiendas[]`) o se **anula** con motivo. El autor puede hacerlo dentro de
  `ConfiguracionConvivencia.plazo_*_horas` (48 h por defecto); coordinación de convivencia (de sus sedes) y ADMIN sin plazo; nunca con el año
  CERRADO. Una falta ya remitida a convivencia solo la corrige convivencia.
- **Quién ve qué** lo decide el servidor con `permisoSobreEstudiante` (`utils/permisosConvivencia.ts`) y la función pura `visibilidadDeObservacion`
  (`utils/observaciones.ts`: COMPLETA / RESERVADA / nada; el listado y el detalle usan la misma). ADMIN y coordinación de convivencia ven todo en su
  alcance; una **confidencial** solo la ven su autor, `ORIENTADOR`, coordinación de convivencia y ADMIN; las **faltas** no las ve el coordinador
  académico; de una falta II/III el director de grupo y el orientador solo ven que existe (`reservada`); el estudiante (menor o mayor) ve en `MiObservadorPage` sus
  observaciones no confidenciales de tipos `visible_estudiante` y sus faltas: la Tipo I completa (descripción de la falta, hechos, su versión,
  compromiso); de una Tipo II/III solo que hay una situación de convivencia y el estado del caso (`situacion`, o `EN_REVISION` si la solicitud sigue
  pendiente), nunca la falta ni los hechos porque el caso está en debido proceso e involucra a otros menores. "No existe" y "no autorizado" responden igual (404). Nunca se
  devuelve el documento crudo (`vistaObservacion`).
- **`ORIENTADOR`** (rango 70, sede obligatoria): registra seguimiento psicosocial (contexto `ORIENTACION`, **siempre confidencial**), ve el
  historial y recibirá las remisiones a orientación (M15). Su alcance son las sedes asignadas.
- **Registrar exige matrícula activa en el año EN_CURSO**, fecha no futura y dentro de un periodo (calendario de la sede, M05). Un hecho con
  varios estudiantes crea un registro por estudiante (`evento_id` común) en una transacción: todos o ninguno.
- **Buscador propio** (`GET /observaciones/estudiantes`, `/grupos`): acotado a los grupos del docente (CLASE o dirección) o a las sedes del
  coordinador/orientador. No se abre `/students` a convivencia.
- **Se audita también la lectura** (`CONVIVENCIA_HISTORIAL_CONSULTADO`, `..._OBSERVACIONES_PROPIAS_CONSULTADAS`). El `detalle` de la auditoría
  nunca lleva contenido (ni el motivo de una anulación, que queda en el registro).
- **Seguimiento** (embebido en `Observacion`): `seguimientos[]` (notas), `compromiso_estado` (PENDIENTE → CUMPLIDO/INCUMPLIDO; "vencido" no es un
  estado, lo calcula el servidor) y `citacion_realizada` (**solo registro**: cuándo, medio, resultado; el envío es de M28). Los agrega el autor o
  coordinación, nunca en un año CERRADO ni sobre un registro anulado.
- **La única carga masiva de convivencia es la de faltas** (ver M15). Las observaciones y el catálogo de tipos no se cargan por archivo. **La
  migración histórica de un observador antiguo quedó fuera**: exige decidir cómo representar años lectivos que no existen en el sistema.
- **Pruebas con base real**: `tests/integracion/` usa `mongodb-memory-server` con réplica (solo dev; la primera ejecución descarga el binario de
  MongoDB). `npm test` las incluye.
- **Retención**: es política del colegio (`ConfiguracionConvivencia.retencion_anios_*`, vacío = sin plazo); `GET /convivencia/retencion` solo informa lo
  vencido, nunca borra. **Pendiente, a propósito**: la migración histórica. Registrar "en nombre de" un docente existe en la API
  (`en_nombre_de_id`) pero aún no tiene pantalla. El descuento de décimas por falta está diferido (solo se guarda).

### M15 (Comité de Convivencia Escolar) — estado: casos, comité y actas completos

Backend `/convivencia` (modelos `CasoConvivencia`, `MedidaConvivencia`, `EntidadExterna`, `ProtocoloConvivencia`), frontend
`CasosConvivenciaPage` (`/convivencia/casos`), `SolicitudesCasoPage` (`/convivencia/solicitudes`, abre caso desde la solicitud que envió el docente) y
las pestañas Faltas / Medidas / Entidades / Protocolos / Plazos de `CatalogoConvivenciaPage`. Modelos nuevos: `FaltaConvivencia`, `SolicitudCaso`. Reglas que no se ven leyendo un solo archivo:

- **Solo convivencia ve un caso**: ADMIN y el `COORDINADOR_CONVIVENCIA` de la sede del caso (ni coordinador académico, ni secretaría, ni
  docente). "No existe" y "no autorizado" son el mismo 404. Quien se declara impedido (o un ADMIN lo aparta) por conflicto de interés
  deja de verlo (`impedidos[]`, RN-15-11); el ADMIN siempre puede auditarlo. El director de grupo solo ve, en su historial, que existe un
  caso y su estado (`caso` en la observación reservada). **Todo detalle de caso se audita**, sin muestreo.
- **Faltas del manual** (`FaltaConvivencia`: código del manual único por institución, descripción, `gravedad` I/II/III, `descuento_decimas` solo
  guardado, `estado`; sin categoría ni "frases"): las definen ADMIN y `COORDINADOR_CONVIVENCIA` en `/convivencia/faltas` (alta/edición/estado/
  eliminar solo si no se usó) y por **carga Excel/CSV** (`/convivencia/faltas/importacion` y `/plantilla`; `importacionFaltas.service.ts`,
  `COLUMNAS_FALTAS` en `constants/importacionConvivencia.ts` y su guía en `lib/columnasImportacion.ts`, que se actualizan en el mismo cambio). Es la
  **única carga masiva de convivencia**: `.xlsx` o `.csv` por el mismo canal (`leerCsv` o `exceljs` → filas normalizadas → un plan de validación), **se
  valida todo el archivo antes de escribir** (una fila con error y no se guarda nada), idempotente por código, fórmulas neutralizadas al generar y
  rechazadas al leer, firma ZIP, 2 MB, 1000 filas. Cada carga queda en un `LoteImportacion` (solo la huella SHA-256, no el archivo).
- **`SolicitudCaso` es el traspaso M14 → M15**: la crea el registro de una falta Tipo II/III (o una Tipo I que el docente remite) con la falta (copiada),
  los hechos, los involucrados con su rol y las acciones de contención. La atiende convivencia de la sede desde `/convivencia/solicitudes`
  (`GET`, auditada): **abrir caso** (`POST /convivencia/casos` con `solicitud_id`, la solicitud pasa a CONVERTIDA y el caso hereda hechos,
  involucrados y `contencion_reportada`) o **descartar con motivo**. Un caso también puede abrirse directo (`origen`: `SOLICITUD` | `DIRECTO`).
- **Tipos I/II/III fijos (ley); todo lo demás es del colegio.** El tipo lo fija quien abre el caso (no el docente); subir de tipo es de
  convivencia con motivo (y suma los pasos del protocolo nuevo sin perder lo hecho); bajarlo, solo ADMIN. Las faltas del manual son las
  `FaltaConvivencia`: la decisión las referencia (`faltas_ids`, copiadas). `ProtocoloConvivencia` (pasos por tipo) se **copia** al caso al abrirlo:
  editar el protocolo no altera casos en curso.
- **Flujo por tabla** (`TRANSICIONES_CASO`, `utils/casoConvivencia.ts`): ABIERTO → EN_ATENCION → EN_MEDIACION → EN_SEGUIMIENTO, REMITIDO
  (exige haber registrado la remisión; sigue en seguimiento). **Cerrar** no es transición genérica: `pendientesParaCerrar` exige pasos
  obligatorios cumplidos; en II y III, atención inmediata e informe a los acudientes; en III, remisión o justificación escrita; y según el
  resultado, remisión (REMITIDO) o decisión + medida (MEDIDA_APLICADA). **La decisión exige descargos previos** (presunción de inocencia).
  Reabrir y anular son solo ADMIN con motivo (anular solo un caso recién ABIERTO y devuelve su solicitud a PENDIENTE).
- **Consecutivo anual sin huecos** (`CC-<año>-0001`): `Counter` dentro de la misma transacción de la apertura; si falla, no se consume.
  Un caso **no se bloquea** al cerrar el año lectivo (RN-15-09); abrir sí exige el año EN_CURSO. Un mismo hecho con varios estudiantes es un
  caso con varios involucrados (el permiso se comprueba por estudiante).
- **Alertas calculadas** (`alertasDeCaso`): tipo III sin remisión pasado `plazo_remision_tipo_iii_horas` y seguimiento con próxima fecha
  vencida. M15 las muestra; el envío de avisos es de M28.
- **Comité y actas** (`/convivencia/comite`, `ComitePage`): `MiembroComite` por año (usuarios del sistema o **designaciones externas**: personero,
  representante de padres; solo uno preside), `SesionComite` (BORRADOR → FIRMADA, o ANULADA). El **consecutivo del acta (`AC-<año>-001`) nace
  al firmar**, dentro de la transacción, así un borrador anulado no deja huecos. **Firma solo el ADMIN (rector)**, con quórum
  (`ConfiguracionConvivencia.quorum_porcentaje`, 51 por defecto) y desarrollo escrito. Un acta firmada es **inmutable en el modelo** (hook de
  `pre('save')`: solo admite `anexos`) y lleva una **huella SHA-256** (`hashDeActa`) que `GET .../integridad` recalcula para detectar cambios
  hechos directo en la base. **Recusación (RN-15-11)**: por cada caso tratado se marca a los miembros apartados; no cuentan ni como miembro ni como
  presente para el quórum de ese caso, y quien (siendo usuario) se declaró impedido en el caso queda recusado solo. El PDF (`pdfkit`) identifica
  el caso solo por su código, marca el borrador como tal, se baja con sesión y queda auditado. Alertas de casos: `GET /convivencia/alertas`.
- **Remisión a orientación** (`RemisionOrientacion`, colección aparte; `remisionOrientacion.service.ts`): `MedidaConvivencia` y cada paso del
  protocolo tienen la bandera `remite_a_orientacion` (la define el colegio en el catálogo). Aplicar una medida marcada o cumplir un paso marcado
  remite a orientación a los **afectados y presuntos responsables** del caso (`ROLES_QUE_SE_REMITEN`; no a testigos ni reportantes), en la misma
  transacción del cambio, y es idempotente por `clave` (caso+estudiante+medida/paso). Convivencia también remite a mano
  (`POST /convivencia/casos/:id/orientacion`). La remisión copia el contexto del caso (código, tipo, hechos) para que orientación **vea los hechos pero no
  a los demás involucrados**. Un caso con remisiones a orientación no se anula.
- **Orientación** (`/orientacion/remisiones`, `OrientacionPage`; solo `ORIENTADOR` de la sede y ADMIN, "no existe" = "no autorizado" = 404): estados
  PENDIENTE → EN_ATENCION (con la primera atención) → ATENDIDA (exige al menos una atención). Las **atenciones son confidenciales**: solo las lee quien
  las escribió y un ADMIN (otro orientador ve que existe, no el texto); convivencia ve desde su caso solo estado y fechas (`remisiones_orientacion`), y
  la auditoría nunca lleva el contenido. Solo el orientador registra atenciones; ADMIN solo consulta. La lectura se audita (`ORIENTACION_*`).
- **Pendiente, a propósito**: portal del acudiente/estudiante (M27), descuento en notas (diferido). El PIAR es M16.

### M16 (Inclusión — PIAR y plan de apoyo pedagógico) — estado: núcleo completo

Backend `/inclusion` (modelos `SolicitudApoyo`, `ExpedienteInclusion`, `AjusteAsignatura`, `DocumentoPiar`, `ConfiguracionInclusion`), frontend
`InclusionPage` (`/inclusion`), `ExpedienteInclusionPage` (`/inclusion/expedientes/:id`), `MisAjustesPage` (`/docente/ajustes-razonables`) y la sección
«Educación inclusiva» de la pestaña «Observador y bienestar» de la ficha del estudiante. Análisis y decisiones: `doc/Analisis_M16_Integral_Klassy.md`
(el `doc/Analisis_M16_Klassy.md` previo se contrastó y se corrigió: no usar sus modelos). Reglas que no se ven leyendo un solo archivo:

- **PIAR ≠ plan de apoyo.** El PIAR (Decreto 1421) es solo para discapacidad. El «plan de apoyo pedagógico» (TDAH, dislexia, rezago) es un expediente liviano
  del mismo módulo (`tipo: PLAN_APOYO`): sin categoría de discapacidad, sin ajustes por asignatura, sin anexos del MEN; **no se llama PIAR ni DUA**
  (el DUA es planeación de aula para todos). Talento excepcional queda fuera. Su rótulo de necesidad es dato de salud igual.
- **Un expediente por estudiante y año** (índice único), ligado al estudiante y no al grupo: el grupo vigente sale de su `Enrollment` activo (puede cambiar
  durante el año). Estados por tabla (`TRANSICIONES_EXPEDIENTE`): BORRADOR → EN_CONSTRUCCION → LISTO_PARA_ACUERDO → ACTIVO (nace al firmar el acta) → CERRADO.
  Un año CERRADO deja todo en solo lectura leyendo el año (no se tocó M05). El plazo de elaboración es parámetro del colegio (días) y **solo alerta**.
- **Entrada única: `SolicitudApoyo`** (como `SolicitudCaso` en M14→M15). Orígenes: matrícula directa y preinscripción pública (campo opcional
  `apoyo_declarado` en la creación de `Enrollment` y en `AdmissionRequest`, creada en la misma transacción — único cambio en M04), docente (de clase o
  director de grupo, **con hechos observados, sin diagnosticar**), convivencia y directo. Secretaría solo transcribe lo declarado; orientación valora y decide
  (`ABRIR_PIAR`, `PLAN_APOYO`, `SEGUIMIENTO_PSICOSOCIAL`, `RUTA_SALUD`, `DESCARTAR`, siempre con motivo). El docente solo ve que su reporte existe y su estado.
- **Quién ve qué** lo decide `permisoInclusion` (`utils/permisosInclusion.ts`, función pura con tests, lista de permitidos, sin herencia): orientación (de
  sus sedes) y ADMIN ven todo; **coordinación** supervisa y aprueba pero no ve lo clínico ni la modalidad; el **docente** ve la *ficha pedagógica* (barreras,
  recomendaciones, pautas de evaluación, una «alerta de seguridad» opcional escrita por orientación) y edita **solo la asignatura que dicta**; el director
  de grupo ve los ajustes de todas las de su grupo y edita las dimensiones transversales. **Ningún docente ve la modalidad (PIAR/plan) ni la categoría SIMAT**
  (revelarían la condición). SECRETARIA, COORDINADOR_CONVIVENCIA, ACUDIENTE y ESTUDIANTE no tienen acceso (acudiente: M27). «No existe» = «no autorizado» = 404.
  El buscador reusa el de convivencia (`gruposAccesibles`/`buscarEstudiantes`); no se abre `/students`.
- **Datos sensibles (Ley 1581/1098).** Sin la **autorización específica del responsable legal** (`consentimiento`, propia de M16, distinta de la de salud de
  M03) no se guarda nada clínico, no se inicia la construcción ni se emite ningún documento; revocarla lo bloquea de nuevo. EPS y régimen **se leen de M03**
  dentro del expediente abierto (nunca se copian al expediente). Los soportes clínicos van a `uploads/inclusion/<expediente>/` (firma de bytes, 5 MB), solo se
  descargan con sesión y permiso, y cada descarga y **cada consulta de un expediente se audita** (el `detalle` nunca lleva contenido). El soporte clínico es
  **opcional**: no condiciona la atención pedagógica (sí el reporte a SIMAT); la categoría puede quedar `POR_CONFIRMAR`.
- **Anexo 2 por asignatura** (`AjusteAsignatura`, único por expediente+asignatura, ligado a la asignatura y no al docente porque el docente se reemplaza):
  las filas esperadas salen del **plan de estudios del grupo** (M06) y el docente de cada una de `TeacherAssignment` (M08); nunca se inventan filas. Los
  objetivos se **eligen del banco curricular** (DBA, M07, por `_id`; el docente no escribe un DBA). Seguimiento por ajuste y periodo (mínimo configurable,
  3 por defecto según el formato/SIEE) solo con el expediente ACTIVO y un periodo iniciado y no cerrado (M05).
- **Versionado.** Cada cambio con el expediente aprobado o firmado sube `version` y devuelve lo aprobado a construcción; un documento emitido con una
  versión anterior queda «desactualizado» y **no se puede firmar** (hay que emitirlo de nuevo). Las ediciones quedan en `ediciones[]` del ajuste.
- **Documentos** (`DOCUMENTOS_PIAR` en `constants/inclusion.ts`, por **clave, no por número de anexo**: la numeración varía por fuente): Anexo 1 información
  general (confidencial), PIAR (Anexo 2), acta de acuerdo con la familia, informe anual, **acta oficial PIAR** (paquete: portada + Anexo 1 versión carpeta sin
  datos clínicos + PIAR + acta) y plan de apoyo (confidencial). Cada emisión **congela un snapshot**, asigna consecutivo anual sin huecos (`Counter`,
  `PIAR-2026-0001`) y una **huella SHA-256** (`huellaDelDocumento`; `GET /inclusion/documentos/:id/integridad` la recalcula); el modelo impide editar lo emitido
  y el PDF (`piarPdf.service.ts`, pdfkit) se dibuja **solo desde el snapshot**, con el código y la huella corta en cada hoja. Firma **física + escaneo** (v1):
  la firma institucional de las actas es solo del ADMIN (rector), el estudiante menor la firma con su acudiente y el mayor de edad por sí mismo; al firmar el
  acta el expediente pasa a ACTIVO. Re-emitir sustituye lo no firmado; lo firmado nunca se sustituye.
- **Dónde se definen los documentos.** M16 define **qué lleva** cada uno (formatos normativos del MEN, no formularios libres). **Cómo se ven** (logo, encabezado,
  textos) lo personalizará M21/M32 y el archivo general será M29; hoy hay un solo punto de enganche: `encabezadoInstitucional.service.ts` (institución, DANE,
  NIT, resolución, sede, jornada, año y `logo_url`) y el registro `DOCUMENTOS_PIAR`. **No se construyó un constructor de plantillas en M16.**
- **Configuración** (`ConfiguracionInclusion`, ADMIN): plazo de elaboración, seguimientos mínimos, retención (vacío = sin plazo; nunca se borra), textos de las
  dos declaraciones del acta y versión de la política de datos. Las categorías de discapacidad (SIMAT) son una constante **versionada a validar** con el
  anexo técnico vigente del MEN.
- **Pruebas:** unitarias (`permisosInclusion`, `inclusion`, `piarPdf`) y de integración con base real (`tests/integracion/inclusion.int.test.ts`).
- **Pendiente, a propósito**: portal del acudiente (M27) y notificaciones (M28); archivo y versiones generales (M29); constructor de formatos y personalización
  (M21/M32); advertencia en la planilla de notas y ajuste de la evaluación (M12, solo se expone `GET /inclusion/grupos/:groupId/indicador`); anexo del informe
  al boletín final (M17) y promoción (M19/M20); reportes SIMAT (M30); firma electrónica certificada; cierre automático del expediente al retirar la matrícula
  (hoy se cierra a mano); aviso de informes anuales pendientes en la verificación de cierre del año (M05); carga de soportes por secretaría; contrastar los
  campos con el formato oficial del MEN y el anexo técnico SIMAT (**validar**).

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

### M06 (Plan de estudios) y M08 (Carga docente) — reglas que no se ven en un solo archivo

- **El tope de horas semanales del plan es configuración institucional** (`Institution.limites_horas_plan_estudios`, por
  nivel) y lo exige el **servidor** (`exigirTopeDeHoras` en `studyPlan.service.ts`), por grado y por grupo; la pantalla solo
  lo refleja. Al cambiar la base de un grado también se revisan sus grupos personalizados, que heredan esas horas.
  Bajar el tope no bloquea ni invalida planes ya guardados: la respuesta de `PATCH /institution/limites-horas-plan` trae
  `grados_excedidos` (planes de años no cerrados que quedaron por encima) y la pantalla los lista.
- **El plan no se congela entero al activar el año; se congela por dependencias** (`planEstudiosDependencias.service.ts`).
  Año CERRADO: histórico, no se toca. PLANIFICACION: libre. EN_CURSO: todo cambio exige `motivo` (queda en auditoría) y solo
  se permite lo que no tiene resultados calculados encima: las horas semanales siempre (no entran en el cálculo de notas, y se
  propagan a las asignaciones docentes de M08 con `sincronizarHorasDeAsignaciones`); agregar/quitar asignaturas o cambiar
  ponderaciones solo si el área no tiene actividades en ese grado/grupo. Quitar una asignatura del plan exige antes retirar
  su asignación docente, en cualquier estado del año. El versionamiento completo del Análisis_M06 (nueva versión con fechas
  e impacto) queda para cuando existan M09 y el cálculo de boletín por periodo (M12).
- **Una asignatura que ya está en la malla, en una ponderación o en la distribución de un grupo de cualquier plan no cambia de
  `area_id`** (`actualizarSubject`): dejaría ponderaciones colgando de un área que ya no es la suya.
- **Topes de carga docente** (`Institution.limites_carga_docente`, `max_direcciones_grupo_por_docente`,
  `tolerancia_subcarga_horas`) se editan juntos en M08 y no hay valores quemados en el diagnóstico. El semáforo es la función
  pura `resumirCargaDocente` (`utils/cargaDocente.ts`, con tests en `backend/tests/`, `npm test`): un docente en varios niveles se
  mide como fracción de su jornada (`fraccion_carga`), y sin horas por nivel no se supone ninguno (`SIN_CARGA`).
- **Las horas de una dirección de grupo las fija quien la asigna** (`horas_semanales`, 0 por defecto = no suma). Si son más de 0
  cuentan en el nivel del grupo dirigido, igual que una clase.
- **Asignar una dirección a un grupo que ya tiene director exige `reemplazar_director: true`** (409 si falta); el anterior queda
  inactivo (historial) y se audita `ASIGNACION_DOCENTE_REEMPLAZADA`. El límite de direcciones por docente se protege de la
  concurrencia con un contador común dentro de la transacción (`DIR-<año>-<docente>`).

### M09 (Horarios) — estado: completo (motor, API y pantallas)

Diseño en `doc/Analisis_M09_Horarios.md`. Backend `/horarios` (`horario.controller.ts`, `horario.service.ts`,
`horarioPdf.service.ts`), frontend `/admin/horarios` (`HorariosPage`, ADMIN/COORDINADOR) y `/mi-horario`
(`MiHorarioPage`, consulta para DOCENTE/ESTUDIANTE/ACUDIENTE). Reglas que no se ven leyendo un solo archivo:

- **M09 no crea insumos, los lee**: horas y docente de `TeacherAssignment` (CLASE, M08), días y franjas de
  `JornadaOperativa`, espacios de M10. Lo propio de M09 son `VariableHorario` (restricciones/preferencias) y `Horario`
  (versiones).
- **Una sola forma para todas las variables**: tipo + severidad (`DURA`/`BLANDA` con peso 1–10) + alcance (`GLOBAL`,
  `GRADOS` con lista, `GRUPOS` con lista) + filtros de asignatura/docente + `parametros` del tipo. Una regla nueva es
  un tipo más en `constants/horarios.ts` (con su metadato) y su caso en el motor, nunca una colección nueva.
- **Cascada** (`resolverVariables`, `utils/motorHorarios/alcance.ts`): en tipos de valor único gana la más específica
  (GRUPOS > GRADOS > GLOBAL; a igual alcance, nombrar docentes/asignaturas gana); las relaciones se acumulan; una
  excepción anula las de su tipo igual o menos específicas que cubre. No duplicar esta lógica en servicio ni frontend.
- **El motor es puro** (`utils/motorHorarios/`, sin Mongoose, tests en `tests/motorHorarios.test.ts`): el servicio
  traduce documentos a `EntradaMotor` con ids string. Los periodos son índices entre las franjas `CLASE`; el día que se
  guarda es ISO.
- **Diagnóstico antes que motor**: `diagnosticarCapacidad` explica lo imposible (horas > periodos, horas > franjas
  libres del docente, `BLOQUES_NO_CABEN`). La pantalla debe mostrarlo antes de dejar generar.
- Publicar exige 0 conflictos duros (lo valida el modelo) y hay una sola versión `PUBLICADO` por año + jornada.

### M13 (Asistencia) — estado: núcleo completo

Backend `/attendance` (modelos `AttendanceState`, `Attendance`, `AttendanceJustification`), frontend `/docente/asistencia`
(`AsistenciaPage`: planilla del mes y registro diario) y `/asistencia/gestion` (`GestionAsistenciaPage`: estadísticas,
justificaciones, reportes PDF y, solo ADMIN, estados). Reglas que no se ven leyendo un solo archivo:

- **Los estados son configuración, las banderas son el contrato.** `AttendanceState` (por institución; se siembran 4 la primera vez:
  Presente/Ausencia/Retardo/Excusa) tiene `cuenta_como_falla`, `es_retardo`, `es_justificada` y `es_predeterminado`. Ningún reporte, ni
  el boletín (M17), compara por nombre: renombrar un estado no cambia nada. Un estado es falla, retardo o ninguno (nunca ambos), el
  predeterminado no puede ser falla/retardo y siempre hay uno activo. Los estados no se eliminan, se desactivan (los registros viejos
  siguen resolviendo su estado). El `tono` es uno de los 5 de `Chip`, no un color nuevo.
- **La planilla es una por grupo+asignatura+día** (índice único) con `registros[]` embebidos. Volver a guardar **actualiza** cada registro
  por estudiante, no reemplaza el arreglo: el `_id` del registro es estable porque la justificación se ancla a él.
- **Planilla clásica = cuadrícula mensual** (`GET/PUT /attendance/cuadricula`, `attendanceCuadricula.service.ts`, `CuadriculaAsistencia`):
  estudiantes en filas y los días de clase del mes en columnas. Los días salen de `JornadaOperativa.dias_habiles` y del calendario de M05
  (se omiten recesos/vacaciones y días fuera de los periodos; los futuros o de periodo cerrado se ven pero no se editan). Es la vista principal
  del docente; el registro diario (con novedades, justificar y Excel) es la misma planilla vista de un día. `PUT` guarda varios días de una
  clase en un lote (`registrarAsistenciaLote`): primero **valida todos** los días y solo entonces escribe. En la pantalla, en un día tocado los
  estudiantes sin marcar se guardan con el estado predeterminado (se ven atenuados como "implícito").
- **Quién ve qué planilla** (`permisoSobreClase`): el docente **edita** las clases que dicta (`TeacherAssignment` CLASE, M08) y **consulta** las
  demás asignaturas del grupo que dirige (`Group.director_grupo_id`); ADMIN/COORDINADOR/SECRETARIA solo consultan (la asistencia la toma el
  docente). `GET /attendance/clases` arma el selector con ese mismo criterio.
- **PDFs** (`GET /attendance/pdf/*`, `asistenciaPdf.service.ts`, `pdfkit`; el permiso fino lo decide el servicio): `planilla` (un mes, o un
  periodo = una hoja por mes + resumen; la imprime quien pueda ver esa clase), `consolidado-grupo` (fallas por asignatura y totales por estudiante;
  ADMIN/COORDINADOR y el director de ese grupo), `reporte` (institucional: por grado con sus grupos, por asignatura y matriz grado × asignatura;
  solo ADMIN/COORDINADOR) y `estudiante` (ficha con el historial de inasistencias; ADMIN/COORDINADOR/SECRETARIA). Los colores del papel son los
  mismos de la guía visual. Todos se bajan con sesión (`descargarPdfAsistencia`), nunca por URL directa.
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
- **Trabajo sin conexión (CU-DOC-05)**: `GET /attendance/planilla/excel` baja la planilla en `.xlsx` (`attendanceExcel.service.ts`, `exceljs`) y
  `POST /attendance/planilla/excel` la importa. Google Sheets no tiene integración propia: importa y exporta ese mismo `.xlsx`. El archivo lleva
  una hoja `Datos` oculta con grupo, asignatura y fecha, así que subirlo no depende de lo que el docente tenga seleccionado; el estudiante se
  identifica por `numero_documento` (texto, conserva ceros) y el estado por nombre o abreviatura. Se valida **toda** la hoja antes de guardar
  (documento ajeno, estado desconocido, fila repetida = error de fila, no se guarda nada) y guardar pasa por `registrarAsistencia`, o sea las
  mismas reglas de la planilla en línea. Solo DOCENTE; máximo 2 MB, firma ZIP verificada.
- **Pendiente, a propósito fuera de alcance**: la vista del acudiente (CU-ACU-02, depende de M27); umbrales de ausentismo (alertas por %), que
  serían política institucional.

### M26 (Secretaría académica — certificados y constancias) — estado: núcleo completo

Backend `/certificados` (modelos `CertificadoEmitido`, `TipoCertificado`, `PlantillaCertificado` y `ConfiguracionCertificados`; verificación pública en `/public/certificados/verificar`), frontend
`CertificadosPage` (`/secretaria/certificados`, ADMIN y SECRETARIA: pestañas Expedir / Historial / Firmas y sellos [ADMIN todo; SECRETARIA su firma, el sello y, con delegación, la de Rectoría] / Tipos de documento / Plantillas [ADMIN en todo tipo no archivado; SECRETARIA solo en borradores]) y `VerificarCertificadoPage`
(`/verificar` y `/verificar/:token`, sin sesión; es la tarjeta «Validación de Certificados» del Home). Análisis y decisiones: `doc/Analisis_M26_Klassy.md`.
Reglas que no se ven leyendo un solo archivo:

- **Cero redundancia: el cliente solo manda ids y opciones.** Al expedir se envía `enrollment_id`, `tipo`, `destinatario` (opcional) y los switches; el
  contenido (colegio, DANE, NIT, resolución, sede, jornada, datos del alumno, grado, grupo, folio del Libro de Matrícula) lo arma `prepararDocumento`
  (`certificado.service.ts`) leyendo M01/M03/M04. Joi descarta cualquier otro campo (`stripUnknown`). Un dato nuevo que el sistema ya conoce **no se pide en la
  pantalla**: se agrega al snapshot.
- **Los tipos de documento son datos, no código** (`TipoCertificado`, `tipoCertificado.service.ts`, pestaña «Tipos de documento»). Secretaría y el ADMIN **crean, editan, archivan y
  eliminan** tipos (nombre, descripción, prefijo del consecutivo, estados de matrícula con los que aplica, fuentes de datos, política de firmas y su texto). `TIPOS_INICIALES`
  (`constants/certificados.ts`: constancia de estudio `CE`, certificado de matrícula `CM`, paz y salvo `PS`, certificado de estudio `CS`) son solo la semilla: se siembran **una sola
  vez** (`ConfiguracionCertificados.tipos_sembrados`), una instalación anterior conserva su política por documento, y si el colegio elimina uno **no vuelve**. Nada del servicio ni de la
  pantalla compara por nombre de tipo: lo que cambia el comportamiento son las **fuentes** (`FUENTES_CERTIFICADO`: `VALORACIONES` = tabla de notas + concepto de promoción, `DEPENDENCIAS` =
  confirmación de «sin pendientes» del paz y salvo). Quien configura **enciende** una fuente; el código sabe leerla (una fuente nueva es una entrada ahí y su lectura en la expedición).
  El responsable legal (`acudiente.*`) se lee y se congela **solo si el texto del tipo lo usa**. Consecutivo anual sin huecos por prefijo (`Counter` `CERT-<prefijo>-<año>` en la transacción).
- **Ficha del estudiante al expedir** (`matriculasExpedibles`, `TarjetaEstudiante`; solo lectura de M01/M03/M04, la consulta se audita sin contenido): datos del estudiante, su matrícula (sede, jornada,
  horario, folio, libro, ingreso), los acudientes **activos** con el principal primero (nombre, parentesco, documento, teléfono), la EPS (si hay autorización) y `faltantes`: lo que le
  falta al sistema para que los documentos salgan completos (acudiente principal, lugar de expedición, ciudad del colegio, folio). Sirve para ver el problema antes de que el 409 lo anuncie.
- **Quién solicita el documento** (`solicitante`, obligatorio al expedir y no en la vista previa; `resolverSolicitante`, función pura con tests): `ACUDIENTE` (vinculado y activo en M03),
  `ESTUDIANTE` (solo mayor de edad, por `fecha_nacimiento`), `TERCERO` (nombre, documento, relación y confirmación de que presentó la **autorización escrita** del acudiente) o `AUTORIDAD`
  (entidad y número de oficio). Queda en `CertificadoEmitido.solicitante` (inmutable en el modelo), se ve en el historial y **no se imprime**; la auditoría solo guarda el tipo. Existe por la
  Ley 1581/2012 (art. 7, datos de menores) y la Ley 1098/2006: un certificado trae datos personales de un menor y saber a quién se entregó es parte de su trazabilidad.
- **Anulación masiva por elemento comprometido** (`certificadoRevocacion.service.ts`, solo ADMIN, en «Firmas y sellos»): **cambiar el sello o una firma no anula lo ya expedido** (cada documento
  conserva las imágenes con las que salió). Si una imagen se robó o se usó sin autorización, el ADMIN ve las imágenes usadas (huella, cuántos documentos vigentes, desde/hasta, cuál es la actual),
  elige una, ve cuántos documentos alcanza y los anula con **motivo (que queda en cada documento) y su contraseña**; se puede acotar por tipo y fechas. Es una anulación: nada se borra.
- **Ciclo de un tipo** (`BORRADOR` → `ACTIVO` → `ARCHIVADO`; `permisosTipo` en `utils/permisosCertificados.ts`, función pura con tests). Todo tipo nuevo **nace en borrador**: no se expide, pero
  su vista previa sí funciona (así Secretaría prueba lo que redactó). **Secretaría** crea, edita y redacta el texto **mientras es borrador**, y archiva o elimina; **activar** (que exige
  que el texto cumpla los mínimos), editar un tipo ya activo, la política de firmas y los datos que el texto no puede perder son del **ADMIN**. **Eliminar solo si nunca se expidió nada**
  (se borra con sus textos); con documentos expedidos se **archiva**: deja de ofrecerse, pero lo expedido se verifica por su QR, se reimprime y conserva su nombre (por eso los tipos expedidos
  no se borran: el código QR y el consecutivo no pueden quedar huérfanos). El prefijo y las fuentes solo cambian en borrador y sin documentos expedidos; el prefijo es único incluso entre
  archivados. Las claves de los tipos de partida no se reutilizan. Un tipo creado arranca con un texto genérico armado con sus fuentes (`contenidoInicial`) que ya cumple los mínimos.
- **Plantillas de los documentos (núcleo de M26, maestro: «Permitir plantillas oficiales configurables»).** El texto de cada documento **no está en el código**: vive en
  `PlantillaCertificado` (una versión `VIGENTE` por tipo, las anteriores `ARCHIVADA`; inmutables en el modelo y con índice único parcial) y lo edita el ADMIN (en cualquier tipo no archivado) o Secretaría (solo en un tipo en borrador) en la
  pestaña «Plantillas». Una plantilla es una lista ordenada de **bloques** (`PREAMBULO`, `FORMULA`, `CUERPO`, `DESTACADO`, `TABLA_NOTAS`), cada uno con texto, `activo` y una
  **condición** opcional («solo si hay / no hay» un dato), más el título, la vigencia en días, las opciones del selector de destinatario y la frase de «Otro». El texto usa
  **variables** `{{modulo.dato}}` de un **catálogo cerrado** (`constants/variablesCertificado.ts`: cada una declara su módulo de origen; una variable nueva es una entrada ahí y
  su valor en `contextoDeVariables`). **La plantilla nunca crea datos**: los toma de M01/M03/M04/M05; si un bloque visible necesita un dato que no existe, **no se expide** y
  el mensaje dice cuál (409), p. ej. sin `institucion.ciudad` el cierre cae al bloque «Fecha de expedición» (condición `NO_HAY`).
- **Qué NO es editable.** El encabezado institucional (nombre, escudo, DANE, NIT, resolución, sede, jornada, año: `encabezadoInstitucional.service`, datos de M01), la tabla
  de valoraciones (la arma el módulo de notas y M26 solo la coloca), el QR y la huella, y el diseño del PDF. Es la versión mínima del patrón de M12 (`ConfiguracionPlanilla`, «M21 mínimo»), no un
  constructor libre; el constructor general sigue siendo M21.
- **No se publica una plantilla que pierde lo mínimo del documento** (`requisitosDe(tipo)` en `constants/plantillasCertificado.ts`, derivado de las fuentes del tipo y validado en `validarContenido`, que lista
  TODOS los problemas): bloques que no se pueden quitar o desactivar (`formula`, `cuerpo`; en un tipo con la fuente de valoraciones también `notas` y `promocion`) y variables que deben
  aparecer (nombre, documento, grado, año, fecha; folio y fecha de matrícula; dependencias; concepto de promoción). Fuente: Decreto 180 de 1981 art. 13 (compilado en el
  Decreto 1075 de 2015: firmas del director y el secretario, DANE, aprobación, curso y año, asignaturas con intensidad horaria y calificaciones, fecha; **si exige «en letras y números» no está confirmado ni se fija en el código**: la presentación de las notas es de cada institución) y el
  maestro. **Validar la numeración y el texto con la norma vigente (SUIN-Juriscol).**
- **Lo expedido guarda el texto ya resuelto** (`snapshot.contenido`: bloques con las variables reemplazadas + versión y huella de la plantilla). Publicar una versión nueva
  solo afecta lo que se expida después. Los documentos anteriores a las plantillas no tienen `contenido` y se reimprimen con `redactarCertificado`
  (`utils/certificadoTexto.ts`, texto histórico que no se toca). Publicar sin cambios es 409; «Restablecer» publica el texto de partida como versión nueva (la historia no se
  pierde). Los **valores de partida** (`contenidoInicial`, `constants/plantillasCertificado.ts` y `CERTIFICADOS[].destinatarios`) son solo la semilla de la versión 1, como
  `POLITICA_INICIAL`. Vista previa de un borrador: `POST /certificados/plantillas/:tipo/vista-previa` con un estudiante inventado y el encabezado real (no guarda nada).
- **Destinatario o motivo = selector por documento, no texto libre** (maestro, formulario de M26). Las opciones salen de la plantilla vigente (la primera es la
  predeterminada, «A quien interese») y «Otro (especificar…)» se agrega siempre al final; vacío o «Otro» sin texto cae en la predeterminada. El cliente envía
  `destinatario: { clave, otro? }` y `resolverDestinatario` (`utils/certificados.ts`) lo traduce: el snapshot congela la etiqueta (`destinatario`) y la frase del cierre
  (`destino`). Una clave que no es del tipo es 400. Los documentos anteriores al selector guardan texto libre en `destinatario` y se reimprimen igual.
  **Opciones que toman la entidad de otro módulo** (`fuente_entidad`, hoy solo `EPS`): su frase lleva `{entidad}`. La opción «EPS del estudiante» lee la EPS que M03 tiene del estudiante
  (`StudentProfile.eps`) **solo si el responsable legal dio la autorización de datos sensibles**, solo el nombre (nunca el régimen) y solo cuando esa opción se elige; sin EPS o sin
  autorización responde 409 y la pantalla la muestra deshabilitada con el motivo («Otro» sigue disponible). Queda congelada en el snapshot, y la auditoría dice «entidad de EPS (M03)» sin el nombre.
  M26 solo **lee** M03/M04: no se tocó ninguno de los dos.
- **Datos de las constancias que ya existían en otros módulos**: nivel del grado (M01), horario de la jornada, condición de ingreso, lugar de expedición del documento y
  acudiente principal (`StudentGuardian.es_principal`, solo el certificado de matrícula), y ciudad/departamento del colegio (**campos nuevos de M01**, `Institution.ciudad` y
  `departamento`, editables en Configuración institucional; el escudo es el `logo_url` de M01). **No existen todavía** (no se inventan): lema del colegio y código único
  estudiantil (M03); resoluciones estructuradas (hoy `resolucion_aprobacion` es un solo texto y debe incluir los niveles que cubre).
- **Paz y salvo con dependencias configurables.** `ConfiguracionCertificados.paz_y_salvo.dependencias` (valores de partida: Académica, Biblioteca, Financiera /
  Administrativa, Inventario y recursos; el ADMIN las agrega, desactiva y quita). Al expedir se confirman **todas las activas** («sin pendientes»); la lista y quién las
  verificó (`paz_y_salvo.verificado_por`) quedan congeladas en el snapshot. Hoy la confirmación es manual: cuando existan biblioteca, cartera o inventario, cada
  dependencia pasará a calcularse sola sin cambiar el documento (la académica podría leer M12).
- **Certificado de estudio (con notas): se construye completo, pero solo admite vista previa hasta que exista M19.** `datosDeEstudios`
  (`certificadoEstudios.service.ts`) lee el boletín de cada periodo (M17) y la consolidación pura `utils/certificadoEstudios.ts` pondera por el porcentaje de cada periodo
  (M05). **Solo cuentan las notas `DEFINITIVO`** (declaradas por coordinación en M12): una nota que el docente cerró pero nadie validó cuenta como ausente, y sin todas las
  notas no hay nota final (nunca se promedia lo que falta). **La tabla de valoraciones es un contrato genérico** (`TablaValoraciones`: columnas, filas de texto y pie) que M26 solo dibuja y congela:
  cómo se presenta una tabla de notas (columnas, letras, áreas o asignaturas, decimales) es decisión de cada institución y el maestro lo asigna a M17 («constructor de
  plantillas por institución») y M32. Quien la arma es `armarTablaValoraciones` (`utils/certificadoEstudios.ts`, **provisional: es el boletín final de M17**, se reemplaza sin
  tocar M26) y hoy entrega solo lo que lista el maestro: área o asignatura, intensidad horaria semanal y anual (semanal × `semanas_lectivas` de M05), calificación final con los
  **decimales de la escala de M05** (`precision_decimales`) y su equivalencia en la escala nacional según los rangos que la institución definió. Sin letras ni columnas por periodo. El concepto «APROBÓ / NO APROBÓ» sale de
  `obtenerPromocion`, que hoy devuelve `null`: con `null` la expedición oficial responde 409, la vista previa sale con «Concepto de promoción: PENDIENTE» y
  `matriculasExpedibles` lo informa en `restricciones`. **Cuando M19 guarde la decisión solo hay que implementar esa función**; el concepto no se escribe a mano (duplicaría
  lo que M19 registra). Motivo: lo expedido se congela, así que no se emite oficial con un dato ausente.
- **Lo expedido se congela y no se borra.** `CertificadoEmitido.snapshot` es inmutable en el modelo (`pre('save')`: solo cambian `estado` y `anulacion`); el PDF
  se dibuja **solo desde el snapshot**, así una reimpresión es el mismo documento con el mismo código. Un documento mal expedido se **anula con motivo** (solo
  ADMIN): sigue verificándose como ANULADO y se imprime con marca «ANULADO». La auditoría (`CERTIFICADO_*`) nunca lleva el motivo.
- **Seguridad: QR + huella, siempre (no tienen switch).** La huella es un **HMAC-SHA256** (`huellaDeCertificado`) con `CERT_HMAC_SECRET` (variable de entorno,
  **obligatoria en producción**: sin ella responde 503; en desarrollo se deriva de `JWT_SECRET`). Quien edite la base directamente no puede recalcular una huella
  coherente. **No cambiar el secreto después de expedir**: invalidaría la verificación de todo lo emitido. No es firma digital certificada (Ley 527/1999);
  no se presenta como tal. El QR solo contiene `/verificar/<token>` con un token opaco de 128 bits (no el consecutivo: no se puede enumerar); la URL base es
  `PUBLIC_URL` o el host de la petición (**definir `PUBLIC_URL` en producción**: sin ella el QR depende del encabezado `Host`). Sin QR se verifica con **código + clave** (los 12 primeros caracteres de la huella, impresos en el pie).
  Reimprimir recalcula la huella y se niega si no coincide (409).
- **Verificación pública** (`certificadoVerificacion.service.ts`, rate limit propio): responde VALIDO / VIGENCIA_CUMPLIDA / ANULADO / NO_VERIFICABLE y solo muestra tipo, código,
  fecha, institución, nombre y documento **enmascarado** (últimos 3). Nunca notas ni otros datos. «No existe» y «clave equivocada» responden igual (404). **La vigencia declarada
  se aplica**: una constancia con «vigencia de 30 días» sale VÁLIDA hasta el cierre de ese último día (hora de Colombia, `vigenciaDeDocumento`) y después «vigencia cumplida»
  (auténtico, pero vencido; no es anulado). El anulado se muestra en rojo con «no tiene validez».
- **Firmas y sellos con switch al expedir.** `ConfiguracionCertificados` (una por instalación): quién firma (`rectoria` = un `User` ADMIN,
  `secretaria` = un `User` SECRETARIA; nombre y cargo salen del usuario, no se digitan por documento), la imagen de cada firma y del sello, y la **política por
  documento y elemento** (`OBLIGATORIO` / `OPCIONAL_ENCENDIDO` / `OPCIONAL_APAGADO` / `NO_APLICA`, valores de partida en `POLITICA_INICIAL`). La lógica del switch
  es pura y con tests (`describirElemento` / `resolverElementos`, `utils/certificados.ts`): pedir algo que no aplica, sin imagen, sin firmante designado o sin
  permiso es **error**, nunca se ignora; apagar un obligatorio también. **Apagado = no se estampa la imagen, pero el documento conserva la línea con nombre y cargo
  para firma manuscrita.**
- **Quién gestiona qué en «Firmas y sellos»** lo decide `permisosCertificados` (`utils/permisosCertificados.ts`, función pura con tests; el servidor lo devuelve como
  `puede` y la pantalla solo lo refleja). **ADMIN** todo. **SECRETARIA** carga, reemplaza, quita y ve la imagen de su firma y del sello, y designa quién firma como
  Secretaría Académica y su cargo; la imagen de la firma de **Rectoría** también, **pero solo mientras haya delegación** (la misma llave de abajo). Quién es el rector,
  la delegación, la política por documento y las dependencias del paz y salvo son solo del ADMIN. Las rutas dejan pasar a ADMIN y SECRETARIA y el servicio aplica la
  regla fina (403). La carga de imágenes es `POST` (como todas las del sistema: `api.upload` solo envía POST; con `PUT` la subida daba 404 y ninguna firma se cargaba).
- **Delegación de la firma de Rectoría**: la secretaría puede estamparla y cargar su imagen mientras `permitir_firma_rectoria_a_secretaria` esté encendido (**nace apagado**: es la imagen más
  sensible y solo el ADMIN decide compartirla; una instalación anterior conserva lo que tenía); el ADMIN siempre puede. Las opciones elegidas, los firmantes y el hash de cada imagen quedan en el snapshot y **entran en la huella**.
- **Imágenes: almacén por contenido, en disco** (`utils/almacenImagenes.ts`, como el resto de archivos de los módulos): firmas, sello y **escudo** se guardan en
  `uploads/certificados/imagenes/<sha256>.<ext>` (PNG/JPG, 500 KB, firma de bytes), nunca se sobrescriben ni se borran; el documento expedido solo guarda la huella. **El escudo
  (`Institution.logo_url`, M01) también se congela al expedir** (`encabezado.escudo`), así una reimpresión sale con el escudo de entonces aunque el colegio cambie de logo
  (documentos anteriores: usan el logo vigente). **Si un archivo se pierde** el sistema no deja un 500: `vistaConfiguracion` marca `imagen_faltante` y no ofrece esa firma para
  documentos nuevos, el PDF responde 409 explicando cómo recuperarlo, y **volver a cargar la misma imagen recrea exactamente el mismo archivo** (se identifica por su
  contenido); el escudo se restaura solo si el logo vigente es el mismo. El respaldo debe cubrir `uploads/` (`deploy/respaldar.sh` ya lo hace).
- **Alcance por sede.** SECRETARIA solo expide, ve y reimprime documentos de las sedes que tiene asignadas (`sedes_ids`); sin sedes no ve nada; ADMIN ve todas. Cada
  certificado guarda `sede_id` (la de la matrícula); «no existe» y «no es de tu sede» responden igual (404). Certificados anteriores: `npm run migrate:certificados-sede`
  (idempotente; mientras no se corra, solo el ADMIN los ve). La vista previa de un documento real se audita (`CERTIFICADO_VISTA_PREVIA`, sin contenido).
- **Ver el documento al expedirlo.** Expedir y la vista previa muestran el PDF en la misma pantalla (`VisorDocumento`, con descargar, imprimir y abrir en otra pestaña);
  el historial lo abre en un panel («Ver»). Nunca se abre una pestaña después de un `await` (los navegadores la bloquean).
- **Pruebas:** unitarias (`certificados.test.ts`, `certificadosM26Ampliado.test.ts`, `plantillasCertificados.test.ts`: huella, switches, plantillas, variables, tabla de valoraciones) y de integración con base real (`integracion/certificados.int.test.ts`, `integracion/tiposCertificado.int.test.ts`: siembra, ciclo borrador→activo→archivado, eliminar vs archivar, permisos).
  **Las pruebas usan una carpeta temporal para los archivos** (`tests/setup.ts` fija `UPLOADS_DIR`, que `uploadPaths` respeta): antes borraban `backend/uploads` real al terminar.
  Si no se puede descargar el binario de MongoDB, usar `MONGOMS_SYSTEM_BINARY=<ruta de un mongod> MONGOMS_VERSION=<su versión>`.
- **Pendiente, a propósito:** expedir el certificado de estudio como oficial (falta el concepto de promoción, M19); que las dependencias del paz y salvo se calculen solas
  (la académica podría leer M12: todas las asignaturas `DEFINITIVO`; cartera, biblioteca e inventario no existen); lema y código estudiantil (M01/M03); resoluciones
  estructuradas; vigencia ya es parámetro de la plantilla; PDF del Libro de Matrícula y su trazabilidad de novedades; libros de calificaciones y actas reglamentarias
  (CU-SEC-06); solicitud desde el portal del acudiente (M27); constructor libre de formatos (M21); archivo general (M29); rotación de la clave HMAC; firma electrónica
  certificada (Ley 527/1999, Decreto 2364/2012: la imagen + huella + QR no lo es). **Quién firma está en dos sitios**: M12 guarda el nombre del rector como texto libre en las
  firmas de la planilla y M26 lo toma de un usuario; M26 es la fuente a reutilizar cuando se toque M12.

### M11 (Actividades y planeación de aula) — estado: núcleo completo

Backend `/activities` (modelos `Activity`, `ActivitySubmission`, `ConfiguracionActividades`), frontend `ActividadesDocentePage`
(`/docente/actividades`, CU-DOC-02), `MisActividadesPage` (`/mis-actividades`, CU-EST-03) y `ActividadesGestionPage`
(`/admin/actividades`, supervisión de coordinación). `Activity`/`ActivitySubmission` ya existían (M12 los consume: `reportCard.service`
lee `componente_siee` y `peso_en_componente`); M11 los extendió sin romper nada. Reglas que no se ven leyendo un solo archivo:

- **La jerarquía no se copia a la actividad.** Grupo, asignatura, área, grado y docente se leen por FK desde la `TeacherAssignment`
  (`actividadContexto.service.ts`), nunca se duplican en `Activity` (regla de oro de datos). Un docente solo programa sobre sus clases
  `CLASE` activas (M08); coordinación y ADMIN solo consultan.
- **Requisito M07, validado por el servidor:** no se crea una actividad sin el `CurricularDevelopment` de ese periodo en estado
  `APROBADO` (409 con el estado actual). Cada actividad exige un `dba_id` (debe estar en `dba_seleccionados` de esa planeación) o una
  `competencia_evaluada` (debe estar contenida en `competencias`, comparada sin tildes/mayúsculas). Guarda `desarrollo_curricular_id`.
  Al editar, el DBA/competencia solo se revalida si se cambian (reabrir una planeación no bloquea corregir un título).
- **Prevención de sobrecarga (M25 aún no existe):** `utils/actividades.ts#evaluarCalendarioActividad` (pura, con tests) cruza la fecha de
  entrega —un instante; el día se calcula en hora de Colombia— con M05 (periodo efectivo de la sede, recesos/vacaciones, recuperaciones,
  `dias_habiles` de la jornada) y con las demás actividades del grupo ese día. **BLOQUEO** (no se salta): fecha pasada con entrega
  digital, fuera del periodo. **ADVERTENCIA** (el docente confirma con `confirmar_alertas`, si no 409 con `details.alertas`): día no
  lectivo/no hábil, ventana de recuperación, sobrecarga. Los límites (`max_evaluaciones_por_dia`, `max_entregas_por_dia`, 0 = sin límite)
  son de `ConfiguracionActividades` (coordinación los cambia en `/admin/actividades`), no están quemados. Cuando exista M25 este es el
  único punto que debe leerlo (`actividadCalendario.service.ts#revisarCalendario`). `GET /activities/revision-calendario` es la alerta
  temprana mientras se elige la fecha: es la misma revisión que repite el servidor al guardar.
- **Reglas de entrega:** `requiere_entrega` (false = actividad de aula, el docente califica directo) y `formatos_permitidos` (PDF, Word,
  Excel, PowerPoint, imagen; **vacío con entrega = respuesta escrita**, sin archivo). `permite_entrega_tardia`. Un solo archivo por
  entrega, 10 MB (`MAX_BYTES_ENTREGA`; nginx en 12 MB por el multipart). El contenido se confirma por firma de bytes
  (`utils/evidenciasActividad.ts`; los Office son ZIP: además extensión coherente y carpeta propia del paquete). Vive en
  `uploads/actividades/<actividad>/`, nunca en Mongo, y solo se baja con sesión (`GET /activities/entregas/:id/archivo`: el propio
  estudiante, el docente titular, coordinación, ADMIN; "no existe" = "no es tuyo" = 404 para el estudiante). La API nunca devuelve la ruta.
- **Estados:** `PROGRAMADA` (no se guarda: es la actividad sin entrega) → `ENTREGADA` / `ENTREGADA_TARDE` → `CALIFICADA`. Los marca el
  servidor al entregar (`evaluarVentanaEntrega`) y al calificar; `estadoDeEntrega` los deriva de lo guardado (una nota siempre es
  CALIFICADA, también en registros anteriores a M11; sin `fecha_entrega` = nota puesta sin entrega = sigue programada). `con_retraso`
  sobrevive a la calificación. Se puede reentregar (reemplaza el archivo) hasta que se califique; la carrera con una calificación
  concurrente la cierra el filtro `calificacion_numerica: null` + índice único (409). Entrega exige año `EN_CURSO`, periodo no `CERRADO` y
  sin `PeriodLock` del grupo. El estudiante no ve una actividad antes de su `fecha_apertura` (publicación): 404.
- **Puente hacia M12:** la nota se registra con `notas.service#gradeActivity` (`PATCH /activities/:id/grade`; antes vivía en
  `activity.service`), que pasa por el mismo núcleo que la planilla de M12 (escala de M05, `assertPeriodNotLocked`, historial,
  planilla no cerrada) y marca la entrega `CALIFICADA`. `EntregasDrawer` ofrece nota + retroalimentación por estudiante sobre ese
  endpoint; la planilla completa es M12. `Activity.componente_siee` ya no es un enum: es la **clave de un bloque del molde de la planilla del
  año** (M12), validada al programar (existe y aún tiene cupo de casillas: 409 si el bloque está lleno); `componente_nombre` viaja en la vista. `peso_en_componente` es un
  % opcional del bloque (`null` = automático). El docente cambia bloque y peso mientras la planilla esté abierta, no programa actividades nuevas en una planilla cerrada, y no se elimina una actividad con entregas o notas. El periodo y la asignación de una actividad no se cambian (se elimina y
  se programa de nuevo con la planeación del otro periodo).
- **Pruebas:** `tests/actividades.test.ts` (funciones puras), `tests/integracion/actividades.int.test.ts` (servicios con base real) y
  `actividades.http.int.test.ts` (rutas, validadores, permisos por rol y subida multipart real).
- **Pendiente, a propósito:** vista del acudiente y notificaciones de actividades nuevas/por vencer (M27/M28), M25 como fuente del
  calendario, planilla de notas (M12), varios archivos por entrega, rúbricas y ajustes razonables de M16 sobre la actividad (solo se
  expone `GET /inclusion/grupos/:groupId/indicador`).

### M12 (Evaluación y notas) — estado: núcleo completo

Backend `/notas` (modelos `CalificacionAsignatura`, `ColumnaPlanilla`, `ConfiguracionPlanilla`; servicios `notas.service`, `columnasPlanilla.service`,
`casillasBloque.service`, `notasExcel.service`, `planillaPdf.service`; motor puro `utils/calculoNotas.ts`) y el molde en
`/academic-years/:id/componentes-evaluativos`; frontend `NotasPlanillaPage` (`/docente/notas`), `NotasGestionPage` (`/admin/notas`, seguimiento de
coordinación) y `CreadorPlanillasPage` (`/admin/creador-planillas`, ADMIN). La escala, el congelamiento y la consolidación de áreas **ya existían**
(M05/M06) y no se rehicieron. Reglas que no se ven leyendo un solo archivo:

- **Vocabulario: molde → bloques → casillas.** El **molde** es la plantilla de planilla de la institución: el ADMIN divide el 100% de la nota en **bloques**
  (Heteroevaluación 70%, Autoevaluación 15%, Coevaluación 10%, Comportamiento 5%…) y fija cuántas **casillas** admite cada uno (`max_casillas`, 1–50: hetero 30,
  auto 1). Se define una vez y rige el resto del año (y el año nuevo lo copia del más reciente que lo tenga, `academicYear.service#crearAnio`). Una **casilla** es una
  actividad de M11 (`Activity`, bloque en `componente_siee`) o una **nota suelta** que crea el docente (`ColumnaPlanilla`: por clase+periodo, con `bloque_clave`,
  `nombre`, `peso`, `orden`). Ya no existe el «origen» `ACTIVIDADES`/`NOTA_DIRECTA` de bloque: cualquier bloque recibe actividades y notas sueltas.
- **Molde por año** (`AcademicYear.componentes_evaluativos`: `clave` estable, `nombre`, `porcentaje`, `max_casillas`): suman exactamente 100, hasta 8 bloques.
  **Sin configurar rige el respaldo** Saber/Hacer/Ser 40/40/20 de `ponderacion_componentes` con `MAX_CASILLAS_POR_DEFECTO` (10) casillas
  (`utils/siee#componentesEfectivos`). **Se congela al registrarse la primera nota del año** (`academicYear.service#evaluacionEditable`, que cubre también la escala):
  en PLANIFICACION, o con el año vigente y ninguna nota, el ADMIN lo ajusta; la lista de años trae `evaluacion_editable`. Un año CERRADO nunca. No se quita un bloque
  que ya tiene casillas ni se baja `max_casillas` por debajo de lo que alguna clase ya usa (409; se mide por clase+periodo, sumando actividades y notas sueltas).
- **El máximo de casillas lo exige el servidor** (`casillasBloque.service#exigirCasillaDisponible`, 409): al programar una actividad (M11), al crear una nota suelta y al
  mover una casilla de bloque; la pantalla solo lo refleja («usadas/máx», el selector de bloque de la actividad deshabilita los llenos).
- **Peso de la casilla (opcional).** `peso_en_componente` (Activity) y `peso` (ColumnaPlanilla) son un **% del bloque** o `null` = automático. Las casillas sin peso se
  reparten en partes iguales lo que queda de `100 − Σ pesos puestos`; sin ningún peso, todas valen lo mismo (`pesosEfectivos`). Lo puesto en un bloque **no puede pasar
  de 100%** (+0.01 de tolerancia; `exigirPesosValidos`, 400, también en el Excel) y todos los cambios de peso son «todo o nada». El motor normaliza sobre las casillas **ya
  calificadas** (un peso no se pierde por una casilla vacía) y si todos los pesos son 0 promedia por igual.
- **«Falta nota» no es cero.** El motor devuelve `null` y una nota **parcial** (promedia solo los bloques con nota) mientras falte algo; un 0 es una nota. Un bloque está
  completo cuando tiene al menos una casilla y **todas** están calificadas (un bloque sin casillas no se completa y bloquea el cierre). Nota de área y promedio general
  solo se calculan con todas sus partes. Una sola fórmula en backend (`calculoNotas.ts`); `frontend/src/lib/calculoNotas.ts` la espeja solo para la vista en vivo de la
  planilla (si cambia una, cambia la otra).
- **Quién arma las casillas:** el docente titular, mientras el periodo admita notas (`assertPeriodNotLocked`) y la planilla no esté cerrada (`exigirPlanillaAbierta`):
  `POST/PATCH/DELETE /notas/columnas`, `PUT /notas/pesos` (en lote) y `GET /notas/bloques` (bloques con lo usado, para M11). Una nota suelta se renombra, mueve, pesa y
  elimina (se lleva sus notas); una actividad solo se mueve de bloque y se pesa (su título y fechas son de M11) y se elimina en M11. Auditoría: `CASILLA_PLANILLA_*`,
  `PESOS_PLANILLA_ACTUALIZADOS`.
- **Estados de la nota de una asignatura de un estudiante en un periodo** (`CalificacionAsignatura`, único por asignación+periodo+estudiante):
  `PENDIENTE` (faltan notas) ⇄ `BORRADOR` (completa, editable) los fija el sistema al guardar → `CERRADO` (lo cierra el docente titular, exige todas
  las notas y **congela** `resultado` con los bloques y la nota) → `DEFINITIVO` (coordinación/ADMIN, solo si toda la clase está cerrada). Cerrada o
  definitiva: no se califican actividades (tampoco desde M11), no se programan nuevas, ni se tocan casillas o pesos (`notasEstado.service#exigirPlanillaAbierta`).
  **Reabrir exige motivo** (queda en `reaperturas[]` y auditoría): el titular y coordinación reabren lo `CERRADO` mientras el periodo admita notas; lo `DEFINITIVO` solo el
  ADMIN. El estado abierto que se muestra se recalcula en vivo; el guardado puede quedar desfasado si se agrega/elimina una casilla después (la planilla y el seguimiento
  no dependen de él).
- **Registro transaccional** (`registrarNotas`): valida TODO antes de escribir (clase del titular, periodo, escala del año, matrícula, casilla de esa clase, duplicados,
  planilla abierta) y escribe en una transacción. Cada cambio deja `historial_notas[]` (actividad, en `ActivitySubmission`) o `historial[]` (nota suelta, en
  `CalificacionAsignatura.notas_columnas[{columna_id, valor, …}]`) con valor anterior/nuevo, quién y cuándo; repetir una nota no genera ruido. La API de celdas identifica
  toda casilla por `casilla_id` (el `_id` de la actividad o de la nota suelta).
- **Boletín (M17) = solo lo cerrado.** `reportCard.service` no mira actividades: lee `resultado` de las notas `CERRADO`/`DEFINITIVO`. Una asignatura sin cerrar sale
  `SIN_CERRAR` con `nota: null`; el área y el promedio general solo existen con todas sus partes; `completo`/`pendientes` dicen qué falta y el puesto solo se calcula entre
  estudiantes con boletín completo. Los bloques viajan como arreglo (`clave`, `nombre`, `porcentaje`, `nota`), no como saber/hacer/ser fijos.
- **Nivel cualitativo con huecos entre rangos:** la escala por defecto (1.0–2.9 | 3.0–3.9 | 4.0–4.5 | 4.6–5.0) deja huecos y un promedio de 2 decimales (3.95) no
  caía en ninguno (`resolverDesempeno` lanzaba 400). Ahora el nivel se resuelve con la nota redondeada a `precision_decimales` de la escala y, si aún queda en un
  hueco, al rango inferior; la nota mostrada no se altera. La fórmula de «Desempeño» del Excel hace lo mismo.
- **Planilla en pantalla (`PlanillaNotas`)**: cada bloque con sus casillas, «usadas/máx», un «+» para agregar una nota suelta (`CasillaDrawer`) si queda cupo, el peso de
  cada casilla editable (placeholder = lo que realmente pesa), edición **tipo hoja de cálculo** (flechas y Enter para moverse, pegar un rango copiado de Excel/Sheets,
  Ctrl+D rellena hacia abajo, Ctrl+Z deshace los cambios sin guardar) y pie con promedio, máxima, mínima y cuántos pierden (`nota_aprobatoria`). Guardar manda primero los
  pesos y luego las notas. Filtra por nombre/documento y «solo con notas pendientes». **La interfaz no se probó en un navegador** (solo compila: `tsc -b`, `vite build`).
- **Creador de planillas (ADMIN, `/admin/creador-planillas`)**: pestaña «Molde de la nota» (bloques con nombre, %, casillas máx.; ejemplos de partida que solo rellenan el
  formulario; vista previa; se bloquea al congelarse) y pestaña «Impresión y firmas» (la plantilla de presentación de abajo). Reemplaza a `/admin/plantilla-planilla` y al
  editor de componentes de Año lectivo, que ahora solo resume el molde y enlaza al creador.
- **Impresión de la planilla (M21 en versión mínima)** (`ConfiguracionPlanilla`, `GET/PUT /notas/plantilla`, solo ADMIN edita): título, subtítulo, pie, logo, qué columnas
  calculadas se muestran (documento, pesos, promedio por bloque, desempeño, estado) y hasta 4 firmas (cargo, nombre fijo o «el docente de la clase»). Es **solo presentación**:
  viaja dentro de cada planilla (`Planilla.plantilla`) y la aplican la pantalla, el Excel (las columnas se OCULTAN, no se quitan, porque las fórmulas y la importación
  dependen de ellas) y el PDF (`GET /notas/planilla/pdf`, horizontal, leyenda N1…Nn de las casillas y espacio de firmas). **No es un constructor libre de columnas.**
- **Excel offline (M22)** (`notasExcel.service`): `GET/POST /notas/planilla/excel`. Filas: 2 bloques, 3 nombres de casilla, 4 pesos puestos (entrada), 5 peso que realmente
  cuenta (fórmula), estudiantes desde la 6. Cada bloque trae sus casillas y **espacios en blanco hasta su máximo** (tope de 30 en la hoja), más una columna de nota del bloque;
  nota/desempeño van como **fórmulas** (con resultado en caché). Editables: nombre y peso de las casillas (menos el título de una actividad), y las notas (las de estudiantes
  cerrados, bloqueadas). Una hoja `Datos` oculta identifica clase, periodo y cada columna (`CASILLA:<id>` o `NUEVA:<bloque>`). **Al importar** se valida TODO antes de escribir
  (documento ajeno, nota no numérica o fuera de escala, casilla que ya no existe, nombre que falta, bloque pasado de su máximo, pesos > 100%) y luego se crean las casillas
  nuevas, se renombran, se pesan y se guardan las notas por los mismos servicios de la planilla en línea (esos pasos son transacciones separadas: un fallo posterior a
  la validación, p. ej. el periodo se cierra en medio, puede dejar aplicada la primera parte). La protección de la hoja es una comodidad. Google Sheets usa el mismo `.xlsx`.
  **Las fórmulas no se probaron en Excel/Sheets** (no hay motor de hojas en el entorno de pruebas): solo su texto y el flujo de ida y vuelta.
- **El Excel no pisa lo que cambió el sistema (conflictos)**: el archivo lleva en la hoja `Datos` una *instantánea* de lo descargado (nombre y peso de cada
  casilla, nota de cada celda por documento; `VERSION_INSTANTANEA`). Al importar solo cuenta lo que el docente **cambió respecto a esa instantánea**: una celda
  que no tocó se ignora aunque el sistema ya tenga otra nota (p. ej. una actividad calificada en línea mientras tanto), y si tocó una que el sistema también
  cambió es **conflicto** (400 con la fila y «descarga de nuevo»; no se guarda nada, como el resto de errores). Igual con pesos y con el nombre de una nota suelta.
  Lo que el Excel nunca puede romper el porcentaje: los % de los bloques no viajan en el archivo (son del molde), los pesos se validan ≤100% por bloque, las
  casillas nuevas se miden contra el cupo vivo del bloque y la nota que se muestra después es la que calcula el servidor. Un archivo sin instantánea se rechaza.
- **Vista previa y Excel de muestra del molde** (administración, pestaña «Vista del docente y Excel» del Creador de planillas): `GET /notas/molde/vista-previa` y
  `/notas/molde/excel?academic_year_id=` (ADMIN/COORDINADOR; `planillaMuestra.service.ts`). Arman una `Planilla` inventada (3 estudiantes, 2 casillas por bloque) con
  el molde y la plantilla de impresión vigentes, reusando `armarFila`/`armarBloques` y el mismo generador de Excel del docente; no tocan la base. El Excel lleva la
  marca `MUESTRA` en vez de una clase y el importador lo rechaza.
- **El estudiante ve sus notas** (`GET /notas/mias?periodo_numero=&academic_year_id=`, solo ESTUDIANTE, `notasEstudiante.service.ts`, página `MisNotasPage` en
  `/mis-notas`): por asignatura, cada bloque con sus casillas y la nota de cada una; usa `armarFila` (la misma cuenta de la planilla), así que una planilla abierta
  se muestra **provisional** (`parcial`) y una `CERRADO`/`DEFINITIVO` como nota final. Solo devuelve lo propio y de las actividades solo las ya publicadas
  (`fecha_apertura`) o con nota. El boletín (M17) sigue leyendo solo lo cerrado.
- **Quién ve qué:** el titular edita; ADMIN/COORDINADOR consultan (`GET /notas/planilla`, `GET /notas/bloques`), ven el seguimiento (`/notas/seguimiento`) y declaran definitivas;
  otro docente no entra (403). `declararDefinitivas` valida el rol también en el servicio.
- **Evidencias dentro de la planilla:** cada casilla de una actividad con entrega digital lleva un punto (a tiempo / con retraso / ya calificada; sin punto = no entregó) y el
  título de la columna abre `EntregasDrawer` (descargar la evidencia, leer la respuesta, poner nota y retroalimentación) sin salir de la planilla; la misma nota se puede
  poner en la casilla.
- **Datos anteriores al molde:** las notas directas (`notas_directas`) y los `peso_en_componente` de la primera versión de M12 **no se migraron** (era desarrollo sin datos
  reales): una nota directa vieja queda huérfana y un peso `3` ahora significa 3%.
- **Pruebas:** `tests/calculoNotas.test.ts` (motor, pesos, molde y escala), `tests/integracion/notas.int.test.ts` (servicios con base real: planilla, historial, cierre,
  definitivas, reapertura, boletín, molde, congelamiento, copia al año nuevo, casillas y pesos) y `notas.http.int.test.ts` (rutas, permisos, validadores, plantilla, PDF y Excel
  de ida y vuelta, con alta de casillas desde el Excel). **`tests/setup.ts` hace comparable el `message` de los errores:** `toMatchObject` ignora las propiedades no enumerables
  y `message` lo es, así que una aserción `rejects.toMatchObject({ message: /x/ })` pasaba con cualquier mensaje. Para verificar un mensaje use
  `message: expect.stringMatching(/x/)`, nunca un regex suelto.
- **Pendiente, a propósito:** un constructor libre de formatos (columnas propias, orden, varios moldes por nivel o área; M21 completo); notificaciones de cierre (M28); recuperaciones
  y comisiones de evaluación (M18/M20); estadísticas (M30, que leerá `CalificacionAsignatura`); cierre automático de las planillas al cerrar el periodo en M05; el director de
  grupo no consulta las planillas de las demás asignaturas de su grupo (sí en asistencia); borrar una nota ya puesta (se corrige, no se borra); copiar las casillas sueltas de un
  periodo al siguiente.

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
  subtítulo + acción de la página), `Field` (`Input`/`Select`), `MultiSelect` (selector desplegable de selección múltiple con checkboxes, contador y badges de rol/estado; prop opcional `emptyLabel` cuando elegir es obligatorio), `Alert`, `Spinner`, `EstadoEspacioBadge` (M10), `EstadoAsistenciaChip`/`EstadoJustificacionBadge` (M13), `MallaDisponibilidad` (M09: cuadrícula de tiempo libre por clic, disponible/condicional/no disponible), `GuiaColumnas` (guía colapsable de columnas de una carga CSV), `ProgressBar` (barra de avance con tono, ej. semanas lectivas vs. el mínimo de 40), `LineaTiempo` (línea de tiempo vertical con punto, fecha, chips y contenido por registro; la usa el historial de convivencia), `EstadoCasoBadge`/`TipoSituacionBadge` (M15), `EstadoExpedienteBadge`/`EstadoSolicitudApoyoBadge` (M16), `EstadoNotaBadge` (M12: pendiente/borrador/cerrado/definitivo), `EstadoEntregaBadge`/`TipoActividadChip` (M11: programada → entregada → con retraso → calificada; tipo de actividad), `Dropzone` (zona para soltar o elegir un archivo, valida extensión y tamaño en el navegador y muestra el archivo elegido; el servidor siempre confirma el contenido), `VisorDocumento` (PDF dentro de la pantalla con descargar, imprimir y abrir aparte; certificados M26), `Switch` (interruptor encendido/apagado para decisiones al momento, con `disabledReason` como tooltip; ej. firmas y sello al expedir en M26), `Tabs`/`TabPanel` (navegación por pestañas con subrayado azul en la activa; reusar en vez de reinventar un switch de pestañas en otra página), `EditorConVariables` (párrafo de texto con los datos del sistema como fichas en lugar de `{{llaves}}`: «Insertar dato» o «/», una ficha se borra de una vez, una sola línea, lo pegado se limpia; guarda el mismo formato `{{modulo.dato}}` de siempre; M26 plantillas), `Stepper` (indicador de pasos para formularios largos por secciones, ej. el asistente de creación de estudiante en M03), e iconos SVG propios en `components/ui/icons.tsx` (no se agregó ninguna librería de iconos).
- **Contenedor global y densidad** (`components/layout/AppShell.tsx`): el `<main>` centra el
  contenido en `max-w-7xl` (no `max-w-5xl`) para que las tablas anchas (Usuarios, Grupos) no
  scrolleen antes de tiempo en pantallas grandes. Cada página usa `space-y-4` (no `space-y-6`)
  como separación entre sus secciones (`PageHeader`, `Alert`, `Card`, `Table`). Este ancho y
  este espaciado son el estándar del contenedor global — no se reduce el ancho ni se vuelve a
  `space-y-6` en una pantalla nueva sin pedirlo explícitamente, y el padding interno de
  `Table`/`Th`/`Td` no se toca por esta regla de densidad (es un ajuste del contenedor, no de
  las tablas).
- `Drawer` acepta `size="lg"` (y `"xl"` para tablas anchas, como la planilla de notas en solo consulta; opcional, por defecto `md`) para formularios de varias columnas, como la
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
