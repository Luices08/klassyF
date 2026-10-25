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
- **Una persona, un usuario, varios perfiles.** `User.roles` es un arreglo (índice multikey): es la relación muchos a muchos entre usuarios y
  roles, embebida en el propio documento en vez de una colección pivote aparte (los roles son un enum cerrado, no una entidad con datos propios, y
  así el documento sigue siendo único por `numero_documento`). Una docente que además es madre de un estudiante es **un** registro con
  `roles: ['DOCENTE','ACUDIENTE']`. `ESTUDIANTE` no se combina con nada; `ACUDIENTE` solo se suma como rol adicional a otro (o es el único).
  `user.rol` **no se guarda**: es un virtual que vale el **perfil activo** de la sesión (el `rol` del JWT, que `authenticate` pone en
  `$locals.rolActivo`) o, sin sesión, `roles[0]`; todo el código que ya leía `req.user.rol` sigue funcionando. Bases anteriores:
  **`npm run migrate:roles-multiples`** (convierte `rol` → `roles`; mientras no se corra, los usuarios viejos no pueden iniciar sesión).
- **Flujo de login** (`auth.controller.ts`, `accesoPerfil.service.ts`): el formulario (`LoginPage`, con `SelectorRolLogin`) pide **el perfil con el que se entra, documento y
  contraseña**; `POST /auth/login` acepta `rol` y, tras validar la contraseña, abre la sesión con ese perfil o responde 403 si la persona no lo tiene habilitado (se comprueba
  *después* de la contraseña para no revelar perfiles a quien no la conoce). El sistema redirige solo a la vista del perfil (`rutaInicialDe`: ACUDIENTE a `/portal`, los demás a
  `/panel`). El frontend recuerda el último perfil elegido (`localStorage`, solo comodidad). Sin `rol` el backend conserva el flujo anterior (un perfil abre sesión; varios responden
  `{ requiere_seleccion_perfil, seleccion_token, perfiles, usuario }` y `POST /auth/seleccionar-perfil` lo canjea; el token dura 5 minutos, `purpose: 'seleccion_perfil'`, sin `rol`),
  pero **el frontend ya no lo usa**. Ya con sesión, `POST /auth/cambiar-perfil` (botones «Entrar como …» de `CambiadorDePerfil` en el encabezado) emite un token nuevo con otro
  perfil y se audita (`PERFIL_CAMBIADO`). Al abrir y cerrar sesión se limpia la caché de TanStack Query para que un perfil no vea datos del otro. Qué perfil puede entrar es por
  perfil, no por persona (`motivoSinAccesoAlPerfil`): solo el de estudiante espera a la matrícula formalizada; el acudiente entra aunque su hijo siga preinscrito. La pantalla de
  login muestra el nombre y el escudo del colegio y la foto de login (ver M01, Institución) tomados de `GET /public/institution-info`.

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
   URI —es el escudo de los documentos oficiales—, `ciudad` y `departamento` opcionales —los usan los certificados de M26—, `estado` activo/inactivo). `GET/PATCH /institution`, página `InstitutionSetupPage`. El drawer «Modificar institución» (con contraseña del ADMIN) solo edita los **datos legales y de contacto**;
   lo demás vive en **bloques visibles de la página**, fuera del drawer: *Funcionamiento* (`AjustesInstitucion`: modalidad, política de aforo y paz y salvo de docentes; `PATCH /institution/ajustes`,
   ADMIN, **sin contraseña** pero auditado `INSTITUCION_AJUSTES_ACTUALIZADOS`, cada bloque con su botón Guardar) e *Imágenes* (`ImagenesInstitucion`: foto del **login** y foto del **tablero** de
   docentes/estudiantes —aún no existe ese tablero—; `GET /institution/imagenes`, `POST|DELETE /institution/imagenes/:clave`, multipart como toda subida, PNG/JPG/WEBP por firma de bytes, 2 MB).
   Las fotos están en su propia colección (`ImagenInstitucional`, bytes en Mongo) para que `GET /institution`, que leen todas las pantallas, no las arrastre; se sirven sin sesión por
   `GET /public/institution-imagen/:clave` (el login se pide antes de iniciar sesión) y `institution-info` trae `imagen_login_version` (fecha en ms) para armar la URL con `?v=` y que el
   navegador no use una foto vieja. Una opción o foto nueva de la institución va en un bloque de esa página, nunca dentro del drawer.
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
- **Roles múltiples en la jerarquía** (`puedeGestionarRoles`, `constants/roles.ts`): para gestionar a un usuario hay que poder gestionar **todos** sus
  roles (una docente que también es acudiente solo la gestiona quien gestiona a `DOCENTE`). Crear/editar acepta `roles` (gana sobre `rol`; un
  `PATCH` con solo `rol` reemplaza todos los perfiles, por eso `UsersPage` manda siempre la lista completa); la casilla «También es acudiente» solo
  aparece para personal y se limita a `ROLES_ADICIONALES_PERMITIDOS`. Vincular a alguien como acudiente (M03, `concederRolAcudiente`) le **suma**
  el rol ACUDIENTE si ya existe como personal; si es estudiante, 409.
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
- **Un mismo número de año puede repetirse si los anteriores están CERRADOS** (p. ej. otro 2026 para seguir probando):
  el índice único institución+year es parcial (solo PLANIFICACION/EN_CURSO, `anio_sin_cerrar_unico`) y `crearAnio` responde 409
  solo si hay uno sin cerrar. Todo lo de un año cuelga de su `_id`; los consecutivos por número (folios, casos, actas,
  certificados) siguen corriendo, no se reinician. Lo que busque «el más reciente» ordena por `year` y luego `createdAt`.
  Bases anteriores: `npm run migrate:anio-repetible` (retira el índice único viejo).
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
- **Dos piezas de M07 viven aquí** (ver M07): cada periodo guarda la ventana de entrega de los planes de aula
  (`fecha_apertura_planes_aula`/`fecha_limite_planes_aula`, `null` = la sugerida; la configuran ADMIN y COORDINADOR por
  `/planeacion/ventanas` sin tocar las fechas del periodo, y `actualizarAnio` las conserva), y `activarAnio` exige que cada área
  obligatoria tenga su plan de área aprobado (409 con `details.areas_pendientes`).
- Años creados antes de M05: `npm run migrate:m05-anio-lectivo` (idempotente).
- **Pendiente, a propósito fuera de alcance**: la verificación de cierre ya consulta a M19 (`promocion_resuelta`: todo
  estudiante con matrícula activa debe tener un resultado final de promoción, `RESULTADOS_FINALES`; lo que espera recuperación, comisión, una persona o notas bloquea el cierre), pero no revisa que las sesiones de la comisión estén firmadas; M13 aplica las mismas reglas de calendario pero con los días hábiles de la jornada (ver M13), no con `esDiaLectivo`, que es solo lunes a viernes; matrículas y admisiones no se bloquean en un
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

### M07 (Planeación documental — plan de área y plan de aula en PDF) — estado: núcleo completo

Backend `/planeacion/documentos-referencia`, `/planeacion/planes-area`, `/planeacion/planes-aula` y `/planeacion/ventanas` (modelos
`DocumentoReferencia`, `LiderArea`, `PlanArea`, `PlanAula`), `/planeacion/lideres-area`, frontend `PlaneacionDocentePage` (`/docente/planeacion`),
`RevisionPlaneacionPage` (`/admin/revision-planeacion`) y `DocumentosReferenciaPage` (`/admin/documentos-referencia`). **Reemplaza** al
banco de referentes (DBA/EBC/lineamientos) y al desarrollo curricular estructurado: ya no hay catálogo de competencias, estándares ni DBA
en la base de datos, y ninguna actividad, nota ni boletín depende de uno. Las colecciones viejas se retiran con
`npm run migrate:retirar-banco-curricular` (por defecto solo **simula**; `--aplicar` borra `referentecurriculars` y
`curriculardevelopments` y limpia `activities` y `ajusteasignaturas`: hacer respaldo de Mongo antes). Reglas que no se ven leyendo un solo archivo:

- **Todo es un PDF con título y descripción**, revisado por coordinación. Coordinación/ADMIN cargan los **documentos de apoyo**
  (`DocumentoReferencia`: DBA, estándares, lineamientos) y los asignan a un área y a los grados donde aplican; es solo consulta (nada se
  liga a ellos por llave, así que editarlos o quitarlos no deja datos colgando). Los docentes los leen en un panel lateral
  (`PanelDocumentosPdf`) al armar su plan.
- **Uno o varios líderes por área, segmentados** (`LiderArea`, `/planeacion/lideres-area`; cualquier docente activo; se designan en el Catálogo
  académico, botón «Líderes del área»). Un colegio pequeño tiene **un jefe para toda la institución** (el alcance por defecto: todos los niveles,
  todas las jornadas, todas las sedes); uno grande separa por **nivel educativo** (`niveles`, vacío = todos) y por **jornada diurna / nocturna**
  (`jornada`: `TODAS` | `DIURNA` | `NOCTURNA`; `TIPO_DE_JORNADA` en `constants/planeacion.ts` decide que mañana, tarde y única son diurnas y
  nocturna y sabatina, nocturnas). La **sede es opcional** (`sedes_ids`, vacío = «Todas las sedes»: no se obliga a un líder por sede). Dos líderes
  activos de la misma área **no se solapan** (`alcancesSeSolapan`, 409 que dice quién ya cubre qué). Cada líder es el **único** que carga el **plan de
  área anual de lo que cubre** (`PlanArea`, único por año+líder, ligado a `lider_area_id`): ni el ADMIN ni el COORDINADOR lo suben en su nombre.
  El plan cuelga del registro del líder, no de la persona: cambiar al docente no lo toca. Quitar a un líder que ya cargó planes lo **desactiva**
  (`estado: inactivo`, el plan se conserva); sin planes se elimina. Toda la lógica de «a quién le toca esto» es pura y con tests
  (`utils/liderArea.ts`: `alcanceCubre`, `rebanadasSinCubrir`, `planAreaDeClase`). **Qué plan de área aplica a una clase** lo decide el nivel de su
  grado y la jornada y sede de **los grupos donde se dicta** (`ClaseAgrupada.ubicaciones`): si cae bajo varios líderes (p. ej. un grupo diurno y uno
  nocturno), el plan de aula solo se habilita cuando **todos** tienen su plan aprobado, y si no hay líder que cubra ese pedazo se dice cuál.
  `Area.lider_id` ya no existe (se migra con `npm run migrate:lideres-de-area`, que por defecto solo simula).
- **Estados por tabla** (`TRANSICIONES_PLAN`, `constants/planeacion.ts`; la comparte el plan de área y el de aula): `EN_REVISION` →
  `APROBADO` | `DEVUELTO` (con **comentario obligatorio**, exigido en el servicio, el validador y el modelo) → nueva versión → `EN_REVISION`.
  «Sin cargar» no se guarda: se deriva. Cada versión conserva su PDF y el historial de decisiones queda en `revisiones[]`. Las transiciones
  son atómicas (el filtro por estado cierra la carrera entre dos revisores o dos envíos). Reabrir un aprobado es **solo del ADMIN y con
  motivo**; el resto de lo que hace coordinación (documentos, líder, ventana, revisar) lo puede hacer también el ADMIN (`checkRole` no hereda:
  cada ruta nombra los dos). La matriz es `permisoPlaneacion` (`utils/permisosPlaneacion.ts`, pura, con tests); el servidor devuelve `puede` y la
  pantalla solo lo refleja.
- **Compuerta de la activación del año** (`exigirPlanesDeAreaAprobados`, `planeacionCompuertas.service.ts`, la llama `activarAnio` de M05): no
  se activa un año si un área **obligatoria** no tiene su plan de área aprobado **en cada parte de la institución donde se dicta**. «Obligatoria»
  no es un campo: se deriva grado por grado (área activa con al menos una asignatura `OBLIGATORIA` activa en el plan de estudios M06 de ese grado,
  incluidas las que agrega un grupo o una jornada, a propósito sin distinguir cuál: es conservador). Lo que se pide son «rebanadas» nivel + jornada +
  sede (`demandaDelAnio`, `planeacionCobertura.service.ts`): el nivel sale del grado y la jornada y la sede de sus grupos activos; un grado aún sin
  grupos exige su nivel con jornada y sede sin definir. Cada rebanada necesita un líder que la cubra y cada líder necesario, su plan aprobado; un
  líder cuyo docente ya no está activo solo cuenta si dejó el plan aprobado. El 409 trae `details.areas_pendientes` con una entrada por caso
  (`clave`, `area_id`, `nombre`, `alcance`, `motivo`: sin líder / sin cargar / en revisión / devuelto) y `AnioLectivoPage` la lista. Un área solo
  optativa, o un líder que no cubre nada que el año dicte, no bloquea.
- **El plan de aula es del docente y por grado, no de la asignación.** Llave única `(año, periodo, asignatura, grado, docente)`: quien dicta la
  misma asignatura en 6A y 6B radica **un** plan. **No cuelga de `TeacherAssignment`** porque M08 elimina físicamente la CLASE al cambiar de docente
  (y antes borraba la planeación en borrador): retirar o reemplazar a un docente no borra su plan, que queda **archivado** en el histórico del
  periodo. «Archivado» se **calcula** (el dueño ya no tiene clase activa en esa asignatura y grado: `clavesConClaseActiva`), no se marca, así
  cubre eliminar, carga en lote y malla de grupo. Solo se carga con el **plan de área aprobado** (409 con el nombre del área si no).
- **Adoptar el plan del docente anterior.** A quien llega a una asignatura se le ofrece, por periodo, «Adoptar el plan de aula del docente
  anterior» o «Subir un nuevo plan ajustado». Adoptar (`adoptarPlanDeAula`) crea un plan **`APROBADO` al instante**, con una revisión
  `automatica` («no requiere nueva revisión»), el rastro `adoptado_de`, una **copia** del PDF y sin consumir el original (varios docentes nuevos
  pueden adoptar el mismo). Solo se adopta un plan **aprobado** de un docente **archivado** (nunca el de un colega que sigue dictando esa
  asignatura en ese grado: rompería «cada docente radica el suyo») y también exige el plan de área aprobado. Subir uno ajustado sigue el camino normal.
- **Ventana de entrega por periodo** (`AcademicYear.periodos[].fecha_apertura_planes_aula` / `fecha_limite_planes_aula`; `null` = la sugerida):
  la configuran ADMIN y COORDINADOR en `AnioLectivoPage` (`PUT /planeacion/ventanas/:anio/periodos/:n`) sin tocar las fechas del periodo. **Sugerida**
  (`ventanaDeEntrega`, pura): abre 14 días antes de que termine el periodo previo y cierra el día anterior al inicio del periodo; el Periodo 1, que no
  tiene previo, abre 14 días antes de su cierre y su límite **debe** ser anterior al inicio de clases (`validarVentana`). Se guarda solo lo que se
  tocó, así lo sugerido sigue las fechas del periodo si estas cambian, y `actualizarAnio` (M05) **conserva** estos campos al reconstruir los periodos.
  Antes de abrir la entrega no se radica por primera vez (409 con la fecha).
- **Vencida la fecha límite el formulario NO se cierra.** El docente rezagado entrega igual y el servidor estampa **ENTREGADO FUERA DE PLAZO**
  (`FueraDePlazoChip`) con la fecha y la hora, comparando contra el último instante del día límite en hora de Colombia. La etiqueta se decide **una
  sola vez, en la primera radicación** (`PlanAula.radicacion`, que guarda también el límite que regía: cambiar la ventana después no reescribe la
  historia); corregir un plan devuelto no la cambia. **No cuenta contra quien fue asignado después del cierre** (un reemplazo): su
  `TeacherAssignment.createdAt` es posterior al límite. El PDF del docente no se modifica: la etiqueta es un dato, no un sello sobre el archivo.
- **Un plan devuelto siempre se puede corregir**, haya vencido o no la ventana, hasta llegar a `APROBADO`; en revisión o aprobado no se reemplaza.
- **Compuerta de actividades** (`exigirPlanAulaAprobado`, la llama `createActivity` de M11 y `updateActivity` si cambia `fecha_apertura`, que es
  «publicar»): sin el plan de aula **aprobado** de ese docente, asignatura, grado y periodo no se programa ni se publica (409 que dice si falta,
  está en revisión o fue devuelto). Reabrir un plan después no oculta actividades ya creadas; solo frena las nuevas y mover la publicación.
  El formulario de actividades muestra al lado el PDF del plan aprobado (`GET /planeacion/planes-aula/de-asignacion`).
- **Archivos**: `uploads/planeacion/{documentos-referencia,planes-area,planes-aula}/<id>/`, solo PDF verificado por firma de bytes (`%PDF`), hasta
  **25 MB** (los del MEN llegan a ~16 MB; `frontend/nginx.conf` sube el tope a 27 MB solo para `/api/v1/planeacion/`). La API **nunca devuelve la
  ruta**: se baja con sesión y permiso por `…/archivo[?version=n]` (un plan que no puedes ver responde 404). Como toda subida del sistema, la de un
  archivo es `POST` (`api.upload`): los datos de un documento se editan por `PATCH` en JSON y su PDF se reemplaza por `POST …/:id/archivo`.
  El respaldo debe cubrir `uploads/` (`deploy/respaldar.sh` ya lo hace).
- **Retirar el banco tocó otros módulos solo en lo mecánico:** `Activity` ya no guarda `dba_id`, `competencia_evaluada` ni
  `desarrollo_curricular_id` (M11); `AjusteAsignatura.dba_ids` desapareció y el Anexo 2 queda con el objetivo flexibilizado en texto libre (M16; los
  PIAR ya emitidos conservan `objetivos_referentes` congelado y se imprimen igual); y se quitaron las 4 guardas de M08 que impedían retirar un
  docente con planeación aprobada. M12 y M17 no tenían vínculo estructural (la nota usa el bloque del molde) y no cambiaron.
- **Pruebas:** unitarias (`planeacion.test.ts`: ventana, plazo, bloqueos, transiciones, adoptables; `permisosPlaneacion.test.ts`) y de integración
  con base real (`integracion/planeacion.int.test.ts`: servicios; `planeacion.http.int.test.ts`: rutas, roles, multipart real con PDF de 16 MB y
  rechazo de 26 MB). `escenarioNotas.ts#crearPlanAula` crea un plan directo para las pruebas que solo necesitan la compuerta.
- **Pendiente, a propósito:** avisos al docente nuevo o a coordinación (M28: hoy la oferta de adopción se ve al entrar a «Planeación»);
  comparar versiones lado a lado; plantillas de plan; ventana distinta por sede con calendario propio (la ventana es institucional); sembrar los
  PDF del MEN de `doc/` como documentos de apoyo (se cargan desde `/admin/documentos-referencia`); reemplazo a mitad de año de un docente que ya
  tiene actividades o notas: M08 sigue bloqueando eliminar esa asignación (es una limitación de M08/M12, no de M07).

### M14 (Observaciones y convivencia — Observador) — estado: núcleo completo

Backend `/observaciones` (modelos `TipoObservacion`, `Observacion`, `ConfiguracionConvivencia`; la falta del manual y la solicitud de caso
viven en M15), frontend `ObservadorPage` (`/convivencia/observador`), `CatalogoConvivenciaPage` (`/convivencia/catalogo`), `MiObservadorPage`
(`/mi-observador`) y la pestaña "Observador y bienestar" de la ficha del estudiante. Análisis: `doc/Analisis_M14_M15_Klassy.md`.
Reglas que no se ven leyendo un solo archivo:

- **Una observación NO es una falta.** Una sola colección `Observacion` con `clase` = `OBSERVACION` | `FALTA`, pero con contratos distintos
  (se validan en el modelo y en `observacion.validator.ts`):
  - **Observación** (lo cotidiano, Idea_Klassy M14): `tipo` (configurable), `descripcion` de los hechos (texto libre), `compromiso` (texto
    opcional), `version_estudiante` (lo que el estudiante manifestó, opcional), `requiere_citacion` (booleano) y `confidencial` (booleano). Se asienta de
    inmediato en el Observador y en el historial.
  - **Falta Tipo I** (`POST /observaciones/faltas`, la registra el docente de clase o el titular de grupo, y convivencia): el docente elige una falta leve
    del manual (`FaltaConvivencia`, M15) y los estudiantes que la cometieron (`estudiantes_ids`); queda en el Observador como antecedente pedagógico (hechos,
    versión del estudiante y compromiso opcionales). Si no se resolvió con la mediación del aula marca **«escalar a coordinación»**
    (`escalar_a_coordinacion`) y además llega una `SolicitudCaso`. **Una falta Tipo III no se registra por este endpoint** (400): siempre va por el reporte a coordinación (abajo). **Una Tipo II sí**, cuando el docente la resolvió él mismo o no fue tan grave (el interruptor «Enviar a coordinación de convivencia» del formulario, encendido por defecto): queda en el Observador **como una Tipo I** (sin solicitud; la ven completa el director de grupo y orientación y la familia, `esGraveEnTramite` = II/III **con** solicitud o caso) y cuenta como falta II en promoción; pedir `escalar_a_coordinacion` en una Tipo II responde 400 (para enviarla se usa el reporte).
    **En pantalla es un solo formulario, «Registrar falta»** (`FaltaDrawer`): el docente elige el **tipo** (I, II o III) y la **falta del manual** (ambos `SelectBuscable`: se buscan escribiendo; la falta se filtra
    por el tipo) y el formulario llama al endpoint que corresponde: Tipo I (con la casilla de escalar) y Tipo II resuelta → `/faltas`; Tipo II enviada y Tipo III → `/reportes-urgentes`.
  - **Falta grave, Tipo II o III** (`POST /observaciones/reportes-urgentes`, mismos roles que la falta; `GET .../mios` lista los propios, pestaña «Mis faltas graves»): el docente elige la
    falta del manual (`falta_id`, **opcional**: sin ella es una emergencia y llega sin tipificar) y cuenta **qué pasó, a quiénes nombra y qué contención aplicó** (obligatoria). Crea una `SolicitudCaso`
    con esa falta y su `gravedad` **como referencia** (`rol` null en cada involucrado: los asigna coordinación) y una **alerta crítica agrupada** (`REPORTE_URGENTE`) más punto rojo para ADMIN y
    el coordinador de convivencia de la sede. **El docente identifica la falta, pero quien confirma el tipo y los roles es coordinación al abrir el caso** (llega preseleccionado el tipo de la falta).
    **No deja antecedente en el Observador de nadie** (así una víctima o un estudiante ajeno al hecho no queda marcado, un caso descartado no deja rastro y lo grave solo cuenta como falta cuando hay
    una decisión en firme, ver M15). Quien reportó ve el estado de su reporte y el código del caso, nunca el expediente.
- **El catálogo es de cada colegio, no del sistema.** Solo se siembran los tipos base "Académica" y "Comportamental" (no hay `familia`: el sistema
  no distingue tipos por nombre). ADMIN y `COORDINADOR_CONVIVENCIA` agregan, editan, desactivan y eliminan (eliminar solo lo no usado; lo
  usado se desactiva). **No existen categorías ni "frases"**: se eliminaron porque eran de otro módulo; las faltas (con gravedad) son de M15.
- **La observación copia lo que se eligió** (tipo, `visible_estudiante`, falta) al guardarse: editar o desactivar el catálogo no altera ni revela
  lo ya registrado. No se borra: se **enmienda** (versión anterior en `enmiendas[]`) o se **anula** con motivo. El autor puede hacerlo dentro de
  `ConfiguracionConvivencia.plazo_*_horas` (48 h por defecto); coordinación de convivencia (de sus sedes) y ADMIN sin plazo; nunca con el año
  CERRADO. Una falta ya remitida a convivencia solo la corrige convivencia.
- **Quién ve qué** lo decide el servidor con `permisoSobreEstudiante` (`utils/permisosConvivencia.ts`) y la función pura `visibilidadDeObservacion`
  (`utils/observaciones.ts`: COMPLETA / RESERVADA / nada; el listado y el detalle usan la misma). ADMIN y coordinación de convivencia ven todo en su
  alcance; una **confidencial** solo la ven su autor, `ORIENTADOR`, coordinación de convivencia y ADMIN (**excepto el seguimiento psicosocial de orientación**,
  contexto `ORIENTACION`: solo su autor y el ADMIN, como las atenciones de una remisión; ni otro orientador ni convivencia lo leen, corrigen ni anulan, y ni
  el ADMIN le quita la confidencialidad: `esSeguimientoDeOrientacion`); las **faltas** no las ve el coordinador
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
  vencido, nunca borra. **Pendiente, a propósito**: la migración histórica. **Las faltas no llevan descuento de décimas** (se retiró el campo): descontar nota por conducta exige criterios previos, procedimiento documentado y derecho de contradicción (Corte Constitucional, T-076/26), así que no vive en el catálogo de faltas; si algún día se calcula una valoración de convivencia, sale de decisiones en firme y de la evaluación (M12), nunca de un valor por falta. `npm run migrate:retirar-campos-convivencia` limpia el campo de bases anteriores.

### M15 (Comité de Convivencia Escolar) — estado: casos, comité y actas completos

Backend `/convivencia` (modelos `CasoConvivencia`, `MedidaConvivencia`, `EntidadExterna`, `ProtocoloConvivencia`), frontend
`CasosConvivenciaPage` (`/convivencia/casos`, la lista) y `CasoConvivenciaPage` (`/convivencia/casos/:id`, **el caso en su propia página**, no en un drawer: historia por pestañas a la izquierda y resumen con las acciones a la derecha; cada acción abre un solo formulario lateral sobre la página, nunca uno sobre otro; la abren «Abrir» y los casos con alerta de la lista, y «Abrir caso» de las solicitudes), `SolicitudesCasoPage` (`/convivencia/solicitudes`, abre caso desde la solicitud que envió el docente) y
las pestañas Faltas / Medidas / Entidades / Protocolos / Plazos de `CatalogoConvivenciaPage`. Modelos nuevos: `FaltaConvivencia`, `SolicitudCaso`. Reglas que no se ven leyendo un solo archivo:

- **Solo convivencia ve un caso**: ADMIN y el `COORDINADOR_CONVIVENCIA` de la sede del caso (ni coordinador académico, ni secretaría, ni
  docente). "No existe" y "no autorizado" son el mismo 404. Quien se declara impedido (o un ADMIN lo aparta) por conflicto de interés
  deja de verlo (`impedidos[]`, RN-15-11); el ADMIN siempre puede auditarlo. El director de grupo solo ve, en su historial, que existe un
  caso y su estado (`caso` en la observación reservada). **Todo detalle de caso se audita**, sin muestreo.
- **Faltas del manual** (`FaltaConvivencia`: código del manual único por institución, descripción, `gravedad` I/II/III, `estado`; sin categoría ni
  "frases" ni descuento de notas): las definen ADMIN y `COORDINADOR_CONVIVENCIA` en `/convivencia/faltas` (alta/edición/estado/
  eliminar solo si no se usó) y por **carga Excel/CSV** (`/convivencia/faltas/importacion` y `/plantilla`; `importacionFaltas.service.ts`,
  `COLUMNAS_FALTAS` en `constants/importacionConvivencia.ts` y su guía en `lib/columnasImportacion.ts`, que se actualizan en el mismo cambio). Es la
  **única carga masiva de convivencia**: `.xlsx` o `.csv` por el mismo canal (`leerCsv` o `exceljs` → filas normalizadas → un plan de validación), **se
  valida todo el archivo antes de escribir** (una fila con error y no se guarda nada), idempotente por código, fórmulas neutralizadas al generar y
  rechazadas al leer, firma ZIP, 2 MB, 1000 filas. Cada carga queda en un `LoteImportacion` (solo la huella SHA-256, no el archivo).
- **`SolicitudCaso` es el traspaso M14 → M15**: la crea una **falta grave** que el docente reporta (la falta del manual que eligió, hechos, estudiantes nombrados y contención; sin roles) o una falta Tipo I
  que el docente escala (con la falta copiada y los estudiantes como presuntos responsables). La atiende convivencia de la sede desde `/convivencia/solicitudes`
  (`GET`, auditada): **abrir caso** (`POST /convivencia/casos` con `solicitud_id`, la solicitud pasa a CONVERTIDA y el caso hereda hechos y
  `contencion_reportada`; **de un reporte coordinación confirma el tipo (llega el de la falta que eligió el docente) y asigna el rol de cada estudiante**: sin roles responde 400) o **descartar con motivo**.
  Los registros anteriores al reporte urgente (faltas II/III con su solicitud y antecedente) se siguen leyendo igual. Un caso también puede abrirse directo (`origen`: `SOLICITUD` | `DIRECTO`).
- **Tipos I/II/III fijos (ley); todo lo demás es del colegio.** El tipo lo fija quien abre el caso (no el docente); subir de tipo es de
  convivencia con motivo (y suma los pasos del protocolo nuevo sin perder lo hecho); bajarlo, solo ADMIN. Las faltas del manual son las
  `FaltaConvivencia`: la decisión las referencia (`faltas_ids`, copiadas). `ProtocoloConvivencia` (pasos por tipo) se **copia** al caso al abrirlo:
  editar el protocolo no altera casos en curso.
- **Flujo por tabla** (`TRANSICIONES_CASO`, `utils/casoConvivencia.ts`): ABIERTO → EN_ATENCION → EN_MEDIACION → EN_SEGUIMIENTO, REMITIDO
  (exige haber registrado la remisión; sigue en seguimiento). **Cerrar** no es transición genérica: `pendientesParaCerrar` exige pasos
  obligatorios cumplidos; en II y III, atención inmediata e informe a los acudientes (lo cubre **cualquiera** de estas tres cosas: el aviso automático del sistema, una anotación manual o una citación enlazada que no se canceló); en III, remisión o justificación escrita; y según el
  resultado, remisión (REMITIDO) o decisión + medida (MEDIDA_APLICADA). **La decisión y cualquier medida aplicada exigen descargos previos** (presunción de inocencia). Un
  paso obligatorio del protocolo solo se marca «No aplica» con una justificación escrita (400 si falta). `GET /convivencia/casos` filtra también por parte del
  `codigo` (el selector de casos del comité lo usa: trae hasta 50 y para uno más antiguo se busca por código). Reabrir y anular son solo ADMIN con motivo (anular solo un caso recién ABIERTO y devuelve su solicitud a PENDIENTE).
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
- **Convocatoria, periodicidad y contenido del acta** (Decreto 1965 de 2013, arts. 23 a 25; **validar la numeración y el texto con la norma vigente, SUIN-Juriscol**):
  una sesión **puede crearse con fecha futura**: crearla es convocar a los miembros activos y exige indicar **cómo se citó** (`convocatoria`: medio de `MEDIOS_CITACION` y nota
  opcional; el envío de la citación no lo hace el sistema). El acta **no se firma** hasta que llegue la fecha de la sesión ni sin ese medio (409). Cada asistente lleva su
  **excusa** (solo se guarda de quien no asistió) y un miembro puede ser la **secretaría técnica** (`es_secretario`, uno por año como el presidente), que el PDF imprime. El
  **quórum por caso** (sin los recusados) ya **no bloquea la firma**: se guarda en `casos_tratados[].quorum` y el acta lo imprime como advertencia; el quórum general de la
  sesión sí sigue siendo requisito. **Periodicidad** (`periodicidadDelComite`, pura; `MESES_MAXIMOS_ENTRE_SESIONES_ORDINARIAS` = 2, mínimo de la norma y por eso constante):
  `GET /convivencia/comite/sesiones` trae `periodicidad` y el panel de convivencia `comite.periodicidad_vencida`; cuenta desde la última ordinaria realizada (o el inicio del año
  lectivo) y una ordinaria solo convocada no salva el plazo. `GET /convivencia/casos/:id` trae `sesiones_comite` (las actas no anuladas donde se trató el caso). **La huella
  sigue siendo compatible hacia atrás**: convocatoria, secretario, excusas y quórum por caso entran a `contenidoFirmable` solo cuando existen, así un acta firmada antes se
  verifica íntegra (hay prueba que reconstruye ese formato).
- **Remisión a orientación** (`RemisionOrientacion`, colección aparte; `remisionOrientacion.service.ts`): **siempre la hace convivencia a mano**, desde el caso
  (`POST /convivencia/casos/:id/orientacion`, a los estudiantes del caso que elija; no se repite una remisión manual en curso). Ninguna medida ni paso del protocolo
  remite solos (se retiró la bandera `remite_a_orientacion`); las remisiones automáticas que dejó esa versión anterior (`origen` `MEDIDA`/`PASO`) se conservan y se siguen
  leyendo. La remisión copia el contexto del caso (código, tipo, hechos) para que orientación **vea los hechos pero no
  a los demás involucrados**. Un caso con remisiones a orientación no se anula.
- **Orientación** (`/orientacion/remisiones`, `OrientacionPage`; solo `ORIENTADOR` de la sede y ADMIN, "no existe" = "no autorizado" = 404): estados
  PENDIENTE → EN_ATENCION (con la primera atención) → ATENDIDA (exige al menos una atención). Las **atenciones son confidenciales**: solo las lee quien
  las escribió y un ADMIN (otro orientador ve que existe, no el texto); convivencia ve desde su caso solo estado y fechas (`remisiones_orientacion`), y
  la auditoría nunca lleva el contenido. Solo el orientador registra atenciones; ADMIN solo consulta. La lectura se audita (`ORIENTACION_*`).
- **Ruta de atención del Decreto 1965 de 2013** (arts. 42 a 44; **validar la numeración y el texto con la norma vigente, SUIN-Juriscol**): el protocolo de cada tipo lo
  define el colegio, y el botón «Cargar protocolo estándar del Decreto 1965» (`lib/protocoloDecreto1965.ts`) solo **rellena el formulario**, sin guardar. Trae únicamente
  los pasos que el caso no registra aparte (mediación y seguimiento en tipo I; comité informado o citado, Policía en tipo III, reporte al SIUCE y seguimiento): la
  atención inmediata, el informe a los acudientes, las medidas de protección, los descargos, las remisiones y la decisión ya tienen su registro y su exigencia al
  cerrar. **El comité no tramita ni cierra casos** (lo hacen coordinación de convivencia y rectoría con el manual): la norma le pide ser informado (tipo II) o citado
  (tipo III), analizar y dejar constancia en acta. El **reporte al SIUCE** y el comité informado/citado son pasos del protocolo, no campos ni candados nuevos.
- **Aviso a las familias** (`avisarSituacionDeConvivencia`): al abrir un caso tipo II o III, o al subir uno tipo I a II o III, los acudientes (con portal) de los
  **afectados y los presuntos responsables** (`ROLES_CUYA_FAMILIA_SE_INFORMA`; no testigos ni quien reportó) reciben una alerta crítica `FALTA_GRAVE` y un punto en la
  pestaña de convivencia de su hijo, **sin hechos, sin nombres de otros menores y sin decir qué papel tuvo cada uno**. **Ese aviso deja su propia constancia en el caso** (`notificaciones[]` con `automatica: true`, «Aviso automático del sistema»,
  cuántos acudientes con portal), así el coordinador no anota a mano lo que el sistema ya hizo; solo se anota si había al menos un acudiente con portal. Las familias sin portal se informan por fuera y se **anota con una
  sola nota** («A quién se informó y cómo»: ya no hay tipo ni medio que elegir, el sistema no llama ni envía mensajes; `tipo` y `medio` son opcionales en la API y quedan `ACUDIENTES`/`OTRO`) o se las cita (M24).
- **Qué cuenta como falta para otros módulos** (`faltasContadas`, `faltasConvivencia.service.ts`): un solo criterio para la promoción M19 (`FALTAS_CONVIVENCIA_AL_MENOS` y el cierre que lee el
  rollover), el módulo predictivo, la ficha técnica de la comisión M20 y el panel de convivencia M30. **Tipo I** = las faltas que el docente registró en el Observador; **tipo II y III** = solo
  los casos con **decisión en firme** (`decision` registrada, caso sin anular), una vez por cada presunto responsable y con el tipo vigente del caso. Un reporte urgente, una solicitud o un caso sin
  decisión **no es una falta** (presunción de inocencia; un caso descartado no debe dejar rastro). Una falta II/III guardada como observación antes del reporte urgente sigue contando mientras no
  esté ligada a un caso (`observacion_ids`); si ya tiene caso, cuenta el caso y solo con decisión, para no contarla dos veces. El panel de convivencia excluye los casos de los que el usuario se
  declaró impedido. Pruebas: `tests/integracion/faltasConvivencia.int.test.ts`.
- **Pendiente, a propósito**: portal del acudiente/estudiante (M27). El PIAR es M16.

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
  objetivo flexibilizado lo **escribe el docente de la asignatura** (texto libre: el banco de DBA ya no existe; los PIAR emitidos antes conservan los objetivos
  congelados en su snapshot y se reimprimen igual). Seguimiento por ajuste y periodo (mínimo configurable,
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
  arriba) y muestra el grupo titular y, desde M09, **las clases que el horario asigna al espacio** (`GET /horarios/espacio-ocupacion?academic_year_id=&jornada_id=&espacio_id=`, `ocupacionDeEspacio`: el horario publicado o, si no hay, el último borrador, marcado como tal; `MallaOcupacionEspacio`).

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
- **Qué plan rige en una sede/jornada** (`obtenerGradoPlanEfectivo`, y su espejo `resolverGradoPlan` en `StudyPlanPage`): sede+jornada → jornada → sede → base
  general, y **una entrada sin asignaturas no cuenta** (no tapa el plan que se hereda; solo si ninguna tiene asignaturas se devuelve la vacía). La
  pantalla dice de dónde sale lo que muestra (plan propio, o «por defecto se está usando el plan de …»), porque grupos, carga docente y horarios (M09)
  leen exactamente eso. `obtenerOCrearGrado` devuelve el subdocumento ya empujado a `plan.grades` (con el literal, el primer guardado de un grado nuevo
  quedaba vacío).
- **Guardar la malla de un grado avisa qué más cambió** (`calcularImpactoDelPlan`, `planEstudiosDependencias.service.ts`): `POST /curriculum/study-plan/asignaturas-grado(s)` responde `{ data: plan, impacto }` con las asignaciones docentes cuyas horas se
  actualizaron y los horarios M09 (BORRADOR/PUBLICADO) que tienen sesiones de esas asignaciones y quedaron desfasados; el motor no los recalcula solo. `StudyPlanPage` lo muestra bajo la tabla.
- **Una asignatura que ya está en la malla, en una ponderación o en la distribución de un grupo de cualquier plan no cambia de
  `area_id`** (`actualizarSubject`): dejaría ponderaciones colgando de un área que ya no es la suya.
- **Topes de carga docente** (`Institution.limites_carga_docente`, `max_direcciones_grupo_por_docente`,
  `tolerancia_subcarga_horas`) se editan juntos en M08 y no hay valores quemados en el diagnóstico. El semáforo es la función
  pura `resumirCargaDocente` (`utils/cargaDocente.ts`, con tests en `backend/tests/`, `npm test`): un docente en varios niveles se
  mide como fracción de su jornada (`fraccion_carga`), y sin horas por nivel no se supone ninguno (`SIN_CARGA`).
- **Pantalla de Carga académica sin docente elegido** (`TeacherAssignmentsPage`, pestaña «Ficha por Docente»): en vez de un vacío muestra `GraficaCargaDocentes` (barras verticales de horas semanales de mayor a menor, ancho fijo por barra para que con cientos de docentes se desplace a los lados; color = estado de carga, y la barra abre la ficha) y `ListaDocentesCarga` (buscador, «ver más» de 25 en 25 y el botón «Gestionar carga académica»). Las tarjetas Sobrecarga y Subcarga abren `DocentesPorSituacionDrawer` con los mismos docentes que cuentan. Todo sale de `docentes-resumen`: sin endpoint nuevo.
- **Las horas de una dirección de grupo las fija quien la asigna** (`horas_semanales`, 0 por defecto = no suma). Si son más de 0
  cuentan en el nivel del grupo dirigido, igual que una clase.
- **Asignar una dirección a un grupo que ya tiene director exige `reemplazar_director: true`** (409 si falta); el anterior queda
  inactivo (historial) y se audita `ASIGNACION_DOCENTE_REEMPLAZADA`. El límite de direcciones por docente se protege de la
  concurrencia con un contador común dentro de la transacción (`DIR-<año>-<docente>`).
- **Quitar o cambiar a un docente de una clase solo lo frena M12** (actividades o notas ya registradas); el plan de aula (M07) ya no lo
  impide ni se borra: queda archivado y el docente que llega puede adoptarlo. Una CLASE se elimina físicamente (no queda «inactiva»), por eso
  el plan de aula guarda su propia llave y no cuelga de la asignación.

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
- **Coherencia con los demás módulos** (`utils/horarioCoherencia.ts`, puro y con tests; la usa `cargarContexto`): las horas de una clase las
  manda el **plan de estudios que rige en la sede y jornada del grupo** (`horasDelPlanDeGrupo`: base del grado, más lo de la jornada y lo del grupo);
  la copia que guarda `TeacherAssignment` puede haber quedado atrás, así que M09 programa con las del plan y lo avisa (`HORAS_SEGUN_PLAN`). Una
  asignación cuya asignatura ya no está en el plan del grupo no se programa (`ASIGNACION_FUERA_DEL_PLAN`); una asignatura del plan sin docente se
  avisa y se cuenta en Insumos (`ASIGNATURA_SIN_DOCENTE`, columna «Plan»). Un grupo sin plan aplicable se programa con las horas de su asignación.
  También avisa (sin bloquear): docentes inactivos, docentes con clase en otra jornada —de esta u otra sede— cuyas horas se cruzan con esta
  (`DOCENTE_EN_JORNADAS_QUE_SE_CRUZAN`, solo mientras esa otra jornada no tenga un horario que respetar; ver «Docentes en dos jornadas» abajo), grupos sin salón titular o con uno eliminado/en
  mantenimiento/de otra sede (solo si la sede registra salones), espacios de una regla `ESPACIO_REQUERIDO` que ya no sirven
  (`ESPACIO_PARCIAL` / `ESPACIO_NO_DISPONIBLE`) y horas que piden un mismo espacio por encima de lo que da en la semana (`ESPACIOS_INSUFICIENTES`).
  Los grupos activos y los espacios usables se filtran por exclusión (`$ne: 'CLOSED'`, `$nin: [EN_MANTENIMIENTO, INACTIVO]`) para no perder
  documentos anteriores al campo `estado`. Publicar **reasigna los espacios** con los de hoy. El detalle de una versión
  (`GET /horarios/:id`) trae `carga_cambio` (sesiones nuevas/que sobran/con otra duración frente a la carga actual) para decir que está desfasada antes de que publicar la rechace.

- **Docentes en dos jornadas (p. ej. Mañana de secundaria y Única de media técnica).** Que dos jornadas se cruzan en el reloj es normal; lo que no puede pasar es que un docente
  quede en dos clases a la misma hora. Cada jornada se sigue generando por separado, pero `restriccionesDeOtrasJornadas` (`horario.service.ts`) lee, para las jornadas que se
  traslapan (de esta u otra sede), el horario **publicado** o, si no hay, el **borrador** más reciente, pasa sus sesiones a **horas reales** (`ocupacionesDeSesiones`) y bloquea esas horas del docente
  como franjas NO disponibles DURAS (`celdasBloqueadasPorOcupaciones`, variables internas `ext:<docente>`: no se guardan ni salen en Variables). Sirve con franjas idénticas o distintas, porque se comparan
  horas, no números de periodo. El que se genera primero no tiene qué respetar; el segundo evita al primero (y si faltan franjas libres, el diagnóstico de capacidad y el 409 al publicar lo dicen). Editar a mano
  una clase que choca con la otra jornada da un conflicto duro «Cruce con la otra jornada del docente». El conflicto **dice con qué clase choca** (docente, asignatura y grupo, día y hora, jornada, sede y versión; `aIncidencias` lee `cruces` del contexto) y trae `jornada_cruce_id`/`sede_cruce_id`: `PanelVersiones` muestra «Ir a esa jornada» y la pantalla cambia de sede y jornada. Para dejar una clase donde está se **fija** (queda `fija`) y se **regenera la otra jornada**, que lee este borrador (solo si esta no tiene una versión publicada, que es la que tiene prioridad) y evita esas horas. Si el horario de la otra jornada se generó con franjas distintas de las actuales no se usa y se avisa
  (`HORARIO_OTRA_JORNADA_DESFASADO`); con borrador se avisa (`..._EN_BORRADOR`). Al regenerar una jornada, conviene regenerar la otra para que ambas queden coherentes.
- **Tiempo libre (`PanelTiempoLibre`)**: la pestaña lista lo ya registrado y la tabla (malla) **solo se abre a pedido** («Abrir tabla» en un registro o «Agregar tiempo libre»), con el docente o los grados de ese registro. Antes mostraba siempre la malla del primer docente y parecía vacía al volver a la pestaña aunque lo guardado estuviera bien.
- **No es una optimización conjunta:** las dos jornadas no se resuelven a la vez (una puede dejar a la otra sin solución); es el orden de generación lo que decide quién cede.
- **Los bloques mandan sobre las preferencias blandas** (`utils/motorHorarios/bloques.ts`, `sesiones.ts#ajustarBloquesDeLaSemana`, `evaluacion.ts`). Un bloque de 2 h (patrón `DISTRIBUCION_BLOQUES`) solo vale si queda
  **entero entre dos descansos**; antes, una preferencia blanda (p. ej. «no seguidas») le ganaba a «no cruzar el descanso» y salían 3–4 h seguidas de la misma materia con el bloque montado sobre el recreo. Ahora:
  (1) **partir es una decisión de estructura, no de resultado**: `expandirSesiones` ajusta los bloques de cada asignación a los tramos sin descanso de la semana (`tramosDeSemana`, `ajustarBloquesATramos`: mayor a menor,
  cada uno en el tramo más justo, y el que no cabe se parte por la mitad) **y a la capacidad del grupo y del docente** (sus franjas NO disponibles duras). Solo depende de los insumos, nunca de lo que haya generado el motor,
  porque publicar, editar a mano y `carga_cambio` vuelven a expandir y deben reconstruir exactamente las mismas sesiones (`${asignacion}#${indice}`). Un patrón partido se avisa con `BLOQUES_PARTIDOS`
  (`BLOQUES_NO_CUADRAN` sigue siendo «el patrón no suma las horas»); `diagnosticarCapacidad` ya no declara imposible un bloque que no cabe: se parte.
  (2) **Reglas propias del motor, sin variable ni switch y nunca DURAS** (constantes en `evaluacion.ts`): `PESO_BLOQUE_PARTIDO` = 1000 (un bloque montado sobre un descanso, incidencia `BLOQUE_PARTIDO`),
  `PESO_ASIGNATURA_SEGUIDA` = 250 (dos sesiones de la misma asignatura en horas contiguas del grupo, `ASIGNATURA_SEGUIDA`: un bloque de 2 h elegido es una sola sesión y no cuenta) y `PESO_ASIGNATURA_MISMO_DIA` = 40 (la misma asignatura dos veces el mismo día, solo suma al costo).
  Son más caros que cualquier peso blando de una variable (1–10 por incidencia) por eso respetar el bloque gana, y más baratos que `PESO_DURO`. El generador además poda del dominio las posiciones que cruzan un descanso (`sinMontar`).
  Una regla nueva de este tipo va en `evaluacion.ts` con su código en `CodigoIncidencia`, no como `VariableHorario`.
- **Colores pastel por asignatura** (`PALETA_ASIGNATURAS` en `constants/horarios.ts`, 20 pares `fondo`/`borde`; `utils/coloresHorario.ts#asignarColoresAsignaturas`): es la **única excepción pedida por el usuario** a «no agregar colores
  nuevos» y vale solo para distinguir asignaturas en los horarios (UI y PDF), no es un token de la guía. El color se reparte por el orden de los ids (el de creación): agregar una asignatura no cambia el de las demás. `construirCatalogo` lo
  trae en `catalogo.asignaturas[].color` (y `docentes[].nombre_corto`, el nombre abreviado para las hojas totales); **en pantallas y PDF de toda la sede** el mapa se calcula sobre la unión de las jornadas
  (`listarPublicadosDeSede`) para que «Matemáticas» sea del mismo color en la mañana y en la tarde. El frontend los pinta con `style` (son dinámicos, no clases de Tailwind) y siempre acompañados del nombre: el color nunca es la única señal.
- **Hojas totales y PDF de toda la sede** (`horarioPdf.service.ts`): `GET /horarios/:id/pdf?vista=` acepta además de `GRUPO`/`DOCENTE`/`GENERAL` las vistas **`TOTAL_GRUPOS`** (una hoja con todos los grupos de la jornada en filas y
  los días × periodos en columnas, estilo «horario total» de asc Horarios pero con el diseño de Klassy; si no cabe en una página se reparte pareja) y **`COMPLETO`** (hoja total de grupos + hoja total de docentes + una página por docente +
  una por grupo, con marcadores para saltar), y `GET /horarios/sede/pdf?academic_year_id=&sede_id=` junta **todas las jornadas publicadas de la sede en un solo PDF** (solo ADMIN/COORDINADOR; la ruta va **antes** de `/:id/pdf`
  o Express la tomaría como un id). Los totales, `COMPLETO` y `GRUPO`/`DOCENTE` sin elegir uno (todos los grupos o todos los docentes en un archivo) solo los bajan ADMIN/COORDINADOR; con un grupo o docente concreto conservan su permiso de siempre (docente, estudiante y acudiente solo lo suyo, y solo publicado). Limitación a propósito: la página de un docente es **por jornada** (un docente en
  dos jornadas tiene una en cada bloque; no se fusionan en una sola hoja).
- **Pestaña «Publicados»** (`HorariosPage`, `PanelPublicados`; `GET /horarios/publicados?academic_year_id=&sede_id=` → `listarPublicadosDeSede`, hook `usePublicadosDeSede`, descarga `descargarPdfSede`): una tarjeta por jornada con lo publicado
  (grupos, docentes, asignaturas, fecha), el visor con las cuatro vistas (hoja total de grupos, hoja total de docentes, un grupo, un docente; `MallaHorario` con `HojaTotal`) y los botones de PDF (toda la sede, la jornada, cada hoja).
  `LeyendaAsignaturas` muestra la sigla, el color y el nombre de las asignaturas que salen en esa versión y también está en la pestaña de versiones.
- **Pruebas:** `tests/motorHorarios.test.ts` (partir bloques por tramos y por tiempo libre, bloque sobre el descanso penalizado sin ser duro, materia seguida vs. mismo día, generación sin variables que deja los bloques enteros y sin materia seguida) y `tests/horarioPdf.test.ts` (paleta estable, páginas de cada vista, sede completa, 404).
  La interfaz de «Publicados» se revisó en un navegador real con la API simulada (no hay base de datos en el entorno de pruebas): las pruebas de integración del módulo no se pudieron correr.

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
`CertificadosPage` (`/secretaria/certificados`, ADMIN y SECRETARIA: pestañas Expedir / Historial / Firmas y sellos [ADMIN y SECRETARIA: todo, salvo designar quién es el rector, que es solo del ADMIN] / Tipos de documento / Plantillas [ADMIN y SECRETARIA, en todo tipo no archivado]) y `VerificarCertificadoPage`
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
  su vista previa sí funciona (así Secretaría prueba lo que redactó). **ADMIN y Secretaría** hacen lo mismo con los tipos (`permisosTipo`, `utils/permisosCertificados.ts`: crear, editar, redactar el texto, activar —que exige que el texto cumpla los mínimos—, archivar y eliminar, en cualquier tipo no archivado), porque en un colegio real el rector rara vez está y la secretaría lo hace todo. Anular un certificado ya expedido lo hacen **ADMIN y Secretaría** (con motivo obligatorio y auditoría). Secretaría también define la política de firmas por documento y las dependencias del paz y salvo (decisión del usuario: «Matrículas, certificados, constancias, libros y documentación académica» son suyos). Siguen siendo **solo del ADMIN**: designar quién es el rector y la anulación masiva por elemento comprometido. **Eliminar solo si nunca se expidió nada**
  (se borra con sus textos); con documentos expedidos se **archiva**: deja de ofrecerse, pero lo expedido se verifica por su QR, se reimprime y conserva su nombre (por eso los tipos expedidos
  no se borran: el código QR y el consecutivo no pueden quedar huérfanos). El prefijo y las fuentes solo cambian en borrador y sin documentos expedidos; el prefijo es único incluso entre
  archivados. Las claves de los tipos de partida no se reutilizan. Un tipo creado arranca con un texto genérico armado con sus fuentes (`contenidoInicial`) que ya cumple los mínimos.
- **Alcance, fuentes y tipos complementarios (M26 ↔ M19).** Un tipo declara su **alcance** (`niveles` y `grados_numeros`, vacío = todos; `tipoAplicaAlGrado`): solo se ofrece a matrículas de ese nivel y grado, y expedirlo en otro es 409. Fuentes nuevas: `CULMINACION` (Transición, 5°, 9°: exige el cierre de promoción de **ese grado** con concepto aprobatorio, `snapshot.culminacion`; la variable `promocion.texto` aplica a `VALORACIONES` o `CULMINACION`, por eso `VariableCertificado.fuente` puede ser un arreglo y `variableAplica` decide) y `SERVICIO_SOCIAL` (`snapshot.servicio_social`, variable `servicio_social.horas`; sin horas verificadas no se expide). `TITULACION` ya existía pero el drawer no la ofrecía y la pantalla fallaba con ese tipo (`ETIQUETA_FUENTE` no la tenía): ahora sí. **Los tipos complementarios se siembran solos**, en borrador, la primera vez que se usa M26 (`tipos_complementarios_sembrados`, `crearTiposComplementariosQueFaltan`; si el colegio elimina uno no vuelve; el script `sembrar:tipos-titulacion` solo repite lo que falte): `ACTA_GRADO`, `DIPLOMA_BACHILLER`, `CONSTANCIA_CULMINACION` (grado 11), `DIPLOMA_TRANSICION`, `CERTIFICADO_CULMINACION_PRIMARIA`, `CERTIFICADO_CULMINACION_BASICA` y `CERTIFICADO_RETIRO` (matrícula `RETIRADO`, fuente `PAZ_Y_SALVO_SALIDA`: con el paz y salvo de salida aprobado). **Para que no parezca que un documento no existe**, la ficha del estudiante al expedir (`matriculasExpedibles`) lista los tipos del grado y explica en `restricciones` por qué uno todavía no se puede expedir («Debe 40 horas de servicio social», «sin cierre de promoción»…). **No se construyó** la fuente «convivencia y conducta» a propósito (el observador es interno, con datos de menores; un certificado sale del colegio) ni «corte de notas parciales» (hoy solo existe dentro del boletín parcial de retiro, que exige una salida registrada: habría que extraer su cálculo). **La vista previa de una plantilla usa el grado del documento** (`snapshotDeMuestra`: el estudiante inventado cursa el grado que declara el tipo, con el nombre real del catálogo, y trae el concepto de promoción y las horas de muestra si el tipo usa esas fuentes); antes siempre era «Quinto, 5A». El texto de partida de cada ciclo lo nombra (`CICLO_QUE_CULMINA`); una plantilla ya guardada no cambia sola: «Cargar texto estándar sugerido» trae el nuevo. **Emisión por lote** (`certificadoLote.service`, pestaña «Expedir por grupo», `POST /certificados/lote` y `/lote/zip`): **solo en los grados donde se gradúa —Transición, 5°, 9° y 11°— (`GRADOS_DE_GRADUACION`) y solo documentos de graduación** (`esDocumentoDeGraduacion`: culminación de ciclo, y acta y diploma que exigen estar graduado; no la constancia de quien aún no se gradúa): el servidor responde 409 con otro grado u otro documento y la pantalla no deja elegirlos, el documento sale del grado del grupo (en 11° son los dos) con el destinatario y las firmas de partida del tipo; un grupo (máx. 80), cada estudiante es una expedición normal en su transacción (el consecutivo no tiene huecos), se entrega al acudiente principal, quien no cumple queda en el resumen con su motivo, quien ya tiene uno vigente no se duplica; los PDF salen en un ZIP (`jszip`).
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
  **La EPS como destinatario no se lee del expediente** (decisión del usuario: son datos de salud y basta con que Secretaría lo anote en el documento). La opción de partida «Entidad Promotora de Salud» dice «la EPS o la ADRES», sin nombrar entidad; para nombrar una concreta se usa «Otro» y se escribe en el mismo documento. Si una plantilla define una opción con `fuente_entidad` (frase con `{entidad}`), el nombre también lo escribe quien expide (campo «Nombre de la EPS»; sin él, 400); nunca viene de M03. `ficha.estudiante.eps` sigue en la ficha pero ningún documento la usa. El portal del acudiente no ofrece las opciones con `fuente_entidad`. M26 solo **lee** M03/M04: no se tocó ninguno de los dos.
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
  se dibuja **solo desde el snapshot**, así una reimpresión es el mismo documento con el mismo código. Un documento mal expedido se **anula con motivo** (ADMIN
  o Secretaría, esta solo en las sedes que tiene asignadas): sigue verificándose como ANULADO y se imprime con marca «ANULADO». La auditoría (`CERTIFICADO_*`) nunca lleva el motivo.
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
  `puede` y la pantalla solo lo refleja). **ADMIN y SECRETARIA** hacen lo mismo: cargan, reemplazan, quitan y ven las imágenes (firma de Rectoría, de Secretaría y sello), definen la política por documento
  y las dependencias del paz y salvo y designan quién firma como Secretaría Académica. **Solo el ADMIN designa quién es el rector** (`designar.rectoria`). Las rutas dejan pasar a ADMIN y SECRETARIA y el servicio aplica la
  regla fina (403 para quien no sea ninguno de los dos). La carga de imágenes es `POST` (como todas las del sistema: `api.upload` solo envía POST; con `PUT` la subida daba 404 y ninguna firma se cargaba).
- **Firma de Rectoría y Secretaría**: la secretaría estampa la de Rectoría sin necesitar delegación (el campo `permitir_firma_rectoria_a_secretaria` se conserva en la configuración pero **ya no decide nada**; quedó de cuando era una llave del ADMIN). Las opciones elegidas, los firmantes y el hash de cada imagen quedan en el snapshot y **entran en la huella**.
- **Imágenes: almacén por contenido, en disco** (`utils/almacenImagenes.ts`, como el resto de archivos de los módulos): firmas, sello y **escudo** se guardan en
  `uploads/certificados/imagenes/<sha256>.<ext>` (PNG/JPG, 500 KB, firma de bytes), nunca se sobrescriben ni se borran; el documento expedido solo guarda la huella. **El escudo
  (`Institution.logo_url`, M01) también se congela al expedir** (`encabezado.escudo`), así una reimpresión sale con el escudo de entonces aunque el colegio cambie de logo
  (documentos anteriores: usan el logo vigente). **Si un archivo se pierde** el sistema no deja un 500: `vistaConfiguracion` marca `imagen_faltante` y no ofrece esa firma para
  documentos nuevos, el PDF responde 409 explicando cómo recuperarlo, y **volver a cargar la misma imagen recrea exactamente el mismo archivo** (se identifica por su
  contenido); el escudo se restaura solo si el logo vigente es el mismo. El respaldo debe cubrir `uploads/` (`deploy/respaldar.sh` ya lo hace).
- **Alcance por sede.** SECRETARIA solo expide, ve y reimprime documentos de las sedes que tiene asignadas (`sedes_ids`); sin sedes no ve nada; ADMIN ve todas. Cada
  certificado guarda `sede_id` (la de la matrícula); «no existe» y «no es de tu sede» responden igual (404). Certificados anteriores: `npm run migrate:certificados-sede`
  (idempotente; mientras no se corra, solo el ADMIN los ve). La vista previa de un documento real se audita (`CERTIFICADO_VISTA_PREVIA`, sin contenido), **una sola vez por usuario, matrícula y documento cada 10 minutos**: la pantalla de expedir la vuelve a pedir en cada cambio y el servidor (no el cliente) decide no repetir la anotación.
- **Expedir en dos columnas** (`ExpedirCertificado` + `VistaPreviaExpedicion`): formulario a la izquierda (estudiante, matrícula, documento, destinatario, solicitante, dependencias, firmas y sello) y a la derecha el PDF de vista previa con los datos reales, que se vuelve a dibujar solo al cambiar cualquier opción (sin solicitante: no lo necesita). El **QR y el código de la vista son de muestra**: el consecutivo y el token nacen al expedir, dentro de la transacción, para que la numeración no tenga huecos. «Expedir y descargar PDF» expide, muestra el documento expedido en la columna derecha (`VisorDocumento`, con descargar, imprimir y abrir en otra pestaña) y lo baja al equipo; el historial lo abre en un panel («Ver»). Un estudiante sin matrícula definitiva o condicional no tiene documentos que expedir (aviso en pantalla). Nunca se abre una pestaña después de un `await` (los navegadores la bloquean).
- **Pestaña Plantillas** (`PlantillasCertificadosPanel` y `components/certificados/plantillas/`): barra fija con el documento, su estado, la versión y «Cambios sin publicar», y las acciones Descartar / Ver PDF exacto / Publicar (esta abre un drawer con qué cambia y la nota de la versión); pestañas internas Texto / Diseño / Destinatarios y vigencia / Versiones; vista en vivo a la derecha (Texto y Diseño la comparten). «Cargar texto estándar sugerido» (`GET /certificados/plantillas/:tipo/estandar`) llena el **borrador sin publicar**; `POST …/restablecer` sigue en la API pero ya no tiene botón. La redacción del texto estándar es un punto de partida, **no texto oficial: validarla con la norma vigente**.
- **Diseño del texto de la plantilla** (`ContenidoPlantilla.diseno`, `DisenoPlantilla` en `constants/plantillasCertificado.ts`; pestaña «Diseño», `DisenoPlantillaCard`): tipo de letra (Helvetica, Times o Courier: las fuentes que trae pdfkit, sin subir archivos), tamaño (0.9 / 1 / 1.1) y dos colores `#RRGGBB` (texto corrido; frase de apertura y párrafos destacados). **Solo cambia el cuerpo**: el encabezado institucional, la tabla de valoraciones, las firmas, el sello y el QR siguen siendo del sistema. `null`/ausente = el diseño de siempre (`DISENO_INICIAL` son exactamente los colores y fuentes que el PDF tenía fijos, así un documento sin diseño se dibuja idéntico). Va **dentro de la versión de la plantilla** (inmutable, entra a su huella solo cuando existe: una versión anterior conserva la suya) y se **congela en `snapshot.contenido.diseno`** al expedir, así una reimpresión sale igual aunque después se cambie. Un color demasiado claro para el papel blanco (contraste < 4.5, `problemasDeDiseno`) no se publica. No hay constructor libre: una opción nueva es un campo más del diseño en cuatro sitios (constante, modelo, validador Joi y `DisenoPlantilla.tsx`, más `dibujarBloques` y `VistaEnVivoPlantilla`).
- **Pruebas:** unitarias (`certificados.test.ts`, `certificadosM26Ampliado.test.ts`, `plantillasCertificados.test.ts`: huella, switches, plantillas, variables, tabla de valoraciones) y de integración con base real (`integracion/certificados.int.test.ts`, `integracion/tiposCertificado.int.test.ts`: siembra, ciclo borrador→activo→archivado, eliminar vs archivar, permisos).
  **Las pruebas usan una carpeta temporal para los archivos** (`tests/setup.ts` fija `UPLOADS_DIR`, que `uploadPaths` respeta): antes borraban `backend/uploads` real al terminar.
  Si no se puede descargar el binario de MongoDB, usar `MONGOMS_SYSTEM_BINARY=<ruta de un mongod> MONGOMS_VERSION=<su versión>`.
- **Pendiente, a propósito:** (el certificado de estudio ya se expide como oficial cuando M19 cerró al estudiante con un resultado final; ver M19); que las dependencias del paz y salvo se calculen solas
  (la académica podría leer M12: todas las asignaturas `DEFINITIVO`; cartera, biblioteca e inventario no existen); lema y código estudiantil (M01/M03); resoluciones
  estructuradas; vigencia ya es parámetro de la plantilla; PDF del Libro de Matrícula y su trazabilidad de novedades; actas reglamentarias (CU-SEC-06; el libro de calificaciones ya está en M33); solicitud desde el portal del acudiente (M27); constructor libre de formatos (M21); archivo general (M29); rotación de la clave HMAC; firma electrónica
  certificada (Ley 527/1999, Decreto 2364/2012: la imagen + huella + QR no lo es). **Quién firma está en dos sitios**: M12 guarda el nombre del rector como texto libre en las
  firmas de la planilla y M26 lo toma de un usuario; M26 es la fuente a reutilizar cuando se toque M12.

### M11 (Actividades y planeación de aula) — estado: núcleo completo

Backend `/activities` (modelos `Activity`, `ActivitySubmission`, `ConfiguracionActividades`), frontend `ActividadesDocentePage`
(`/docente/actividades`, CU-DOC-02), `ActividadRevisionPage` (`/docente/actividades/:id` y, solo lectura, `/admin/actividades/:id`), `MisActividadesPage`
(`/mis-actividades`, CU-EST-03), `ActividadEstudiantePage` (`/mis-actividades/:id`) y `ActividadesGestionPage`
(`/admin/actividades`, supervisión de coordinación). Ya no hay drawers de entregas: la revisión y la entrega son **páginas**. `Activity`/`ActivitySubmission` ya existían (M12 los consume: `reportCard.service`
lee `componente_siee` y `peso_en_componente`); M11 los extendió sin romper nada. Reglas que no se ven leyendo un solo archivo:

- **La jerarquía no se copia a la actividad.** Grupo, asignatura, área, grado y docente se leen por FK desde la `TeacherAssignment`
  (`actividadContexto.service.ts`), nunca se duplican en `Activity` (regla de oro de datos). Un docente solo programa sobre sus clases
  `CLASE` activas (M08); coordinación y ADMIN solo consultan.
- **Requisito M07, validado por el servidor:** no se programa (ni se publica, es decir, no se cambia la `fecha_apertura` de) una actividad sin el
  **plan de aula aprobado** de ese docente, asignatura, grado y periodo (`exigirPlanAulaAprobado`, 409 que dice si falta, está en revisión o fue
  devuelto). Corregir un título con el plan reabierto sí se puede. **La actividad ya no guarda ni exige DBA ni competencia** (se retiró el banco);
  el formulario muestra al lado el PDF del plan aprobado. Ver M07.
- **Prevención de sobrecarga (M25 aún no existe):** `utils/actividades.ts#evaluarCalendarioActividad` (pura, con tests) cruza la fecha de
  entrega —un instante; el día se calcula en hora de Colombia— con M05 (periodo efectivo de la sede, recesos/vacaciones, recuperaciones,
  `dias_habiles` de la jornada) y con las demás actividades del grupo ese día. **BLOQUEO** (no se salta): fecha pasada con entrega
  digital, fuera del periodo. **ADVERTENCIA** (el docente confirma con `confirmar_alertas`, si no 409 con `details.alertas`): día no
  lectivo/no hábil, ventana de recuperación, sobrecarga. Los límites (`max_evaluaciones_por_dia`, `max_entregas_por_dia`, 0 = sin límite)
  son de `ConfiguracionActividades` (coordinación los cambia en `/admin/actividades`), no están quemados. Cuando exista M25 este es el
  único punto que debe leerlo (`actividadCalendario.service.ts#revisarCalendario`). `GET /activities/revision-calendario` es la alerta
  temprana mientras se elige la fecha: es la misma revisión que repite el servidor al guardar.
- **Mapa de carga del grupo** (`GET /activities/carga-del-grupo?teacher_assignment_id=&mes=AAAA-MM&excluir_id?`, solo DOCENTE; `cargaMensualDelGrupo`
  en `actividadCalendario.service.ts`, agrupación pura `agruparCargaPorDia` y `nivelDeCarga` en `utils/actividades.ts`, con tests): devuelve, para el grupo de la clase,
  las actividades de **todas** las asignaturas y docentes que caen en cada día del mes (día en hora de Colombia, todos los tipos, sin la que se edita) más los días no
  lectivos y hábiles de la jornada. **Los umbrales son fijos por pedido del usuario** (0–1 baja, 2 moderada, 3 o más sobrecarga) y no dependen de
  `max_evaluaciones_por_dia`: es un apoyo visual, el bloqueo/advertencia sigue siendo `revisarCalendario`. En el formulario de actividad, junto al límite de entrega, el
  botón «Ver carga de tareas del grupo» abre `PanelCargaGrupo` (drawer encima del formulario, no pierde lo digitado) con `CalendarioCalor`; al pasar o elegir un día lista asignatura,
  título, docente y hora, y «Usar este día como fecha de entrega» conserva la hora y desmarca `confirmar_alertas`. «Amarillo» es el token `warning` (no hay color nuevo).
  **Sugerencia formativa, no bloqueo:** `revisarCalendario` suma una alerta de severidad `SUGERENCIA` (`CARGA_DEL_DIA`, `sugerenciaDeCarga`) cuando el día elegido ya tiene 2 o más entregas
  («Este día ya cuenta con X entregas programadas…»); `exigirAlertasResueltas` solo mira `BLOQUEO` y `ADVERTENCIA`, así que nunca exige confirmar. No sale si el límite del colegio ya avisó (`SOBRECARGA_*`).
- **Reglas de entrega:** `requiere_entrega` (false = actividad de aula, el docente califica directo) y `formatos_permitidos` (PDF, Word,
  Excel, PowerPoint, imagen; **vacío con entrega = respuesta escrita**, sin archivo). `permite_entrega_tardia`. Un solo archivo por
  entrega (o intento), 10 MB (`MAX_BYTES_ENTREGA`; nginx en 12 MB por el multipart). El contenido se confirma por firma de bytes
  (`utils/evidenciasActividad.ts`; los Office son ZIP: además extensión coherente y carpeta propia del paquete). Vive en
  `uploads/actividades/<actividad>/`, nunca en Mongo, y solo se baja con sesión (`GET /activities/entregas/:id/archivo`: el propio
  estudiante, el docente titular, coordinación, ADMIN; "no existe" = "no es tuyo" = 404 para el estudiante). La API nunca devuelve la ruta.
- **Estados:** `PROGRAMADA` (no se guarda: es la actividad sin entrega) → `ENTREGADA` / `ENTREGADA_TARDE` → `CALIFICADA`. Los marca el
  servidor al entregar (`evaluarVentanaEntrega`) y al calificar; `estadoDeEntrega` los deriva de lo guardado (una nota siempre es
  CALIFICADA, también en registros anteriores a M11; sin `fecha_entrega` = nota puesta sin entrega = sigue programada). `con_retraso`
  sobrevive a la calificación. **Una sola entrega por defecto** (409 al repetir); con `permite_multiples_entregas` cada entrega es un **intento**
  (hasta `MAX_INTENTOS_ENTREGA` = 10) y se puede entregar hasta que se califique; la carrera con una calificación concurrente la cierra el
  filtro `calificacion_numerica: null` + índice único (409). Las entregas anteriores a los intentos se leen como el intento 1 (y ya no se reemplazan). Entrega exige año `EN_CURSO`, periodo no `CERRADO` y
  sin `PeriodLock` del grupo. El estudiante no ve una actividad antes de su `fecha_apertura` (publicación): 404.
- **Puente hacia M12:** la nota se registra con `notas.service#gradeActivity` (`PATCH /activities/:id/grade`; antes vivía en
  `activity.service`), que pasa por el mismo núcleo que la planilla de M12 (escala de M05, `assertPeriodNotLocked`, historial,
  planilla no cerrada) y marca la entrega `CALIFICADA`. `EntregasRevision` (en `ActividadRevisionPage`) ofrece nota + retroalimentación por estudiante sobre ese
  endpoint; la planilla completa es M12. **La nota es una sola**: `ActivitySubmission.calificacion_numerica` la escriben por igual la actividad, la planilla y el
  Excel (`registrarNotas`), y cada cambio del historial lleva su `origen` (`ACTIVIDAD`/`PLANILLA`/`EXCEL`); la vista de la entrega trae `ultimo_cambio_nota` y la página de
  revisión avisa «esta nota se modificó desde la planilla». `Activity.componente_siee` ya no es un enum: es la **clave de un bloque del molde de la planilla del
  año** (M12), validada al programar (existe y aún tiene cupo de casillas: 409 si el bloque está lleno); `componente_nombre` viaja en la vista. `peso_en_componente` es un
  % opcional del bloque (`null` = automático). El docente cambia bloque y peso mientras la planilla esté abierta, no programa actividades nuevas en una planilla cerrada, y no se elimina una actividad con entregas o notas. El periodo y la asignación de una actividad no se cambian (se elimina y
  se programa de nuevo con el plan de aula del otro periodo).
- **Entregas múltiples** (`actividadEntrega.service.ts`, `utils/entregasActividad.ts`, puras y con tests): cada entrega nueva suma un intento en
  `ActivitySubmission.intentos[]`; los campos de arriba del documento (`fecha_entrega`, `con_retraso`, archivo, texto) **reflejan el intento que cuenta** (el elegido o,
  si el docente no eligió, el último). Con **más de un intento el docente debe elegir cuál es la válida** (`PATCH /activities/:id/entregas/:studentId/valida`, auditado
  `ACTIVIDAD_ENTREGA_VALIDA_ELEGIDA`) **antes de calificar**: lo exigen `registrarNotas` (planilla y Excel) y `gradeActivity`, no solo la pantalla (`exigirIntentoValidoElegido`,
  409). Una nota puesta no se pisa con otra entrega. Cada intento tiene su archivo en `uploads/actividades/<actividad>/` y se baja con `?intento=`. Pasar de varias a una sola
  entrega se rechaza si algún estudiante ya tiene más de un intento.
- **Acceso especial por estudiante** (`actividadRevision.service.ts`, `Activity.accesos_especiales[]`, `POST|DELETE /activities/:id/accesos-especiales`): el docente titular da a UN
  estudiante con excusa válida un plazo personal posterior a la fecha límite (motivo obligatorio, queda en la actividad y no en la bitácora); su entrega no cuenta como tardía y
  se admite aunque la actividad no acepte tardías o esté **cerrada**. **No abre** un periodo cerrado, un `PeriodLock`, el año cerrado ni una nota ya puesta (`motivoSinEntrega`
  es la única fuente de «por qué no puede entregar»; `evaluarVentanaEntrega(plazos, ahora, accesoEspecialHasta?)`). Auditoría `ACTIVIDAD_ACCESO_ESPECIAL_OTORGADO/REVOCADO`.
- **Cerrar o reabrir entregas** (`cerrada`, `PATCH` del docente; `ACTIVIDAD_CERRADA/REABIERTA`) frena las entregas sin tocar la nota ni la fecha. **Editar después de publicar**: los formatos
  no cambian si ya hay entregas, `requiere_entrega` no se apaga con entregas, y todo cambio relevante queda en `modificaciones[]` (solo los nombres de los campos) que ven los
  estudiantes («el docente modificó…»).
- **Contenido enriquecido** (`utils/contenidoActividad.ts`): el editor (Tiptap, `EditorRico`) produce HTML que el servidor **siempre limpia** (`sanitize-html`, etiquetas cerradas, imágenes
  solo como data URI de imagen; 2 MB, `MAX_BYTES_CONTENIDO_HTML`) y guarda en `Activity.contenido_html`; `descripcion` guarda el texto plano derivado para listados. Las imágenes se
  pegan o sueltan en el editor y el navegador las reduce (1280 px) antes. Los listados **no** traen el HTML (solo el detalle, `GET /activities/:id`).
- **Material de apoyo y videos**: hasta 10 adjuntos por actividad (JPG, PNG, WEBP, PDF, Word, Excel, PowerPoint, MP3, MP4; 50 MB; 5 por subida), subidos antes de guardar por
  `POST /activities/adjuntos` (multer a disco temporal → tipo por firma de bytes → guardado **por contenido** en `uploads/actividades/adjuntos/<sha256><ext>`; los temporales se borran
  siempre). La actividad guarda la referencia (`id` = huella, `ext`, `nombre`) y se baja con sesión (`GET /activities/:id/adjuntos/:adjuntoId`); un adjunto quitado se borra del disco solo
  si ninguna otra actividad lo usa (`liberarAdjuntosSinUso`). Los **videos** son enlaces de YouTube o Vimeo normalizados a `{proveedor, video_id}` y se incrustan con las direcciones
  seguras `youtube-nocookie`/`player.vimeo`; no se suben videos como adjunto de la página. nginx: `/api/v1/activities/adjuntos` admite 260 MB.
- **Publicar en varios grupos** (`publicarActividad`, `grupos_adicionales` al crear): copia la actividad en otras clases del mismo docente con la misma asignatura (otro grupo o grado),
  cada copia con **sus propias reglas** (plan de aula de ese grado, bloque con cupo, periodo): la que no se puede publicar se **omite** y la respuesta trae `omitidas` con el motivo; las copias
  comparten `publicacion_id` y la página de revisión las lista («también publicada en»). Las copias son independientes: editar una no cambia las otras.
- **Comentarios públicos** (`ComentarioActividad`, `/activities/:id/comentarios`): conversación abierta del docente y el grupo (1000 caracteres, ≤ 300 por actividad); cada quien borra los suyos,
  el docente titular y coordinación/ADMIN moderan (queda en la bitácora sin el texto).
- **Análisis** (`GET /activities/:id/analisis`, `analizarEntregas`, pura): entregas, retrasos, varios intentos, calificados, promedio/mediana/máx./mín., aprueban/pierden y distribución por
  nivel de la escala del año (una nota fuera de la escala se acota para la distribución, no rompe).
- **Estudiante** (`ActividadEstudiantePage`, `MisNotasPage`): la actividad completa con intentos, plazo personal y comentarios. En «Mis notas» (2 columnas) tocar una actividad **virtual**
  (`requiere_entrega`) lleva a su página; una **presencial** solo muestra el aviso, sin redirigir. El acudiente (portal) ve las mismas tarjetas sin enlaces (`paraFamilia`).
- **Pruebas:** `tests/actividades.test.ts` y `tests/entregasActividad.test.ts` (funciones puras), `tests/integracion/actividades.int.test.ts` (servicios con base real) y
  `actividades.http.int.test.ts` (rutas, validadores, permisos por rol y subida multipart real). **Las de integración de entregas múltiples, acceso especial y adjuntos no se pudieron
  correr donde no hay binario de MongoDB.** La interfaz se revisó en un navegador con la API simulada (editor, página de revisión, página del estudiante, Mis notas).
- **Opciones del docente y de la entrega (ampliación):** el formulario del docente (`ActividadDrawer`) muestra por defecto título, tipo, instrucciones (editor), `comentarios_docente` (texto plano, 1000 caracteres, lo ve el estudiante), material de apoyo, videos y recepción de entregas (con límite y entrega tardía); lo demás vive tras «Más opciones de actividad», incluido el interruptor para ocultar el panel del plan de aula (el drawer no cambia de tamaño, los bloques se estiran). `Activity.permite_editor_texto` y `permite_varios_archivos` (solo efectivos con `requiere_entrega`; varios archivos exige formatos) habilitan en la entrega un editor enriquecido (`respuesta_html`, siempre saneado) y hasta `MAX_ARCHIVOS_POR_ENTREGA` (5) archivos por intento (`archivos[]`; los campos `archivo_*` heredados reflejan el primero y las descargas aceptan `?intento=&archivo=`). En la revisión, una nota ya puesta se bloquea y el botón pasa a «Modificar». En «Mis actividades» toda la fila lleva a la actividad.
- **Depuración de archivos de entregas** (`npm run storage:purge-periodo -- --periodoId=<_id del periodo> [--olderThanDays=30] [--dry-run]`; `purgaAlmacenamiento.service`, reglas puras `utils/purgaAlmacenamiento.ts`, tests `purgaAlmacenamiento.test.ts` y `integracion/purgaAlmacenamiento.int.test.ts`): libera disco en el VPS **sin tocar ningún dato académico**. Solo actúa sobre un periodo `CERRADO` (409 si no; `periodoId` es el `_id` del subdocumento `AcademicYear.periodos[]`) y sobre `uploads/actividades/<actividad>/` (una ruta guardada fuera de esa carpeta se reporta como error y no se borra). Por cada archivo: primero se borra el físico y después se marca en la base `purgado: true`, `fecha_purga` y `path: null` (en `intentos[].archivos[]`, los espejos `archivo_*` del intento y los de la entrega); **nombre, formato y tamaño del archivo, nota, retroalimentación, estado y fechas quedan intactos** y no se actualiza `updatedAt` (`save({ timestamps: false })`). **Antigüedad:** se depura cuando pasaron `olderThanDays` desde lo más tardío entre el fin del periodo y la fecha de ese intento (la M05 no guarda cuándo se cerró el periodo; `fecha_fin` es lo más cercano). Es idempotente (lo depurado se omite, un archivo que ya no estaba en disco igual se marca, un error de disco se reintenta en la siguiente corrida), imprime archivos borrados y MB liberados, sale con código 1 si hubo errores y deja una línea de auditoría `ALMACENAMIENTO_ARCHIVOS_DEPURADOS`. `--dry-run` solo mide. **Es irreversible: respaldar `uploads/` antes** (`deploy/respaldar.sh`). La API marca `archivo_purgado` (entrega e intento) y `archivos[].purgado`; la descarga de un depurado responde **410**; `ActividadEstudiantePage` y `EntregasRevision` no pintan el botón de descarga y muestran `ArchivoDepuradoChip` («Archivo depurado por política institucional»). No se depuran los adjuntos del docente (`uploads/actividades/adjuntos/`, se comparten por huella entre actividades) ni otros módulos. Reabrir un periodo después no recupera los archivos.
- **Pendiente, a propósito:** vista del acudiente y notificaciones de actividades nuevas/por vencer (M27/M28), M25 como fuente del
  calendario, varios archivos por entrega (cada intento admite uno), archivos temporales o adjuntos huérfanos si el docente abandona el formulario (no hay barrido), rúbricas y ajustes razonables de M16 sobre la actividad (solo se
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
- **Registro de importaciones del Excel (M22)** (`ImportacionNotas`, `notasExcel.service#importarPlantillaNotas`, `GET /notas/planilla/excel/importaciones`, DOCENTE de la clase y
  ADMIN/COORDINADOR): cada archivo subido deja un registro, aplicado o no: usuario, nombre, **huella SHA-256** (el archivo no se conserva), cuándo se descargó, `resultado` (`APLICADA`;
  `RECHAZADA` = validación fallida, no se guardó nada; `INTERRUMPIDA` = pasó la validación y la escritura falló, puede haber quedado a medias), conteos y hasta 100 errores de fila con
  `conflicto: true` cuando lo cambió el sistema después de la descarga. Un archivo que ni se reconoce como planilla de Klassy se guarda sin clase (no sale en el historial de ninguna). Registrar
  nunca cambia la respuesta al docente (si falla, solo se deja en consola). Auditoría: `NOTAS_EXCEL_IMPORTADO` / `NOTAS_EXCEL_RECHAZADO`, sin notas ni nombres en el `detalle`. La respuesta de
  error al docente conserva su forma (`conflicto` solo vive en el registro). En pantalla: `HistorialImportacionesExcel` bajo el Excel de la planilla. Un archivo que no es `.xlsx` lo corta
  multer antes del servicio y no se registra. **Pendiente:** registrar también las descargas, y ver el historial desde el seguimiento de coordinación.
- **Vista previa y Excel de muestra del molde** (administración, pestaña «Vista del docente y Excel» del Creador de planillas): `GET /notas/molde/vista-previa` y
  `/notas/molde/excel?academic_year_id=` (ADMIN/COORDINADOR; `planillaMuestra.service.ts`). Arman una `Planilla` inventada (3 estudiantes, 2 casillas por bloque) con
  el molde y la plantilla de impresión vigentes, reusando `armarFila`/`armarBloques` y el mismo generador de Excel del docente; no tocan la base. El Excel lleva la
  marca `MUESTRA` en vez de una clase y el importador lo rechaza.
- **«Mis notas» es un resumen de tamaño fijo** (`TarjetaNotasAsignatura` con `ultimasNotas={4}`): cada asignatura muestra sus 4 últimas notas calificadas (por fecha de la actividad; las notas sueltas, sin fecha, al final) y el botón «Ver notas completas» abre un `Drawer` con todos los bloques. Sin `ultimasNotas` (portal del acudiente) la tarjeta trae todo, como antes.
- **Catálogos de «Actividades y tareas»** (M11): el del docente muestra **todos sus grupos** (la jornada del filtro es «Todas las jornadas» por defecto; sede y periodo siguen filtrando) con botones amplios que dicen la jornada; el del estudiante lleva el **icono y el borde de cada materia en color pastel** (`colorPastelDeAsignatura`, `lib/asignaturasEstilos.ts`: paleta fija, color según el nombre de la asignatura, aplicado con `style`; excepción pedida por el usuario a «no agregar colores nuevos», porque el módulo de estudiantes no es administrativo; el color nunca es la única señal) —la tarjeta de «Mis notas» usa el mismo color por materia—, sin emojis, y un bloque informativo: avance entregado/total, calificadas, vencidas sin entregar y próxima entrega.
- **El estudiante ve sus notas** (`GET /notas/mias?periodo_numero=&academic_year_id=`, solo ESTUDIANTE, `notasEstudiante.service.ts`, página `MisNotasPage` en
  `/mis-notas`): por asignatura, cada bloque con sus casillas y la nota de cada una; usa `armarFila` (la misma cuenta de la planilla), así que una planilla abierta
  se muestra **provisional** (`parcial`) y una `CERRADO`/`DEFINITIVO` como nota final. Solo devuelve lo propio y de las actividades solo las ya publicadas
  (`fecha_apertura`) o con nota. El boletín (M17) sigue leyendo solo lo cerrado.
- **Quién ve qué:** el titular edita; ADMIN/COORDINADOR consultan (`GET /notas/planilla`, `GET /notas/bloques`), ven el seguimiento (`/notas/seguimiento`) y declaran definitivas;
  otro docente no entra (403). `declararDefinitivas` valida el rol también en el servicio.
- **Evidencias dentro de la planilla:** cada casilla de una actividad con entrega digital lleva un punto (a tiempo / con retraso / ya calificada; sin punto = no entregó) y el
  título de la columna abre la página de la actividad (`ActividadRevisionPage`: descargar la evidencia, leer la respuesta, elegir la entrega válida si hubo varias, poner nota y
  retroalimentación); la misma nota se puede poner en la casilla, y **si la actividad tiene un estudiante con varias entregas sin elegir la válida, la planilla y el Excel no
  guardan esa nota** (409).
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

### M17 (Boletines) — estado: boletín del periodo completo

Backend `/reports/report-card` (+ `/pdf` y `/grupo/pdf`) y `/boletines` (modelos `FraseDesempeno`, `ConfiguracionBoletin`, `ObservacionBoletin`, `PublicacionBoletin`),
frontend `ReportCardPage` (`/report-card`), `ConfiguracionBoletinPage` (`/admin/boletin`, ADMIN edita y COORDINADOR consulta) y `ObservacionesBoletinPage`
(`/docente/boletin-observaciones`). Base legal: `boletines.pdf` (Decreto 1290/2009 y 1075/2015: la norma no impone plantilla gráfica; el SIEE del colegio manda).
Reglas que no se ven leyendo un solo archivo:

- **El boletín solo muestra lo cerrado** (ver M12). `reportCard.service.ts` separa `cargarContextoGrupo` (una sola carga por grupo y periodo: cerrados, asistencia, textos,
  observaciones y ranking) de `armarBoletin` (por estudiante), así el lote de un grupo no repite consultas. El boletín individual y el del grupo son el mismo cálculo.
- **Quién de la familia lo ve lo decide el administrador** (`PublicacionBoletin`, `utils/publicacionBoletin.ts#accesoFamilia`, función pura con tests): se publica por
  **grupo y periodo**, con **excepciones por estudiante** que mandan sobre el grupo (bloquear a uno con el grupo publicado, o dejar ver a uno sin publicar). **Sin publicar,
  la familia no lo ve** (403): solo ESTUDIANTE y ACUDIENTE pasan por `exigirBoletinDisponible`; el personal (ADMIN, COORDINADOR, SECRETARIA, DOCENTE) lo ve siempre. Un
  acudiente hereda el acceso de su estudiante. Aplica también al PDF, porque sale del mismo servicio. Solo el ADMIN publica y deja excepciones; todo queda en auditoría.
  Publicar no exige que el boletín esté completo (puede salir parcial, marcado como tal).
- **Textos que acompañan el desempeño** (`FraseDesempeno`, único por nivel+tipo): una descripción y una recomendación por nivel (Superior/Alto/Básico/Bajo). Se siembran
  8 textos de partida la primera vez (`FRASES_POR_DEFECTO`; Superior y Alto sin recomendación) y desde ahí son del colegio. Se resuelven por el **nivel de la nota cerrada**:
  una asignatura sin cerrar no lleva texto. La **observación del docente** vive aparte (`ObservacionBoletin`, no en `CalificacionAsignatura`): es texto del informe, no del
  cálculo; la escribe solo el docente titular y con las mismas ventanas de notas (`assertPeriodNotLocked`); coordinación solo consulta.
- **Configuración** (`ConfiguracionBoletin`, una por instalación): canal de reclamaciones (texto del SIEE), fecha de entrega por periodo y año, y si se muestra el puesto.
  Los periodos salen del año lectivo (ya no fijos en 4; el validador admite hasta 12). Nada de esto cambia una nota.
- **Cumplimiento de `boletines.pdf` (guía legal, Decreto 1290/1075 y SIEE) — qué cubre cada parte del PDF** (el contenido lo decide el SIEE del colegio; el sistema no impone formato):
  identificación (nombre, documento, **grado**, grupo, año, periodo, institución: `estudiante.grado` en `ReportCardResult`); escala del colegio con su **equivalencia nacional** (sección ESCALA);
  descripción cualitativa y recomendación por nivel (banco `FraseDesempeno`) y observación del docente; inasistencias; **áreas con dificultades y apoyos** (sección DIFICULTADES: arma sola la lista de
  asignaturas con desempeño no aprobatorio y su recomendación, más el texto de apoyo del colegio); **compromisos de seguimiento** (COMPROMISOS: renglones en blanco para escribir con la familia);
  **canal de reclamaciones** (RECLAMACIONES); **periodicidad** (ENTREGA del periodo y CALENDARIO de todos los periodos, `calendario_entregas`); **estado de promoción** (PROMOCION: en el boletín del **último periodo**, si M19 ya cerró al estudiante, sale su resultado —`ReportCardResult.promocion`, con el acta si lo decidió una instancia—; solo se dice lo que la familia debe saber, `TEXTO_PROMOCION_BOLETIN`, y el retiro por confirmar o las notas incompletas no se muestran; si no hay nada que decir, las casillas quedan en blanco para marcarlas a
  mano; la vista en pantalla `ReportCardView` aún no lo muestra); componentes de la valoración (hetero/auto/coevaluación) por asignatura (opción `asignaturas.componentes`).
- **Todo el documento es del colegio** (`ConfiguracionBoletin.plantilla`, pestaña «Diseño del boletín» de `/admin/boletin`, `DisenoBoletin`): título y subtítulo, escudo (propio o el logo de la institución;
  izquierda/centro/derecha/**marca de agua**; tamaño), color, papel carta/A4, **tipo de letra** (Helvetica/Times/Courier) y **tamaño** (pequeño/normal/grande, que escala también las alturas con `u()`),
  **qué secciones salen, su orden y su título** (`SECCIONES_BOLETIN`), qué datos del estudiante y de cada asignatura se muestran, **los 26 textos fijos** (`CLAVES_TEXTOS_BOLETIN` / `TEXTOS_BOLETIN_INICIALES`,
  con marcas `{puesto}`, `{fecha}`, `{periodo}`... que reemplaza `rellenarTexto`), rótulos, hasta 4 firmas (una puede ser la del **director del grupo**, que sale de su asignación de dirección, M08), apoyo,
  renglones de compromisos, opciones de promoción y un pie. `utils/plantillaBoletin.ts#completarPlantilla` (pura, con tests) completa lo que falte con `PLANTILLA_BOLETIN_INICIAL`: una opción nueva no rompe
  una plantilla guardada, una sección nueva se inserta **en su lugar natural** (tras su antecesora del diseño original) y `plantilla: {}` = volver al original. **Un texto, sección u opción nueva se agrega en
  cuatro sitios: `constants/boletin.ts`, el modelo, el validador Joi y `DisenoBoletin.tsx` (más `reportCardPdf.service.ts` si se dibuja).** El PDF obedece la plantilla; la vista en pantalla (`ReportCardView`) no.
- **Vista previa**: `VistaPreviaPdf` muestra el PDF real antes de descargarlo (`GET /reports/report-card/pdf`). En el editor, el **boletín de muestra** (`boletinMuestra.service.ts`,
  `POST /boletines/muestra/pdf`) se dibuja con el **borrador sin guardar** (se actualiza solo al dejar de escribir): estudiante y notas inventados (una por nivel de la escala) con la
  institución, escala, textos, fecha y reclamaciones **reales**, marcado MUESTRA. Funciona aunque la institución aún no exista (`leerConfiguracionBoletin` no exige ni crea nada; guardar sí
  exige la institución, 409). El escudo propio viaja como data URI (≤ 500 KB, PNG/JPG verificado por firma de bytes en `validarEscudo`): por eso `app.ts` sube el límite de `express.json` a
  1 MB **solo para `/api/v1/boletines`** (el defecto de 100 KB lo rechazaría).
- **PDF** (`reportCardPdf.service.ts`, `pdfkit`, `renderizarBoletines` es pura y tiene tests): un boletín por estudiante, cada uno en hoja nueva y continuando si no cabe;
  incluye escala con su equivalencia nacional, fecha de entrega y reclamaciones. El PDF de un grupo lo piden ADMIN, COORDINADOR, SECRETARIA o el director de ese grupo y se audita.
  Se baja siempre con sesión, nunca por URL directa.
- **Pruebas:** `tests/reportCardPdf.test.ts`, `tests/publicacionBoletin.test.ts` y `tests/integracion/boletin.int.test.ts` (base real). `notas.http.int.test.ts` publica el
  boletín antes de leerlo como estudiante.
- **Pendiente, a propósito:** mostrar el estado de promoción también en `ReportCardView` (el PDF ya lo trae); publicar todos los grupos de un periodo de una vez; notificar a
  las familias cuando se publica (M28); firma o QR en el boletín (la norma no los exige); un constructor libre del formato (M21).

### M18 (Recuperaciones) — estado: política y registro de intentos

Backend `/recuperaciones` (modelos `ConfiguracionRecuperaciones`, `Recuperacion`; servicios `configuracionRecuperaciones.service`, `recuperacion.service`; reglas puras `utils/recuperaciones.ts`, tests en `tests/recuperaciones.test.ts`), frontend `RecuperacionesPage` (`/recuperaciones`, ADMIN/COORDINADOR/DOCENTE) y `hooks/useRecuperaciones.ts`. Base: `recu.pdf` (la norma no fija una recuperación única: la define el SIEE de cada colegio). Reglas que no se ven leyendo un solo archivo:

- **Todo es política por año lectivo, nada quemado** (`ConfiguracionRecuperaciones`, una por año; un año nuevo hereda la del más reciente): por **cada periodo** si aplica y si se hace al `FIN_PERIODO` o al `INICIO_SIGUIENTE_PERIODO` (el último periodo no admite «al iniciar el siguiente»: lo valida `validarPolitica`); efecto en la nota (`REEMPLAZA`, `LIMITA_A_APROBATORIA`, `PROMEDIA`, `LA_MAYOR`) e intentos, por separado para periodo y fin de año; recuperación anual (aplica o no, tope de asignaturas perdidas, 0 = sin tope). Lee cualquier usuario con sesión; solo el ADMIN cambia (año no CERRADO).
- **Quién debe recuperar se calcula, no se guarda**: nota `CERRADO/DEFINITIVO` de M12 por debajo de `nota_aprobatoria` de la escala del año. La definitiva anual pondera los periodos por su porcentaje (con la recuperación de periodo ya aplicada) y no existe si falta un periodo cerrado. `Recuperacion` nace al registrar el primer intento y copia la nota original y el efecto aplicado: cambiar la política no reescribe lo ya recuperado.
- **La ventana sale del calendario de M05** (eventos `RECUPERACION_PERIODO`/`RECUPERACION_FINAL`, plazo `fecha_limite_resultados`) y debe coincidir con el momento configurado (`evaluarVentana`); sin evento, 409. Registra solo el docente titular, con el año EN_CURSO.
- **Cómo entra la nota de una recuperación de periodo a M12 (política, `periodo.integracion`)**: `modo` = `NOTA_FINAL` (se trabaja sobre la nota final con el `efecto`), `REEMPLAZA_NOTA_MAS_BAJA` (la recuperación ocupa el lugar de la casilla más baja, de toda la asignatura o de un bloque), `REEMPLAZA_BLOQUE` (pasa a ser la nota de un bloque del molde) o `CASILLA_ADICIONAL` (se suma como una nota más de un bloque, con peso propio o parte igual). Además `solo_si_mejora` (nunca baja la nota), `tope_aprobatoria` y `cuenta_en_boletin` (apagado: la recuperación solo se anota). El cálculo es la función pura `integrarRecuperacion` (`utils/integracionRecuperacion.ts`, reusa `calcularNotaAsignatura` de M12: una sola fórmula), con tests en `tests/integracionRecuperacion.test.ts`. Los bloques elegibles salen del molde del año (M12; `GET /recuperaciones/politica` los devuelve como `bloques_molde`) y la política se rechaza si el bloque no existe en ese año. **La nota cerrada de M12 nunca se modifica**: la `Recuperacion` congela la integración usada, los bloques resultantes (`componentes`) y un `detalle` en palabras.
- **El boletín (M17) lee la recuperación** (`reportCard.service`): si hay una de periodo con resultado y `cuenta_en_boletin`, `nota_asignatura` y `componentes` salen de ella (y con ellos el área, el promedio general y el puesto); en cualquier caso `recuperacion` trae nota original, resultante y detalle, y el PDF y la vista lo anotan. La definitiva anual de M18 usa la misma regla. La recuperación anual no tiene casillas: solo usa `efecto`.
- **Nota efectiva: una sola regla para todos** (`utils/notaEfectiva.ts`: `notaEfectivaDePeriodo`, `resumenDeRecuperacion`, `notaFinalDelAnio`, `etapasNotaEfectiva`). La planilla cerrada (M12) **nunca se modifica**: la recuperación vive en `Recuperacion` y esta regla es la única que las junta (`cuenta_en_boletin` apagado = solo se anota). La usan: `cargarContextoNotas` (M18, M19, sábana M33), el boletín M17, **«Mis notas»** (`misNotas` trae `recuperacion` y `nota_asignatura` ya es la que vale; el portal del acudiente usa el mismo servicio), la **planilla del docente** (`FilaPlanilla.recuperacion` y `nota_efectiva`, solo en `obtenerPlanilla` y solo de una nota cerrada: `armarFila` NO cambia porque el cierre y las definitivas leen la nota congelada), el **tablero de riesgo de M20** y los **dashboards de M30** (agregaciones con `etapasNotaEfectiva()`, un `$lookup` a `recuperacions`). Una asignatura perdida y recuperada deja de contar como perdida en esas estadísticas.
- **Resumen del año** (`GET /notas/mias/anual`, `GET /portal/hijos/:id/notas-anuales`, `misNotasDelAnio`, `ResumenAnualNotas`; opción «Resumen del año» del selector de periodo de «Mis notas» y del portal): por asignatura, la nota de cada periodo (con la recuperación del periodo), la definitiva ponderada (`definitivaAnual`), la **recuperación de fin de año** (original → resultante, estado) y la nota final del año. La definitiva sale `null` mientras falte un periodo por cerrar.
- **En «Mis notas» y el portal** la tarjeta muestra el chip «Recuperada» / «Recuperación no superada» y la franja «nota anterior → recuperación» (`FranjaRecuperacion`): el estudiante y su familia ven las dos notas. **Un efecto «reemplaza» en el modo «sobre la nota final» puede dejar la nota por debajo de la original** (es decisión del colegio; los interruptores «solo si mejora» y «limitar a aprobatoria» solo existen en los otros modos; quien no quiera bajar la nota usa el efecto «La mayor»).
- **Avisos de las recuperaciones** (`recuperacionAvisos.service.ts`; reglas de fechas puras en `utils/avisosRecuperacion.ts`): quién debe recuperar se calcula con `listarCandidatos` (lo mismo que ve el docente) y es «pendiente» quien no superó, puede registrarse y tiene intentos. Docentes **con estudiantes por recuperar**: `RECUPERACION_FECHAS` al crear o cambiar el evento del calendario (`crearEvento`/`actualizarEvento` de M05, carga tardía para evitar un ciclo de módulos), `RECUPERACION_INICIA` el día que abre y `RECUPERACION_TERMINA_MANANA` el día antes del último día (el plazo de resultados manda sobre el fin del evento; solo a quien aún tiene pendientes). Estudiante y acudiente con portal: `RECUPERACION_HABILITADA` el día que abre (con cuántas asignaturas debe recuperar) y `RECUPERACION_REGISTRADA` cada vez que el docente registra un resultado (nota anterior y nueva, si la superó o cuántos intentos le quedan; varios sin leer se agrupan por estudiante y periodo). **ADMIN y COORDINADOR no reciben alertas por recuperación: solo el número** del menú en «Recuperaciones» (el total por recuperar). Los números (`establecerInsignia`, que fija el total en vez de sumar) se colocan al fijar las fechas y el día que abre, y se apagan al entrar; el del docente cuenta sus estudiantes. En la recuperación de fin de año, si al configurar la fecha aún no hay quién recupere (faltan periodos), el aviso sale el día que abre. El recordatorio genérico del calendario ya no repite las recuperaciones (solo el desarrollo institucional). Pruebas: `tests/notaEfectiva.test.ts`, `tests/avisosRecuperacion.test.ts`, `tests/notificaciones.test.ts`, `integracion/notaEfectiva.int.test.ts`, `integracion/recuperacionAvisos.int.test.ts`.
- **Pendiente, a propósito**: la recuperación como «actividad» (asignar estrategia, adjuntos, fecha y entrega del estudiante; vista «Recuperación» dentro de la asignatura; análisis en `doc/Analisis_M18_Recuperaciones_v2_Klassy.md`); el aviso al estudiante/acudiente de que «mañana termina»; avisar la anulación o eliminación de una ventana; los números de ADMIN/COORDINADOR y docentes no se descuentan al registrar cada resultado (se recalculan al fijar fechas y al abrir la ventana).

### M19 (Promoción y cierre del año) — estado: completo (backend y pantallas)

Backend `/promocion` (modelos `PoliticaPromocion`, `EvaluacionPromocionEstudiante`; servicios `politicaPromocion.service`, `promocionContexto.service`, `evaluacionPromocion.service`; motor puro `utils/promocion.ts`, constantes `constants/promocion.ts`). Pantallas: ver «Pantallas de M19/M20» al final de esta sección. Reglas que no se ven leyendo un solo archivo:

- **Nada de las reglas está en el código: es el SIEE del colegio como datos.** `PoliticaPromocion` (una por año, hereda la del más reciente; valor de partida conservador: todo lo perdido va a recuperación y, tras ella, no se promueve) tiene unidad (asignatura o área con los pesos de M06), asignaturas/áreas **críticas** y **arrastrables**, `reglas[]`, qué hacer sin regla (`sin_regla.cierre|tras_recuperacion`), `arrastre` y `piar.derivar_a_comision`. Una regla = condiciones (todas se cumplen) + acción + momentos (`CIERRE` | `TRAS_RECUPERACION`) + alcance por nivel o grado. Una condición nueva es un tipo en `constants/promocion.ts` y su caso en `cumpleCondicion`, nunca otra colección. Precedencia entre acciones: `PROPONE_RETIRO` > `NO_PROMUEVE` > `ENVIA_A_COMISION` > `PENDIENTE_RECUPERACION`; `NO_RENUEVA_CUPO` no toca el resultado académico.
- **La política se configura por tarjetas, no armando reglas** (`PoliticaPromocionPanel`: Evaluación e inasistencia / Umbrales / Excepciones, más un bloque «Avanzado» colapsado con reglas propias, arrastre, titulación y SIEE; botón «Cargar plantilla estándar Decreto 1290», `lib/plantillaDecreto1290.ts`, que solo rellena el formulario). `unidad` admite `AMBAS` (asignaturas y áreas a la vez). Los campos `inasistencia` y `umbrales` se guardan declarados y el motor **deriva** sus reglas (`reglasEfectivas`, pura; claves reservadas `auto-*`, no viven en `reglas[]`): `umbrales.recuperacion_hasta` = N → quien pierde N+1 asignaturas (o áreas si la unidad es AREA) no se promueve; con `AMBAS`, `reprueba_desde_areas` es un umbral aparte. El tope de recuperación y el arrastre se miden en asignaturas (`unidadesDeTope`). Una política anterior (`recuperacion_hasta` null, inasistencia apagada) se evalúa igual que antes.
- **Pantalla en lenguaje de colegio** (`PoliticaPromocionPanel`; pestañas «Reglas de promoción» / «Grado y título» / «Texto oficial del SIEE»; panel derecho con `ResumenSIEE` —frases generadas por `lib/resumenPolitica.ts`— y `SimuladorCaso` «Pruébalo»; pie fijo «Guardar y revisar cambios» que abre `ConfirmarCambiosPolitica` con `lib/cambiosPolitica.ts`; «Empezar con el modelo del Decreto 1290» abre `PanelModeloDecreto1290` mostrando qué cambiaría; las reglas propias viven en `PanelReglasEspeciales`, un drawer). Las tarjetas muestran **un solo número** que decide (`umbrales.recuperacion_hasta`) y `EscaleraResultados` deduce los tres escalones. `imprescindibles.efecto` (`NO_PROMUEVE` por defecto, `RECUPERA`, `COMISION`; `null` = política anterior, no deriva nada) genera las reglas `auto-imprescindible-*` (las «críticas» solo tenían efecto con una regla propia). El simulador es `POST /promocion/politica/:academic_year_id/simular-caso` (ADMIN/COORDINADOR, no escribe): arma un estudiante hipotético (`utils/simulacionPromocion.ts`) y corre el motor real con la política en borrador; si el borrador aún no define el tope de recuperación usa el de M18. La «acción por defecto sin regla» ya no se muestra (queda fija: recuperación al cierre, no promoción tras ella). `OpcionesTarjeta` (`components/ui/`) es la selección entre pocas opciones con ejemplo.
- **Sincronización con M18**: al guardar la política (`actualizarPolitica`), en la **misma transacción** se escribe `anual.aplica` (`recuperacion_hasta > 0`), `anual.max_asignaturas_pendientes` y `anual.efecto` de la `ConfiguracionRecuperaciones` del año (`sincronizarAnualDesdePromocion`). Con `recuperacion_hasta` definido, `PUT /recuperaciones/politica` responde 409 si intenta cambiar esos tres campos (los demás de M18, p. ej. `anual.max_intentos`, siguen editables) y la pantalla de Recuperaciones los muestra de solo lectura. La auditoría de M18 se registra después de confirmar la transacción. Pruebas: `promocion.test.ts` y `integracion/promocionSincronizacion.int.test.ts` (esta última no se pudo correr sin binario de MongoDB).
- **Preescolar no reprueba** (Decreto 2247 de 1997; **validar la numeración con la norma vigente**). `NIVELES_SIN_REPROBACION` (`constants/promocion.ts`, por **nivel del catálogo**, nunca por número de grado): `evaluarPromocion` devuelve `PROMOVIDO` sin mirar notas, reglas, inasistencia ni PIAR (nunca `INCOMPLETO` por falta de notas ni `NO_PROMOVIDO` con cualquier política) y solo conserva `NO_RENUEVA_CUPO`, que es de permanencia. M18 no lista candidatos ni registra recuperaciones de esos grupos (`nivelesSinReprobacion.service`) y el tablero de riesgo de M20 no los incluye. En lugar de notas, **valoración descriptiva** (`ValoracionDescriptiva`, `/valoraciones-descriptivas`, `PlanillaDescriptiva` dentro de la página de notas del docente cuando la clase es de Preescolar): por asignatura/dimensión y periodo, un nivel (`INICIADO`/`EN_PROCESO`/`ALCANZADO`) y **fortalezas y recomendaciones obligatorias** (mínimo 10 caracteres); la registra solo el docente de la clase mientras `assertPeriodNotLocked` lo permita (todo o nada). Las dimensiones **no están en el código**: son áreas del catálogo (M06). El informe de un estudiante es un PDF aparte (`informeDescriptivoPdf.service`, `GET /valoraciones-descriptivas/informe/pdf`, botón «Informe descriptivo (Preescolar)» en el historial de la ficha); **el boletín numérico (M17) no se tocó** y **la familia aún no ve este informe** (falta su publicación por grupo y periodo, como `PublicacionBoletin`).
- **Las faltas de convivencia nunca reprueban** (Corte Constitucional T-341/93, T-967/07): una regla con `FALTAS_CONVIVENCIA_AL_MENOS` solo admite `ENVIA_A_COMISION` o `NO_RENUEVA_CUPO` (lo rechaza `validarPolitica`). La deserción no formalizada solo **propone** el retiro; una persona lo confirma en M04.
- **Resultado académico ≠ titulación.** `RESULTADOS_PROMOCION` es solo lo académico del año; graduado / aprobó-no-graduado serán un registro aparte (fase 4) para no reescribir un año cerrado. `INCOMPLETO` = faltan notas anuales y ninguna regla decide: no se cierra el grupo.
- **M19 solo lee, no duplica**: notas `CERRADO/DEFINITIVO` con la recuperación de periodo ya aplicada y la recuperación final (`Recuperacion` ANUAL) y su tope (`anual.max_asignaturas_pendientes`) son de M18 (`cargarContextoNotas`/`definitivaAnual` se exportan de `recuperacion.service`); asistencia de M13 (`calcularEstadisticas`); faltas de M14/M15; de M16 solo si existe un PIAR `ACTIVO` (nunca modalidad ni categoría).
- **Cierre**: `GET /promocion/simulacion` (sin guardar; ADMIN/COORDINADOR) → `POST /promocion/cierre` (solo ADMIN, con su contraseña, año EN_CURSO, **todo o nada** por grupo; idempotente: quien ya tiene cierre en ese momento se omite). `TRAS_RECUPERACION` solo reevalúa a quien quedó `PENDIENTE_RECUPERACION` y crea una **versión nueva**. `POST /promocion/reevaluar` corrige a UN estudiante (reclamación aprobada) con motivo, también como versión nueva.
- **`EvaluacionPromocionEstudiante` es inmutable** (hook: solo cambia `vigente`): guarda resultado, explicación, la entrada y la política con que se calculó, versión y una **huella HMAC-SHA256** (`CERT_HMAC_SECRET`, la misma clave de M26; 503 si falta) que `GET /promocion/evaluaciones/:id/integridad` recalcula. Una sola versión vigente por estudiante y año (índice único parcial). El esquema usa `minimize: false`: un objeto vacío guardado sin ese ajuste cambia la huella.
- **M26 lee este cierre**: `obtenerPromocion` (`certificadoEstudios.service`) devuelve el concepto (`conceptoOficial`, pura) solo con un resultado final (promovido, por recuperación, con arrastre, no promovido); pendiente, en comisión, retiro propuesto o sin cierre → `null` y el certificado de estudio sigue en vista previa. La tabla de valoraciones toma las notas finales del cierre (incluida la recuperación) en lugar de recalcular.
- **Titulación de bachiller** (`/titulacion`, `titulacion.service`, `utils/titulacion.ts`; modelos `Titulacion`, `RegistroServicioSocial`, `RegistroSaber11`, `CertificadoGradoExterno`). **La titulación de bachiller es solo del grado 11** (`GRADO_TITULACION`, `constants/titulacion.ts`: no es configurable; `PoliticaTitulacion.grado_titulacion` se conserva en los datos y se ignora, el validador acepta cualquier valor y lo fija en 11; Transición, 5° y 9° no pasan por aquí, se certifican desde M26 con `CULMINACION`). Lo que se exige es la política (`PoliticaPromocion.titulacion`: horas de servicio social, Saber 11 y paz y salvo; cada uno se apaga o endurece). Los requisitos **bloquean solo en 11°**; antes de él el servicio social solo **avisa** (`alerta_desde_grado`, 10° por defecto). **La carpeta académica ya no es un requisito ni tiene pantalla**: los certificados de los grados anteriores se piden y se aprueban en el checklist de la matrícula (M04), y duplicarlos aquí bloqueaba a quien cursó antes de Klassy. El panel de requisitos solo **informa** los documentos obligatorios de la matrícula que faltan (`documentos_matricula_pendientes`, no bloquea). El campo de la política, el modelo y los registros `CertificadoGradoExterno` ya guardados quedan como están, sin usarse; se retiró `POST /titulacion/carpeta`. **En 10° el panel solo muestra el servicio social** (Saber 11 y el resto son de 11°: registrar Saber 11 a quien no tiene matrícula en 11° responde 409). En pantalla `APROBO_NO_GRADUADO` se llama «Pendiente de grado». Estados (`ESTADOS_TITULACION`): `APROBO_NO_GRADUADO` (aprobó, le falta algo, con `pendientes[]` y su frase: «Debe 40 horas de servicio social»), `GRADUADO`, `GRADUADO_EXTEMPORANEO` (estaba pendiente y cumplió después; no retrocede). `Titulacion` es un registro aparte del cierre del año (que es inmutable) y lleva `historial[]`. Se evalúa al cerrar el grupo y se **reevalúa sola** al registrar servicio social, Saber 11 o un certificado externo (M26), y al confirmar el paz y salvo de M04 (una línea en `revisarPazYSalvo`). Fuentes: horas = registros `VIGENTE` **con soporte verificado** (ver abajo; una tanda mal registrada se anula con motivo, no se borra); Saber 11 = solo el número de registro (`AC` y de 8 a 12 dígitos —`AC23245678` o `AC202612345678`—, `PATRON_REGISTRO_SABER_11`; se normaliza a mayúsculas sin espacios ni guiones) y la fecha, nunca puntajes; paz y salvo = el `PazYSalvo` CONFIRMADO de M04 del año. Secretaría y ADMIN registran (Secretaría acotada a sus sedes); COORDINADOR consulta.
- **Servicio social con soporte** (`RegistroServicioSocial`, `/titulacion/servicio-social`, `ServicioSocialPanel` en el drawer de requisitos): se presta en 10° y 11° (el estudiante debe tener o haber tenido matrícula en uno; también quien llega por traslado a 11° con horas de otro colegio). Cada tanda **exige el certificado de la entidad** (multipart, PDF/JPG/PNG/WEBP por firma de bytes, 5 MB, en `uploads/servicio-social/<estudiante>/`, nunca bajo `public/`; se baja con sesión por `GET /titulacion/servicio-social/:id/soporte` y cada descarga se audita) y nace `PENDIENTE`: **solo suman las horas `VERIFICADO` o `HEREDADO`**. Verifica o rechaza (con motivo) ADMIN, SECRETARIA o COORDINADOR; registra y anula ADMIN y SECRETARIA; verificar reevalúa la titulación. `HEREDADO` es el valor de las tandas guardadas antes de que existiera el soporte (el campo no está en el documento, por eso la consulta usa `$or` con `$exists:false`): siguen contando para no devolver a nadie a «pendiente de grado» y Secretaría puede adjuntarles el soporte después. `GET /titulacion/estudiantes/:id/requisitos` trae `horas_por_verificar`.
- **Documentos de titulación en M26** (fuente `TITULACION`, ver M26): `ACTA_GRADO` (`ACG`), `DIPLOMA_BACHILLER` (`DIP`) y `CONSTANCIA_CULMINACION` (`CCU`) son **tipos como cualquier otro** (datos, nacen en borrador; `npm run sembrar:tipos-titulacion` los crea, idempotente). El **candado** es `TipoCertificado.estados_titulacion`: acta y diploma solo con `GRADUADO`/`GRADUADO_EXTEMPORANEO`, la constancia solo con `APROBO_NO_GRADUADO` (409 con las razones: «Debe 40 horas…»); cambiarlo es del ADMIN. El **acta** (`actaGrado.service`) se asienta una sola vez por titulación, al expedir el primer documento: número anual `AG-AAAA-0001` (`Counter` `ACTA-GRADO-<año>`), **libro y folio** con `ConfiguracionCertificados.folios_por_libro_actas` (100 por defecto, solo ADMIN): el folio avanza en el libro vigente y al llenarlo abre el siguiente; un graduado extemporáneo toma el siguiente folio del libro vigente **cuando cumple**, no uno de su año. Acta y diploma comparten esos números. Toda la expedición corre en una transacción: si algo falla después del candado (p. ej. una firma no permitida) no se consume ni el consecutivo ni el acta. Nunca de autoservicio. Variables nuevas `{{titulacion.*}}` (título, acta, libro, folio, fecha, estado, pendientes).
- **Título de bachiller (M01)**: `Institution.titulo_bachiller_defecto` («Bachiller Académico» de partida; se edita en `PATCH /institution/ajustes`) y `Group.titulo_bachiller` (`PATCH /groups/:groupId/titulo`; `null` = hereda el de la institución, para colegios técnicos o con articulación donde 11-A es académico y 11-B técnico). `Titulacion.titulo` guarda el resuelto al evaluar. Aún sin pantalla.
- **Pruebas**: `tests/promocion.test.ts` (motor, validación, concepto), `tests/titulacion.test.ts` y `tests/integracion/titulacion.int.test.ts` y `tests/integracion/promocion.int.test.ts` (cierre, versiones, huella, M26). Este entorno no tenía `sanitize-html` instalado: para correrlas sin tocar `node_modules` se usó una configuración temporal de vitest con un alias a un reemplazo.
- **Promoción anticipada y reiniciantes** (`/promocion-anticipada`, `promocionAnticipada.service`, `configuracionPromocionAnticipada.service`, `resolucionAnticipadaPdf.service`; modelos `PromocionAnticipada` y `ConfiguracionPromocionAnticipada`; reglas puras `utils/promocionAnticipada.ts`, tests en `tests/promocionAnticipada.test.ts`). Decreto 1290 art. 7. **Dos tipos**: `RENDIMIENTO_EXCEPCIONAL` y `REINICIANTE` (ingresó como `REPITENTE` o el año anterior quedó `NO_PROMOVIDO` en ese mismo grado en M19). Todo es del colegio (`ConfiguracionPromocionAnticipada`, una por instalación, solo la cambia el ADMIN): si está activa, el periodo cuyas notas **cerradas** se evalúan (1 de partida) y cuántos días después de cerrarlo aún se puede solicitar (30), el criterio de notas de cada tipo (promedio mínimo y, opcional, nota mínima por asignatura; 4.6/4.0 y 4.0 de partida), **qué pasos se exigen** (concepto de la comisión, consentimiento de la familia, aprobación del Consejo Directivo: cada uno se apaga) y el trato de las notas. Sin todas las notas cerradas no se decide (nunca se promedia lo que falta) y si no cumple el criterio el 409 dice por qué. Un trámite **copia las reglas** con que se abrió.
  - **Flujo**: `SOLICITADA` → `LISTA_PARA_RESOLUCION` (cuando están cumplidos los pasos exigidos) → `RESUELTA` (resolución rectoral) → `APLICADA`; `RECHAZADA`/`ANULADA` cierran sin tocar la matrícula. Uno vivo (o aplicado) por estudiante y año (índice único parcial). Solicitar y gestionar: ADMIN/COORDINADOR; **emitir la resolución y aplicar: solo ADMIN** (el primero con su contraseña). No procede si el estudiante ya tiene cierre de M19 en el año.
  - **Recomienda la comisión, decide el Consejo Directivo, en las sesiones de M20**: un caso de tipo `PROMOCION_ANTICIPADA` (con `anticipada_id`) cuyas decisiones son `RECOMENDAR/NO_RECOMENDAR_ANTICIPADA` (comisión) o `APROBAR/NO_APROBAR_ANTICIPADA` (Consejo Directivo; el Académico no interviene). El Consejo solo ve el trámite si la comisión ya lo recomendó (cuando el colegio exige ese concepto). Al **firmarse el acta** y con mayoría y quórum, la decisión pasa al trámite con la referencia del acta (misma transacción de la firma); un «no» cierra el trámite como `RECHAZADA`. La recusación automática de M20 aplica igual.
  - **Consentimiento**: lo registra un acudiente **vinculado** al estudiante (M03) o el propio estudiante si es mayor de edad; si la familia no autoriza el trámite se rechaza. Se guarda medio, quién, documento y fecha.
  - **Resolución rectoral**: consecutivo anual sin huecos `RPA-AAAA-001` (`Counter` dentro de la transacción) y huella SHA-256 (`hashDeActa`) de todo lo que la respalda; `GET …/integridad` la recalcula y `GET …/resolucion/pdf` la dibuja. El PDF solo existe con la resolución emitida.
  - **Aplicar = `cambiarGrupo` de M04** (conserva folio, checklist e historial; **nunca crea otra matrícula**) a un grupo del **grado inmediatamente siguiente, de la misma sede y año**, con asignaturas con docente. Es idempotente ante un reintento (no vuelve a mover si ya está en el grupo destino).
  - **Notas de los periodos no cursados** (`tratamiento_notas`, valor de partida `NIVELACION`, la opción conservadora). `NIVELACION`: cada asignatura del grado nuevo exige una nota de nivelación (la registra el docente que la dicta en el grupo nuevo, coordinación o el rector, dentro de la escala del año). `COPIAR_EQUIVALENTES`: se copia la nota de la **misma asignatura** (mismo `subject_id`) del grado de origen (promedio de los periodos 1..k si k>1); **la asignatura sin equivalente —o sin nota cerrada— exige nivelación solo para ella**. `DEJAR_SIN_NOTA`: el periodo sale del promedio anual **y su porcentaje se reparte entre los restantes en proporción a su peso** (`periodosParaPromediar`: `notaAnual` ya normaliza por lo que queda), así no queda un hueco que bloquee el cierre. Lo resuelto vive en `PromocionAnticipada.aplicacion.notas`.
  - **Dónde se lee** (cambio aditivo en el lector común de M18, `recuperacion.service#cargarContextoNotas`): para los trámites `APLICADA` del año, lo resuelto ocupa los periodos 1..`periodo_evaluacion` de las clases del grupo nuevo (`aplicarPromocionAnticipada`); **una nota realmente cerrada en el grupo nuevo siempre manda**. Así M18 y M19 ven la nota anual correcta sin tocar M12. Una nivelación pendiente deja la nota anual en `null` y **bloquea solo el cierre de ese estudiante**: `cerrarGrupo` (M19) lo aparta (`bloqueados` en el resumen, con las asignaturas que faltan) y cierra a los demás; el siguiente cierre del grupo lo incluye cuando se registra su nivelación. **Novedad automática**: al aplicar, la matrícula (`Enrollment.novedades[]`, aditivo en M04) recibe «Promovido anticipadamente de X a Y según Resolución No. Z.» con la resolución como referencia (idempotente), y **la misma novedad queda en el Observador** (M14, `novedadInstitucional.service`): una observación `de_sistema` de un tipo «Novedad institucional» (`TipoObservacion.sistema`, se crea sola la primera vez; no se edita, desactiva ni elimina, no se ofrece al registrar a mano y no se puede usar en `registrarObservacion`), visible para el estudiante y su familia, no confidencial, y que **no se enmienda ni se anula** (`Observacion.de_sistema`, guardia en `cargarParaCorregir`). Es idempotente por texto. M12 y el boletín (M17) **no** muestran estas notas: el boletín del periodo 1 del estudiante en el grupo nuevo sale `SIN_CERRAR`.
  - **Pruebas**: `tests/integracion/promocionAnticipada.int.test.ts` (flujo completo con dos sesiones firmadas, los tres tratamientos, ventana, reiniciante, permisos, anulación).
- **Pendiente, a propósito**: solo se salta **un** grado (`numero + 1`); el trámite no mueve las notas ya registradas del periodo en el grupo de origen; en M26 el diseño gráfico del diploma (hoy usa el PDF genérico de plantilla) y un libro de actas imprimible; el paz y salvo de dependencias de M26 sigue sin persistirse por estudiante; traslados con notas homologadas y retirados en el acta; arrastre con seguimiento en el año siguiente; avisos a las familias de la pre-matrícula (M28).
- **Rollover / rematrícula de fin de año por sede, grado o grupo** (`GET|POST /promocion/rollover`, `rolloverPromocion.service`; reglas puras `utils/rollover.ts` y `utils/rematricula.ts`, tests `tests/rollover.test.ts`, `tests/rematricula.test.ts` y `tests/integracion/rollover.int.test.ts`; pantalla `RematriculaPage` en `/secretaria/rematricula` y la pestaña «Año siguiente» de `/admin/promocion`, ambas con `RematriculaGrupoPanel`). **Reserva cupo con PRE-matrículas (`PREINSCRITO`, sin folio), nunca matrículas automáticas**: la secretaría las formaliza con el flujo de M04, donde el paz y salvo del año que termina es el candado de la definitiva y nace el libro y el folio. Solo LEE el cierre vigente de M19 (resultado, promedio, faltas y PIAR del año ya congelados ahí: no consulta convivencia ni inclusión, y esos datos **nunca viajan** en la respuesta). Simulan ADMIN, COORDINADOR y SECRETARIA (esta solo de sus sedes; una sede ajena es 403); **reservan ADMIN y SECRETARIA** con su propia contraseña. El año de destino debe ser posterior al de origen y no estar `CERRADO`.
  - **Alcance por etapas:** `sede_id`, `grade_id` y `group_id` (de origen) son opcionales; sin `group_id` se procesa todo el grado/sede. La pantalla pide **Simular** (no escribe) y solo entonces **Confirmar**; cambiar un selector descarta lo simulado. Un grupo que sigue en recuperaciones no frena a los demás. Procesar un solo grupo compara la prioridad solo entre sus estudiantes: la simulación avisa y sugiere procesar todo el grado.
  - **A dónde va cada uno** (`destinoDeRollover`): promovido (de cualquier forma) → grado siguiente como `ANTIGUO`; `NO_PROMOVIDO` → mismo grado como `REPITENTE`; **graduado** (titulación `GRADUADO`/`GRADUADO_EXTEMPORANEO`) → `EGRESADO`, fuera del proceso (se deriva; no se escribe `StudentProfile.estado`); promovido en el último grado sin graduarse → `TERMINA_CICLO`; si una regla dispuso **no renovar el cupo** → no se pre-matricula; **`PENDIENTE_RECUPERACION`** («En espera de resolución en M18»), comisión, retiro por confirmar, notas incompletas o sin cierre → `SIN_DECISION`, no se proyecta. Los retirados o anulados del año se cuentan aparte; quien tiene el expediente RETIRADO/INACTIVO exige el reingreso guiado de M04 y se omite.
  - **Cupos, prioridad y lista de espera** (`ConfiguracionRematricula`, una por instalación, `GET|PUT /promocion/rematricula/configuracion`, solo el ADMIN cambia; **M32 aún no existe**, por eso vive aquí): `criterios_desempate` es la lista ordenada de `PROMEDIO_GENERAL` (mayor primero), `ANTIGUEDAD` (más años de matrícula) y `SIN_FALTAS_GRAVES` (sin faltas II/III), cada uno activable. Cuando los aspirantes de una sede y un grado superan los cupos libres no se bloquea el proceso: se ordenan con esos criterios (`ordenarPorPrioridad`; lo que empata cae a apellido, nombre y documento) y quien no alcanza queda en `ListaEsperaRematricula`. **No es un estado de `Enrollment`** (M04 no se tocó): es una cola propia (`EN_ESPERA` → `ASIGNADA` | `DESCARTADA`, una vigente por estudiante y año destino) de la que **coordinación o el ADMIN asignan a mano** (`POST /promocion/rematricula/lista-espera/:id/asignar`, crea la misma pre-matrícula y aparta el cupo con la actualización condicionada) o descartan con motivo (`.../descartar`); secretaría la ve de sus sedes. Repetir la simulación recalcula la cola y quien obtiene cupo pasa a `ASIGNADA`. Un grado sin ningún grupo en la sede del año siguiente es `SIN_CUPO` (no hay a dónde esperar).
  - **Balance entre paralelos** (`repartirConBalanceo`, determinista): no se mueve a ciegas el 9-A al 10-A; cada admitido, en orden de prioridad, toma los grupos de su jornada con lugar (y solo si no hay, los demás), descarta los que quedarían más llenos que el menos lleno por más de `tolerancia_ocupacion_pct` (10 de partida) y entre los parejos prefiere el que tiene menos repitentes (si repite), menos estudiantes con PIAR (si lo tiene) y menos compañeros de su misma edad (a la fecha de inicio del año destino). Cuenta lo que cada grupo ya tenía de etapas anteriores, así procesar por grupos no concentra repitentes ni PIAR.
  - **Transacción:** confirmar escribe pre-matrículas, cupos (`$inc` condicionado a que el grupo no se haya llenado) y lista de espera en **una sola transacción, todo o nada** (si algo falla —p. ej. un grupo se llenó— no queda nada y hay que volver a simular; el 409 dice a quién). Es idempotente: quien ya tiene matrícula viva se omite. Auditoría: `PROMOCION_ROLLOVER_EJECUTADO` (resumen), `MATRICULA_PREINSCRITA_POR_PROMOCION` (una por estudiante, tras confirmar), `REMATRICULA_CONFIGURACION_ACTUALIZADA`, `REMATRICULA_ESPERA_ASIGNADA|DESCARTADA`.
  - **Paz y salvo**: la pre-matrícula lleva el checklist normal de ANTIGUO/REPITENTE; el documento `PAZ_Y_SALVO_ANIO_ANTERIOR` nace `APROBADO` si el paz y salvo del año que termina ya está `CONFIRMADO` y `PENDIENTE` si no. Plazo para legalizar: `DIAS_PLAZO_LEGALIZACION` desde el inicio del año nuevo (o desde hoy si ya empezó).
  - **Pendiente, a propósito:** el desempate solo compara a quienes se procesan juntos (no a quienes ya tenían pre-matrícula de una etapa anterior); la lista de espera no avisa a las familias (M28); no hay un reporte imprimible de la lista.
- **M05 ↔ M19 (cierre del año)**: `verificarCierre`/`cerrarAnio` suman la verificación `promocion_resuelta` (ver M05). **M17**: el boletín del último periodo trae la decisión de promoción (ver M17).
- **Pantallas de M19/M20 (fase 8; compilan con `tsc`, **no se probaron en un navegador**)** — todas sobre los componentes de `components/ui/` y TanStack Query, sin tokens ni variantes nuevas:
  - `/admin/promocion` (`PromocionPage`, ADMIN/COORDINADOR; hook `usePromocion`; `components/promocion/`): pestañas **Cierre por grupo** (simula con `GET /promocion/simulacion` y cierra con la contraseña del ADMIN; muestra los `bloqueados` por nivelación), **Año siguiente** (`RolloverPanel`: simulación y «Reservar cupos») y **Política del colegio** (`PoliticaPromocionPanel`: unidad, críticas/arrastrables, constructor de reglas con condiciones por tipo, sin regla, arrastre, titulación y texto del SIEE; solo el ADMIN edita y no en un año cerrado; una regla con faltas de convivencia solo ofrece las acciones permitidas).
  - `/admin/promocion-anticipada` (`PromocionAnticipadaPage`, hook `usePromocionAnticipada`): trámites y **Criterios del colegio**; el drawer del trámite (`TramiteAnticipadaDrawer`) muestra los pasos y ofrece, según estado y rol, consentimiento, resolución (con PDF), aplicar, nivelaciones y anular. El concepto de la comisión y la decisión del Consejo **no se registran ahí**: salen de las actas firmadas.
  - `/comision` (`ComisionPage`, hook `useComision`) y `/comision/sesiones/:id` (`SesionComisionPage`): tablero de riesgo con ficha técnica, sesiones y actas, configuración. Abierta a ADMIN, COORDINADOR, COORDINADOR_CONVIVENCIA, ORIENTADOR, DOCENTE y ACUDIENTE: quien no gestiona solo ve la pestaña de sesiones (el servidor filtra por integrante) y firma las suyas. `GET /comision/sesiones/:id` devuelve además `estudiantes` (nombres por id) para dibujar casos y compromisos. Un integrante **externo** (sin usuario) firma en papel; un ESTUDIANTE o un acudiente sin menú no llega a la pantalla.
  - `/secretaria/titulacion` (`TitulacionPage`, hook `useTitulacion`, ADMIN/COORDINADOR/SECRETARIA): graduandos del año y drawer de requisitos con registro de servicio social, Saber 11 y certificados externos (registran ADMIN y SECRETARIA).
  - **M01**: bloque «Título de bachiller» en Configuración institucional (`AjustesInstitucion`) y botón de título por grupo en `GroupsPage` (solo grupos de grado 11, `TituloGrupoDrawer`). La decisión de promoción también sale en `ReportCardView`.
  - Los selectores de estudiante usan primero el grupo y luego la persona (`SelectorEstudianteDeGrupo`), nunca un select de todos los estudiantes.

### M20 (Comisión de Evaluación y Promoción) — estado: completo (backend y pantallas)

Backend `/comision` (modelos `ConfiguracionComision`, `SesionComision`; servicios `configuracionComision`, `riesgoAcademico`, `fichaComision`, `sesionComision`, `actaSesionPdf`; funciones puras `utils/comision.ts`, constantes `constants/comision.ts`). Pantallas: `ComisionPage` y `SesionComisionPage` (ver «Pantallas de M19/M20», en M19). Reglas que no se ven leyendo un solo archivo:

- **Todo umbral es del colegio** (`ConfiguracionComision`, una por instalación, solo la cambia el ADMIN; valores de partida en `CONFIGURACION_INICIAL`): semáforo por asignaturas perdidas (amarillo 1 / naranja 2 / rojo 3), inasistencia que manda a rojo (20 %, con `faltas` SOLO_INJUSTIFICADAS o TODAS), reprobación masiva (más del 25 % del grupo, **con un mínimo de 8 evaluados** para no alertar por ruido en grupos pequeños), quórum (51 %), mayoría (SIMPLE o ABSOLUTA) y quién firma (TODOS_LOS_ASISTENTES o SOLO_PRESIDENTE).
- **Tablero** (`GET /comision/tablero?academic_year_id=&periodo_numero=`, solo ADMIN/COORDINADOR, auditado): lee las planillas del periodo (lo cerrado es definitivo; lo abierto es **proyección** y lo dice con `hay_notas_provisionales`) y la asistencia acumulada. Devuelve semáforo por estudiante, **solo si tiene un PIAR vigente** (nunca su categoría ni modalidad, M16) y las alertas de reprobación masiva **por asignatura-grupo y por docente**. No decide nada: la promoción es de M19.
- **Una sesión, tres instancias** (`SesionComision.instancia`: comisión, Consejo Académico, Consejo Directivo; este último solo lo gestiona el ADMIN). Estados: `BORRADOR` → `CONVOCADA` (exige integrantes y orden del día) → `REALIZADA` (exige **quórum**, desarrollo escrito y que alguien con usuario pueda firmar) → `FIRMADA`; `ANULADA` solo por el ADMIN y no una firmada. Integrantes: usuarios del sistema o **externos** (personero, padres) que firman en papel. Los integrantes y la asistencia se registran en la propia sesión (no hay catálogo aparte).
- **Casos**: `SEGUIMIENTO` (alerta temprana; se resuelve con compromisos) o `PROMOCION` (cierre anual; exige que el estudiante ya tenga cierre de M19 y guarda cuál). **Recusación automática**: el acudiente que integra la sesión y el propio estudiante quedan apartados de su caso (no cuentan para el quórum del caso ni pueden votar); a mano solo se pueden **sumar** apartados. Cada integrante vota una vez por caso (`A_FAVOR`/`EN_CONTRA`/`ABSTENCION`).
- **Al realizar** se calcula por caso el quórum sin los recusados y la votación (`contarVotos`): una decisión **sin quórum o sin mayoría queda registrada pero no se aplica**.
- **Firma**: cada asistente con usuario confirma con **su contraseña** (no es firma electrónica certificada, Ley 527/1999). Cuando firma el último requerido el acta queda `FIRMADA` con consecutivo anual (`ACE-2026-001`, `ACA-…`, `ACD-…`, `Counter` dentro de la misma transacción) y **huella SHA-256** (`hashDeActa`, `GET …/integridad`); un hook del modelo la hace inmutable salvo el **seguimiento de los compromisos** (estado y seguimientos, que no entran a la huella). El PDF (`pdfkit`) marca el borrador como tal e **imprime en cada caso de promoción la causal del SIEE**: el resultado del cierre, las frases del motor (`detalle.motivos`), las reglas aplicadas y lo perdido (`causalDeCierre`, `utils/comision.ts`), leídos del cierre inmutable al que apunta `evaluacion_id` (nada se recalcula: un acta firmada no cambia con el tiempo; los casos de seguimiento y de promoción anticipada no tienen causal).
- **Las decisiones aprobadas pasan a M19** en la misma transacción de la firma (`aplicarDecisionDeInstancia`): una **versión nueva** del cierre del estudiante con `detalle.decision_instancia` (acta, instancia, resultado anterior). Después se reevalúa su titulación. **`POST /promocion/reevaluar` se niega** sobre un cierre que decidió una instancia (409): cambiarlo exige otra sesión.
- **Compromisos** (responsable acudiente/estudiante/docente/institución, fecha límite no anterior a la sesión): coordinación los marca cumplidos o incumplidos y quien responde puede agregar seguimiento, también después de firmada el acta. Los avisos de vencimiento son de M28 (pendiente).
- **Ficha técnica** (`GET /comision/estudiantes/:id/ficha?academic_year_id=`): notas por periodo y asignatura, recuperaciones (M18), inasistencias justificadas/injustificadas por periodo (M13), **solo conteos** de observaciones y faltas por gravedad (M14/M15), si tiene remisiones a orientación y PIAR (sin contenido), el cierre de M19 y los compromisos de sesiones anteriores. La ven ADMIN/COORDINADOR y quien integra una sesión donde está el estudiante; para el resto «no existe» (404). **El detalle confidencial no se copia**: la comisión incluye docentes y padres.
- **Pruebas**: `tests/comision.test.ts` y `tests/integracion/comision.int.test.ts` (flujo completo hasta M19, firmas, huella, recusación, sin quórum, sin mayoría).
- **Pendiente, a propósito**: convocatoria y avisos (M28); la promoción anticipada y los reiniciantes ya usan estas sesiones con casos de tipo `PROMOCION_ANTICIPADA` (ver M19); un catálogo de integrantes por año.

### Traslados extemporáneos y homologación de notas (M04 → M12/M17/M18/M26) — estado: núcleo completo

Backend `/traslados` (modelos `TrasladoExtemporaneo`, `NotaHomologada`, `EscalaExterna`; servicios `traslado.service`, `escalaExterna.service`, `trasladoConsulta.service`; reglas puras en `utils/homologacion.ts`, tests en `tests/homologacion.test.ts`),
frontend `TrasladosPage` (`/secretaria/traslados`, ADMIN/COORDINADOR/SECRETARIA; las escalas solo las configuran ADMIN y COORDINADOR) con `components/traslados/` y `hooks/useTraslados.ts`. Reglas que no se ven leyendo un solo archivo:

- **Un traslado extemporáneo es un registro aparte de la matrícula** (`enrollment_id` único): fecha de ingreso, `periodo_ingreso` local, colegio de procedencia, sus periodos (`periodos_origen`, con fechas opcionales), la escala con la que evaluaban y los soportes (PDF/imagen, 5 MB, `uploads/traslados/<id>/`, se bajan con sesión y se auditan). Los periodos **anteriores** al de ingreso son los que se homologan. No se puede declarar un ingreso posterior a un periodo en el que el estudiante ya tiene notas cerradas por sus docentes (409), ni adelantarlo por encima de notas ya homologadas.
- **El docente nunca califica lo anterior al ingreso.** La planilla (`cargarContextoPlanilla`) excluye a los que ingresaron después del periodo (`ingresaron_despues`, avisado al docente) y los conteos de cierre/definitivas/seguimiento usan `estudiantesACalificarPorGrupo`, así que un estudiante sin nota de ese periodo no bloquea el cierre.
- **Dos estados de nota** (`NotaHomologada`, único por estudiante+año+asignatura+periodo): `HOMOLOGADA_EXTERNA` (nota ya convertida, entra como la definitiva del periodo) y `EXENTA_POR_TRASLADO` (el colegio de origen no dictaba la asignatura: sin nota, con motivo obligatorio). Quien homologa escribe la nota **tal como viene del certificado**; el servidor la convierte y guarda la original, el periodo de origen, la escala usada (copia, no referencia) y el peso de cada fuente. Corregir o quitar algo ya registrado exige `motivo_cambio` y deja la versión anterior en `historial[]`. Todo o nada: con un solo valor inconvertible no se guarda nada (400 con la lista de errores).
- **Ninguna escala está en el código** (`EscalaExterna`, catálogo del colegio): numérica (mín./máx./aprobatoria) convertida **linealmente anclada en la aprobatoria** (aprobar allá = aprobar aquí; lo que reprueba allá nunca se redondea hasta aprobar) o **por rangos**, o conceptual (concepto/abreviatura → nota). Sin escala de origen la nota ya está en la del colegio y solo se valida contra ella. Una escala usada se desactiva, no se elimina; editarla no cambia lo ya homologado.
- **Esquemas de periodos distintos** (3 trimestres → 4 periodos): `sugerirCorrespondencia` reparte por cruce de fechas si ambos esquemas las tienen, y si no por partes iguales del año; la nota del periodo local es el promedio ponderado de sus fuentes ya convertidas. Secretaría puede ajustar los pesos por traslado (si no los toca, rige la sugerencia).
- **Cálculo con exentas.** Una exenta **no es un cero**: `porcentajesEnArea` redistribuye su peso entre las asignaturas cursadas del área (en `ARITMETICO` es el promedio de las cursadas); un área toda exenta no tiene nota y no entra al promedio general; `notaAnual` (M18) y `notaDefinitiva` (M26) promedian solo los periodos realmente cursados u homologados; `contarReprobadas` **nunca** cuenta una exenta, y `asignaturasPerdidas` (M18) la usa, así la promoción no la penaliza. Sin exentas el cálculo es idéntico al de siempre.
- **Boletín (M17) y certificado (M26).** Una homologada reemplaza la nota cerrada del periodo y se marca `(H)`; la exenta sale `E`; ambos con su convención al pie y la línea de ingreso por traslado (textos del colegio: claves `homologada`, `exenta`, `convencion_*`, `traslado_linea` en `constants/boletin.ts`, el modelo, el validador, `DisenoBoletin.tsx` y `hooks/useBoletin.ts`). El certificado de estudio acepta `HOMOLOGADA_EXTERNA`/`EXENTA_POR_TRASLADO` además de `DEFINITIVO`. El boletín detalla la nota original y su escala (`homologacion.detalle`).
- **Auditoría**: `TRASLADO_*`, `NOTA_HOMOLOGADA_*`, `ESCALA_EXTERNA_*`; el `detalle` no lleva notas.
- **Pruebas:** unitarias (`homologacion.test.ts`, caso H/E en `reportCardPdf.test.ts`) y de integración con base real (`integracion/traslados.int.test.ts`: planilla, boletín, historial, rechazo; **no se pudo correr donde no hay binario de MongoDB**). La interfaz compila (`tsc -b`, `vite build`) pero no se probó en un navegador.
- **Pendiente, a propósito:** «Mis notas» del estudiante y el portal del acudiente (M27) no muestran aún las notas homologadas; la asistencia de los días anteriores al ingreso no se excluye; la promoción oficial (M19/M20) leerá `contarReprobadas`; `CalificacionAsignatura` sigue limitada a 4 periodos; ventana propia de digitación para secretaría; carga masiva de notas homologadas por archivo.

### Retiro y traslado durante el año (M04 → M11/M13/M17/M26/M31) — estado: núcleo completo

Backend `/salidas` (modelo `PazYSalvoSalida`; campos `salida` y `trayectoria` en `Enrollment`; servicios `salidaMatricula.service`, `salidaCupo.service`, `pazYSalvoSalida.service`, `boletinRetiro.service`, `boletinRetiroPdf.service`; reglas puras en `utils/salidas.ts` y `utils/boletinRetiro.ts`, tests en `tests/salidas.test.ts`),
frontend `SalidasPage` (`/secretaria/salidas`, ADMIN/COORDINADOR/SECRETARIA) con `components/salidas/` y `hooks/useSalidas.ts`; el botón «Retirar» del expediente de la matrícula abre `RegistrarSalidaDrawer`. Reglas que no se ven leyendo un solo archivo:

- **TRASLADADO no es un estado de la matrícula: es `salida.tipo` (`RETIRO` | `TRASLADO`).** La matrícula queda `RETIRADO` en ambos casos, así los filtros que ya excluyen a los retirados (`ESTADOS_MATRICULA_ACTIVOS/VIVOS`, las listas de aula) siguen valiendo sin tocar M11/M13. Un traslado exige la institución receptora; un retiro, no. `aplicarSalida` es el **único camino** que retira una matrícula con folio: en una sola transacción pone el estado, el motivo y la `salida` (fecha efectiva, motivo, receptora, quién, cuándo, soportes), cierra el tramo abierto de la trayectoria, pasa el expediente M03 a `RETIRADO` (así volver a matricularlo pasa por el reingreso guiado), abre el paz y salvo, libera el cupo según la política y audita. `updateEnrollmentStatus(..., 'RETIRADO')` delega ahí (tipo RETIRO, fecha hoy); una **PREINSCRITO** aún no tiene folio y conserva el retiro simple (libera su cupo); lo correcto para un aspirante que desiste es anular.
- **Fecha efectiva**: día de calendario (medianoche UTC, hoy = UTC-5 como el resto del sistema), no futura y no anterior a la matrícula. No se registra en un año `CERRADO`. Lo anterior a la fecha efectiva es del estudiante; lo posterior no cuenta (la asistencia que se grabe después se conserva pero queda fuera del boletín y las estadísticas: `calcularEstadisticas` acepta `hasta`).
- **Cupo parametrizable** (`Institution.politica_cupo_salida`, `PATCH /institution/ajustes`, bloque «Cupo de quien sale» de Configuración institucional): `INMEDIATA` (por defecto, al registrar) o `AL_APROBAR_PAZ_Y_SALVO` (se retiene hasta que todas las dependencias estén aprobadas). `liberarCupoDeSalida` es idempotente: un `updateOne` condicional sobre `salida.cupo_liberado: false` y solo entonces `$inc: -1` en `Group.cupos_ocupados`, así anular y volver a aprobar, o dos aprobaciones simultáneas, no descuentan dos veces. Cambiar la política no toca salidas ya registradas.
- **Desvinculación del aula sin perder nada (M11/M13/M12).** No hay borrado ni bandera nueva en esos módulos: planillas, asistencia y entregas ya leen solo matrículas activas. `detalleDeSalida.conservado` cuenta lo que sigue guardado (notas por asignatura, registros de asistencia, entregas, y asistencia posterior a la salida) y la pestaña «Historia conservada» lo muestra.
- **Soporte documental**: hasta 5 archivos (PDF/JPG/PNG/WEBP por firma de bytes, 5 MB) en `uploads/salidas/<matrícula>/`, descarga con sesión y auditada. **M29 aún no existe**, así que el soporte es opcional: su ausencia sale en `faltantes`, no impide registrar. El respaldo debe cubrir `uploads/`.
- **Paz y salvo de salida por dependencia** (`PazYSalvoSalida`, único por matrícula; pestaña «Paz y salvo»). Las dependencias se **copian** (clave y nombre) de `ConfiguracionCertificados.paz_y_salvo.dependencias` activas (o de `DEPENDENCIAS_PAZ_Y_SALVO_INICIALES` si no hay configuración; solo lectura, así la lista sigue siendo del colegio y no se duplica en código). Sin dependencias activas no se crea documento y el estado global es `APROBADO`. Estado por dependencia `PENDIENTE` | `BLOQUEADO` (deuda o material, con detalle obligatorio) | `APROBADO`; global = alguna `BLOQUEADO` → `BLOQUEADO`, todas `APROBADO` → `APROBADO`, si no `PENDIENTE`. Acciones `APROBACION`, `BLOQUEO`, `EXCEPCION` (aprobar pese a una deuda: solo desde `BLOQUEADO`) y `ANULACION` (devuelve a `PENDIENTE`); la excepción y la anulación son solo de **ADMIN (Rectoría) y SECRETARIA** (`resolverAccionDependencia`, pura con tests), exigen motivo y todas dejan una línea en el `historial` de la dependencia. La auditoría (`PAZ_Y_SALVO_SALIDA_*`) lleva la dependencia, nunca el texto de la deuda ni del motivo. No hay permisos por dependencia (quien gestiona salidas verifica cualquiera).
- **Compuerta de los documentos de salida (M26)**: la fuente `PAZ_Y_SALVO_SALIDA` de `FUENTES_CERTIFICADO` se enciende en el tipo de documento (como `VALORACIONES`, no se compara por nombre). Con ella, `prepararDocumento` llama `exigirPazYSalvoDeSalidaAprobado` al **expedir** (la vista previa no se bloquea) y responde 409 con lo que falta. Una salida anterior a este módulo no tiene paz y salvo y no se bloquea.
- **Certificado de retiro (M26)**: `CERTIFICADO_RETIRO` se expide con la matrícula `RETIRADO` y el paz y salvo de salida aprobado (fuente `PAZ_Y_SALVO_SALIDA`). **Registrar el retiro no se bloquea por el paz y salvo**: el retiro es un hecho y condicionar la entrega de documentos académicos a deudas tiene riesgo jurídico (validar con asesoría); el paz y salvo condiciona los documentos, no la salida.
- **Boletín parcial de retiro (M17)** (`armarBoletinRetiro`, `GET /salidas/:id/boletin-parcial` y `/pdf`): **solo cuentan las definitivas oficiales de los periodos M05 `CERRADO` cuyo fin es anterior o igual a la fecha efectiva** (la nota sale de lo `CERRADO/DEFINITIVO` de M12, de la homologada o de la exenta, igual que el boletín del periodo, vía `boletinDePeriodoDeEstudiante`). El periodo en que salió, o uno que terminó pero no se cerró, es el **corte**: solo se incluye si `ConfiguracionBoletin.incluir_corte_en_retiro` (el SIEE lo permite; apagado por defecto), se marca provisional y **no entra al acumulado**; si no, se omite y el documento lo avisa. Acumulado por asignatura = `notaDefinitiva` ponderada con los porcentajes de M05 **renormalizados sobre los periodos incluidos** (un periodo exento se salta; sin una nota oficial de un periodo incluido, el acumulado es `null`: nunca se promedia lo que falta). El grupo de cada periodo sale de la trayectoria (`grupoEnFecha`). La asistencia se corta en la fecha efectiva. `ConfiguracionBoletin.exigir_paz_y_salvo_en_retiro` (apagado por defecto) condiciona el **PDF** al paz y salvo aprobado; ambas opciones están en `/admin/boletin`, son decisión del colegio y no cambian ninguna nota. Cada generación del PDF se audita (`SALIDA_BOLETIN_PARCIAL_GENERADO`). Si faltan notas oficiales el documento sale marcado como informativo (`completo: false`).
- **Inmutabilidad (M03/M26/M31).** Nada se borra en cascada: (1) la `salida` de una matrícula no se reescribe (hook `pre('save')`: tipo, fecha efectiva, motivo, estado previo, quién y cuándo registró no se modifican; avanzan los soportes y el cupo); (2) una matrícula con folio no se borra por documento (`deleteOne`; los borrados por consulta no se bloquean porque hay pruebas que limpian así); (3) `trayectoria[]` (`group_id`, `desde`, `hasta`) se abre al crear la matrícula, `cambiarGrupo` cierra y abre tramos y la salida cierra el último, así el Libro de Matrícula conserva por qué grupos pasó y cuándo; en matrículas anteriores se deriva al leer; (4) `AuditLog` es de **solo escritura** en el modelo (no se actualiza ni se borra, ni por documento ni por consulta; las pruebas limpian por la colección cruda); (5) un `User` con historial ya no se puede eliminar (`tieneHistorial`, que también cuenta lo que el usuario escribió, atendió o firmó en convivencia: observaciones, solicitudes, casos, remisiones a orientación, miembros y actas del comité). El expediente y el aula siguen leyendo estos datos: no hay copia.
- **Pruebas:** unitarias (`tests/salidas.test.ts`: fecha efectiva, estado global, acciones por rol, cupo, grupo en fecha, periodos del retiro, acumulado) y de integración con base real (`integracion/salidas.int.test.ts`: registro, cupo con las dos políticas, paz y salvo, excepción y anulación por rol, inmutabilidad; **no se pudo correr donde no hay binario de MongoDB**). La interfaz compila (`tsc -b`, `vite build`) pero no se probó en un navegador.
- **Pendiente, a propósito:** soporte obligatorio y archivo general (M29); permisos por dependencia (cada área verificando solo la suya); deshacer un retiro (hoy se corrige con un reingreso guiado, no se revierte); **validar con la norma vigente si se puede condicionar la entrega de documentos académicos a deudas** (por eso las dos opciones del SIEE nacen apagadas); acceso del estudiante o acudiente al boletín de retiro (M27) y avisos (M28); expedir el certificado de estudio con las notas de un retirado (depende de M19); el boletín de retiro usa el diseño propio del PDF, no la plantilla del colegio (M21).

### M29 (Expediente digital del estudiante) — vista agregada, sin datos propios

`GET /students/:id/expediente` (`expedienteDigital.service`, ADMIN, COORDINADOR y SECRETARIA; secretaría y coordinación solo de estudiantes que alguna vez estuvieron en sus sedes) y la pestaña «Expediente digital» de la ficha (`ExpedienteDigitalTab`). **No hay tabla propia ni se mueven archivos**: indexa por estudiante lo que cada módulo ya guarda —documentos de matrícula (`uploads/matriculas/`), soportes de retiro (`uploads/salidas/`), traslados (`uploads/traslados/`), paz y salvo de fin de año, servicio social (`uploads/servicio-social/`), soportes del PIAR (`uploads/inclusion/`, **solo el administrador**: son datos de salud y la ruta de descarga ya los limita) y los certificados y diplomas expedidos (código, clave corta y estado)—. Cada ítem trae `descarga`, la **ruta de la API** del módulo dueño (nunca una ruta de disco), o `null` si quien consulta no puede bajarlo (coordinación ve que un certificado existe pero lo baja Secretaría); el archivo se abre con la sesión. Cada consulta se audita (`EXPEDIENTE_DIGITAL_CONSULTADO`, sin contenido). **Pendiente:** los certificados del estudiante visibles para él o su acudiente (M27) y el archivo general con versiones (M29 completo).

### M33 (Reportes de cierre anual) — estado: completo (sábana, informe final del año, listados de recuperación final, retirados, servicio social y balance de inclusión, plantilla SIMAT, causales del SIEE en el acta y libro de calificaciones foliado)

Backend `/reportes` (`reportes.routes.ts`, `reportes.controller.ts`, `reportes.validator.ts`; servicios `sabanaCalificaciones.service`, `sabanaExcel.service`, `sabanaPdf.service`, `informeFinal.service`, `informeFinalPdf.service`, `listadosCierre.service`, `balanceInclusion.service`, `libroCalificaciones.service`, `libroCalificacionesPdf.service`, `alcanceReportes.service`, `simat.service`, `reporteTabularExcel.service`, `reporteTabularPdf.service`; reglas puras `utils/sabanaCalificaciones.ts`), frontend `ReportesCierrePage` (`/admin/reportes-cierre`, ADMIN, COORDINADOR y SECRETARIA) con `components/reportes/SabanaPanel` y `hooks/useReportes.ts`. Reglas que no se ven leyendo un solo archivo:

- **Ningún reporte guarda datos propios: se calcula al descargar** con lo que registran M12, M13, M18 y M19. Por eso se puede bajar la sábana al terminar un periodo o antes de las recuperaciones y volver a bajarla cuando todo esté actualizado. El encabezado dice en qué punto está (`estado_datos`: `PERIODO` | `PRELIMINAR` | `DEFINITIVO`, este último solo si todos los estudiantes del alcance tienen cierre de promoción vigente) y la hora de generación. Cada descarga se audita (`REPORTE_CIERRE_GENERADO`).
- **Sábana** (`GET /reportes/sabana/excel|pdf?academic_year_id=&sede_id=&jornada_id=&grade_id=&group_id=&periodo_numero=`): filtros opcionales en cascada año → sede → jornada → grado → grupo; sin grupo, un libro Excel con una pestaña por grupo (o un PDF con una sección por grupo). Sin `periodo_numero` es el cierre del año (notas de `construirEntradasDelGrupo` con la recuperación final ya aplicada, promedio por áreas como el boletín, fallas de M13); con periodo son las notas efectivas de ese periodo (`cargarContextoNotas`) y el promedio es el simple de las asignaturas. **Una nota que falta es una celda vacía, nunca cero**; una exenta por traslado sale `EX` y no cuenta como perdida; sin todas las notas no hay promedio ni puesto. El puesto respeta `ConfiguracionBoletin.mostrar_puesto` y se da solo a quien tiene todas sus notas (empatados comparten puesto, como el boletín; no existe un puesto anual en otro módulo). Antes del cierre la columna de promoción es una **proyección** del motor de M19 marcada «(proyectado)»; con cierre vigente es la decisión oficial. Los estudiantes salen en orden alfabético por apellidos; los retirados no. **Secretaría la descarga solo de las sedes que tiene asignadas** (sin sedes, 404; archivo y traslados la necesitan); los reportes de cierre que vengan en las fases siguientes incluyen a Secretaría salvo el balance de inclusión (datos de salud).
- **Informe final del año** (`GET /reportes/informe-final/pdf?academic_year_id=&group_id=&student_id?`, pestaña «Informe final del año» de `ReportesCierrePage`): **documento aparte del boletín del último periodo** (ese se entrega antes de las recuperaciones y no debe cambiar después). Un estudiante por hoja, con el diseño del boletín del colegio (`ConfiguracionBoletin.plantilla`: letra, color, escudo, firmas y pie; el director de grupo sale de su asignación) y: la nota efectiva de cada periodo, la del año, la de la recuperación final **solo si cambió la del año**, el desempeño con su equivalencia, las fallas por asignatura, el promedio y puesto (misma regla y `mostrar_puesto` que la sábana; `calcularPuestos`), las inasistencias del año y el estado de promoción (oficial, o **proyectado** y marcado). Sin cierre de promoción de todos el informe sale **PRELIMINAR** (aviso rojo en cada hoja); con él, definitivo. Se calcula al pedirlo, no se guarda. Lo bajan ADMIN, COORDINADOR y SECRETARIA (esta solo de sus sedes, 404 si no es de ellas). **La publicación a las familias es propia**: reutiliza `PublicacionBoletin` con `periodo_numero = 0` (`PERIODO_INFORME_FINAL`), así que se publica por grupo y con excepciones por estudiante sin tocar los boletines de los periodos (publicar uno no publica el otro); solo el ADMIN publica (`PUT /reportes/informe-final/publicacion`) y el estudiante o su acudiente lo bajan por `GET /reportes/informe-final/mio/pdf` (botón en «Boletín»), que exige la publicación y, para el acudiente, el vínculo. **Pendiente:** el aviso M28 a las familias al publicarlo y las excepciones por estudiante desde la pantalla (la API ya las acepta).
- **Listados de cierre** (`GET /reportes/recuperacion-final|retirados/excel|pdf?academic_year_id=&sede_id=&jornada_id=&grade_id=&group_id=`, pestaña «Listados de cierre»; ADMIN, COORDINADOR y SECRETARIA, esta solo de sus sedes): comparten el contrato `ReporteTabular` (`utils/reporteTabular.ts`: columnas + filas + resumen + leyenda) y dos escritores genéricos (Excel con una hoja «Listado», PDF horizontal con el encabezado repetido), así que **un listado nuevo es solo un servicio que arma un `ReporteTabular`** (así irá el consolidado de servicio social). `gruposDelAlcance` resuelve los filtros en cascada y el alcance de sedes de Secretaría. **Recuperación final** (`reporteRecuperacionFinal`) llama a `listarCandidatos` de M18 por grupo (no recalcula nada): estudiante, asignatura pendiente, **docente responsable** (de la `TeacherAssignment`), nota del año, estado y si aún puede recuperar; quien perdió más de lo que el colegio permite sigue en la lista marcado «No: …», y sin recuperación final en la política responde con ese mensaje y la lista vacía; la leyenda dice si la ventana del calendario está abierta. **Retirados** (`reporteRetirados`) lista las matrículas `RETIRADO` del año con la `salida` de M04 (fecha efectiva, tipo retiro/traslado, motivo, institución que recibe) y las fallas justificadas e injustificadas **hasta esa fecha**; una matrícula retirada antes de que existiera la salida registrada sale sin fecha ni motivo. **Servicio social** (`reporteServicioSocial`, `GRADOS_SERVICIO_SOCIAL` = 10 y 11): una fila por estudiante con matrícula activa en esos grados (los que no registraron nada salen igual, pendientes), con la entidad receptora de cada tanda (las rechazadas no se listan; las por verificar se marcan), las horas con soporte `VERIFICADO` o `HEREDADO` (las mismas que usa la titulación), las por verificar, las exigidas (`PoliticaPromocion.titulacion.servicio_social`) y el estado **Aprobado / Pendiente**; si el colegio apagó la exigencia el estado es «No se exige», no un cumplimiento inventado. Ninguno guarda nada y cada descarga se audita (`REPORTE_CIERRE_GENERADO`).
- **Libro de calificaciones** (registro escolar consolidado, Decreto 1290 art. 16; modelo `LibroCalificaciones`, pestaña «Libro de calificaciones»; `POST|GET /reportes/libro-calificaciones`, `/:id/pdf`, `/:id/integridad`, `/:id/anular`): **a diferencia del resto de reportes de M33, este sí se guarda**, porque es un documento de archivo. Es **por año, sede y grado, con una sección por grupo** (la sábana definitiva), portada, hoja de constancia con las firmas de rectoría y secretaría académica (nombres de `ConfiguracionCertificados`; sin designar queda la línea en blanco) y un folio en cada hoja. **Solo se emite cuando todos los estudiantes del grado en esa sede tienen el cierre de promoción oficial con un resultado final** (`RESULTADOS_FINALES`: promovido o no promovido; quien espera recuperación, comisión, una persona o notas bloquea, y el 409 trae `details.estudiantes` con quiénes faltan, `estudiantesQueBloqueanElLibro`), porque un libro no se corrige después. Al emitirse, en una sola transacción: consecutivo anual sin huecos (`LC-2026-001`, `Counter` `LIBRO-CAL-<año>`) y **folios continuos por año** (`Counter` `FOLIO-LIBROS-<año>` avanza el número de hojas del libro, contadas antes con un dibujo de prueba: las hojas no dependen de los dígitos), contenido congelado en `snapshot` y huella SHA-256 (`hashDeActa`) de código + folios + contenido. **Inmutable en el modelo** (hook: solo cambian `estado` y `anulacion`); el PDF se dibuja solo desde el snapshot, así reimprimir da el mismo libro, y se niega (409) si la huella ya no coincide. Un solo libro `VIGENTE` por año, sede y grado (índice parcial): para emitir otro se **anula con motivo** (mínimo 10 caracteres, queda en el libro), el anulado se sigue verificando e imprimiendo marcado «ANULADO» en cada hoja y **sus folios no se reutilizan**. Emiten y anulan ADMIN y SECRETARIA (esta solo de sus sedes, «no existe» = «no es de tu sede»); COORDINADOR lista, reimprime y verifica; el resto no entra. Auditoría `LIBRO_CALIFICACIONES_EMITIDO|DESCARGADO|ANULADO` sin contenido. **Pendiente:** firma de las hojas (hoy es firma manuscrita sobre el impreso), anexar el libro al archivo general (M29) y un libro de un grado en varias sedes (cada sede tiene el suyo).
- **Balance anual de inclusión** (`GET /reportes/balance-inclusion/excel|pdf`, mismo contrato `ReporteTabular`; **solo ADMIN, ORIENTADOR y COORDINADOR** —`ROLES_BANDEJA_INCLUSION—, nunca Secretaría, convivencia, docentes ni familias: son datos de estudiantes con necesidades de apoyo): una fila por estudiante con expediente de M16 en el año (grupo, documento, estudiante, estado del expediente, si la autorización de datos sigue vigente, **cuántos ajustes del PIAR cumplen el seguimiento mínimo** —seguimientos en al menos `ConfiguracionInclusion.seguimientos_minimos_anio` periodos distintos—, informe anual emitido o firmado y plazo de elaboración vencido). **No muestra categoría de discapacidad, diagnóstico ni soportes** (tiene prueba que lo comprueba). Orientación y coordinación solo ven las sedes que tienen asignadas (como el resto de M16; el ADMIN, todas) y **coordinación no ve la modalidad (PIAR o plan de apoyo) de nadie**: sin esa columna ni esos totales, igual que `permisoInclusion`. `ReportesCierrePage` deja entrar también al ORIENTADOR, que solo ve el balance dentro de «Listados de cierre». Cada descarga se audita sin contenido.
- **Plantilla de cierre para SIMAT** (`GET /reportes/simat/revision|excel|csv`, pestaña «Cierre para SIMAT»; `simat.service`, reglas puras `utils/simat.ts`): **una sola hoja continua**, encabezados técnicos en la fila 1 (`ENCABEZADOS_SIMAT`) y un estudiante por fila de **todos los grados y grupos del alcance**, sin títulos ni totales; columnas: DANE de la sede (12 dígitos, `Campus.codigo_dane_sede`), año, tipo y número de documento, **primer/segundo apellido y primer/segundo nombre** (de `StudentProfile`, ver abajo), grado (`codigoDeGrado`: `00` Transición, `01`–`11`), grupo (nomenclatura), situación y total de asignaturas reprobadas (`contarReprobadas`, sin exentas). **Situación de un carácter** (`situacionSimat`, pura): `D` retirado o trasladado (manda sobre todo y no necesita cierre), `G` graduado (titulación `GRADUADO`/`GRADUADO_EXTEMPORANEO`), `P` promovido (cualquiera de los tres promovidos de M19), `R` no promovido, `N` pendiente (recuperación, comisión, retiro por confirmar, notas incompletas o sin cierre). **Quien perdió asignaturas es `N` hasta que el colegio hace el cierre `TRAS_RECUPERACION`; solo entonces pasa a `R`.** Sin cierre oficial la situación es una proyección del motor de M19 (igual que la sábana). **Antes de descargar hay una revisión** (`GET /reportes/simat/revision`, `revisarSimat`) que no cambia el archivo: totales por situación y advertencias con ejemplos (`SIN_NOMBRES`, `SIN_CIERRE`, `DANE_INVALIDO`, `TIPO_DOCUMENTO` fuera de TI/RC/CC/NES/PEP/PPT —el sistema también guarda CE—, `GRADO_SIN_CODIGO` para grados anteriores a Transición, `APROBO_SIN_GRADO` para quien aprobó once sin graduarse, que se reporta `P`). **Nunca se parten los nombres por adivinación**: los cuatro campos salen tal como se escribieron y, si faltan, quedan vacíos y la revisión lo dice. Excel (documento, grado y grupo como texto, conservan ceros) y CSV (UTF-8 con BOM, separador `;`, el de Excel en español). **Revisan** ADMIN, COORDINADOR y SECRETARIA; **descargan solo ADMIN y SECRETARIA** (esta solo de sus sedes). Un retirado que tiene otra matrícula viva el mismo año sale una sola vez, con la viva. **Validar los nombres de columna y los códigos con el anexo técnico vigente del MEN (cambia por versión).**
- **Nombre desglosado (M03, para SIMAT):** `StudentProfile.primer_nombre`, `segundo_nombre`, `primer_apellido`, `segundo_apellido` (opcionales, hasta 60 caracteres; `User.nombre` y `apellido` siguen siendo lo que se muestra). Se escriben en el asistente de creación, en la hoja de vida del estudiante y en la carga CSV (cuatro columnas opcionales con el mismo nombre). No hay script que los rellene: partir «De la Cruz» o «María José» a la fuerza daría registros mal separados que SIMAT rechaza.
- **Pruebas:** `tests/sabanaCalificaciones.test.ts` (cálculo puro), `tests/simat.test.ts` y `tests/integracion/simat.int.test.ts`, `tests/integracion/listadosCierre.int.test.ts`, `tests/integracion/informeFinal.int.test.ts` e `tests/integracion/sabanaCalificaciones.int.test.ts` (preliminar, definitiva, periodo, filtros, permisos, Excel y PDF). La pantalla compila (`tsc -b`) pero no se probó en un navegador.
- **Pendiente, a propósito:** ver cada libro y reporte desde el portal de las familias (M27) y los avisos de publicación (M28).


### M30 (Dashboards de rectoría, coordinación, convivencia y orientación) — estado: dashboards de ADMIN, COORDINADOR, COORDINADOR_CONVIVENCIA y ORIENTADOR completos

Backend `/dashboard` (`dashboard.routes.ts`, `dashboard.controller.ts`, `dashboard.validator.ts`; servicios `dashboardContexto.service`, `dashboardDirectivo.service`, `dashboardCoordinacion.service`; cálculos puros `utils/dashboard.ts`, caché `utils/cacheCorta.ts`, constantes `constants/dashboard.ts`), frontend `DashboardPage` (`/panel`, que despacha por rol a
`pages/dashboard/DashboardDirectivoPage` para ADMIN, `DashboardCoordinacionPage` para COORDINADOR, `DashboardConvivenciaPage` para COORDINADOR_CONVIVENCIA y `DashboardOrientacionPage` para ORIENTADOR; el resto de roles conserva el inicio de siempre), hook `useDashboard.ts` y `components/dashboard/`. Reglas que no se ven leyendo un solo archivo:

- **Solo lee y no guarda nada.** Cada bloque se arma con lo que ya registran M05, M12, M13, M18, M19 y M20; ninguna regla de negocio nueva vive aquí (`utils/dashboard.ts` solo agrupa y saca porcentajes). Donde ya había un cálculo se **reusa**: `seguimiento` (M12, con un filtro aditivo `group_ids`), `calcularEstadisticas` (M13, con el alcance reemplazado por los grupos de la sede), `calcularTableroDeRiesgo` (M20, el mismo del tablero de la comisión **sin su auditoría**: el dashboard se refresca solo y no debe llenar la bitácora), `listarCandidatos` (M18, grupo por grupo) y `filasDeServicioSocial` (extraído de `reporteServicioSocial`, así el dashboard y el listado de cierre dicen lo mismo).
- **Un endpoint por bloque, todos con el mismo filtro** (`academic_year_id`, `sede_id?`, `periodo_numero?`): `/indicadores`, `/eficiencia`, `/morbilidad` y `/coordinacion/{entrega-notas,riesgo,recuperaciones,servicio-social,desempeno,comparativo,alertas}`. La pantalla los pide por separado (cada tarjeta carga y falla sola) y los refresca cada 2 minutos. ADMIN y COORDINADOR ven lo mismo de toda la institución; la sede es un filtro, no una restricción de rol.
- **«Tiempo real» son segundos de atraso, no un push.** `memorizar` (`utils/cacheCorta.ts`) guarda cada bloque `TTL_DASHBOARD_MS` (90 s) por año, sede y periodo y comparte el cálculo en curso entre peticiones simultáneas; una falla no se guarda. La caché es del proceso: con varias instancias cada una calcula lo suyo. Lo más pesado es el riesgo y las recuperaciones (recorren clase a clase o grupo a grupo): por eso son bloques aparte.
- **Dos periodos distintos por diseño** (`ContextoDashboard`): `periodo_en_curso` (el de las planillas que se están entregando: el último en digitación, si no el último abierto…) para la entrega de notas y el riesgo, y `periodo_notas` (el último que ya tiene notas `CERRADO/DEFINITIVO`) para rendimiento, morbilidad y desempeño. Si la pantalla elige un periodo, los dos son ese. Preescolar no entra a ninguna medida de aprobación (Decreto 2247/1997).
- **El «% de aprobación» nunca engaña.** Es **oficial** solo cuando todos los estudiantes del alcance tienen resultado final del cierre de M19 (`RESULTADOS_FINALES`); mientras tanto es **provisional** y lo dice (`modo`): quienes no tienen asignaturas perdidas en las notas cerradas del periodo contra quienes tienen asignaturas perdidas o esperan recuperación o comisión (no es reprobar el año). Sin notas es «sin datos», nunca un 0 %. Quien no tiene ninguna nota cerrada no entra a la base.
- **Desertores = retirados.** Decisión del usuario: no se agregó ningún campo a M04. «Retirados» es toda matrícula `RETIRADO` del año, **incluidos los traslados a otro colegio** (el sistema los deja en ese estado), y la pantalla lo avisa. Si algún día hay que separarlos, es `salida.tipo`.
- **Los umbrales son del colegio.** El riesgo crítico usa el semáforo de `ConfiguracionComision` (M20: `rojo_desde` asignaturas perdidas o `inasistencia_roja_pct`), no un 3 ni un 20 % fijos; la morbilidad exige el mínimo de evaluados de la reprobación masiva de M20; los niveles de desempeño y sus nombres salen de la escala del año (M05) y solo su color es fijo.
- **Privacidad.** El dashboard del coordinador académico **no** trae convivencia, faltas ni remisiones a orientación (el coordinador académico no las ve en M14/M15); sus alertas son justificaciones de inasistencia por revisar y sesiones de la comisión sin realizar. El detalle de riesgo trae nombre, grupo y motivos, nunca documento ni PIAR.
- **Convivencia y orientación (`dashboardBienestar.service`, `utils/dashboardBienestar.ts`): solo conteos y códigos de caso.** `GET /dashboard/convivencia` (ADMIN y `COORDINADOR_CONVIVENCIA`) y `GET /dashboard/orientacion` (ADMIN y `ORIENTADOR`) se piden por año y sede (sin periodo) y **nunca** devuelven hechos, nombres, documentos, categoría de discapacidad, diagnóstico ni el texto de una atención (hay pruebas que lo comprueban sobre el JSON completo). Cada uno ve **solo las sedes que tiene asignadas** (`alcanceDeSedes`; sin sedes no ve nada; pedir una sede ajena no la abre; solo ADMIN elige cualquiera) y quien se declaró impedido en un caso deja de contarlo (RN-15-11). El coordinador académico recibe 403 en ambos. La caché de estos dos es **por usuario** (lo que se ve depende de quién mira). Convivencia: solicitudes de caso por atender (y la más antigua), casos activos por estado y tipo, casos con alerta (`alertasDeCaso` de M15: remisión tipo III sin atender y seguimiento vencido, solo con el código del caso), sesiones del comité sin firmar y la próxima, faltas de los últimos 30 días por gravedad y remisiones a orientación. Orientación: remisiones por estado, solicitudes de apoyo por valorar, expedientes por estado (PIAR y plan de apoyo, plazo vencido, **sin autorización de datos**) y cuántos ajustes del PIAR ya tienen el seguimiento mínimo que fijó el colegio. **Rectoría** ve el resumen de ambos en la tarjeta `AlertasDeBienestar` de su panel.
- **Reporte tipo C-600 (`c600.service`, `c600Excel.service`, `c600Pdf.service`, `utils/c600.ts`; frontend `ReporteC600Page` en `/admin/reporte-c600` y `VistaC600`).** `GET /reportes/c600` (vista previa, JSON; ADMIN, COORDINADOR y SECRETARIA) y `/reportes/c600/excel|pdf` (solo ADMIN y SECRETARIA, esta solo de sus sedes) salen de **un solo cálculo**: lo que se ve es lo que se baja. Estructura que dio el usuario, **a validar con el formulario oficial vigente del DANE** (el reporte lo dice): encabezado, balance de matrícula por grado, resultados por grado y sexo y edad por grado y sexo, más la firma del rector (el firmante de Rectoría de M26). **Excel en una sola hoja** con las secciones una debajo de la otra. Reglas que no se ven leyendo un solo archivo:
  - **Sin cambios en M01 ni M04** (decisión del usuario): el **sector y los códigos DIVIPOLA no existen en el sistema** y salen como líneas para escribir a mano (en pantalla, Excel y PDF).
  - **Matrícula inicial** = matrículas (activas o retiradas, con folio) hechas hasta el día en que empezó el periodo 1; **ingresados** = las hechas después (incluye a los antiguos cuya matrícula se legalizó pasado el inicio de clases); **retirados** = toda matrícula `RETIRADO`, **incluidos los traslados a otro colegio**, y son los «desertores» de la sección 3; **final** = activas. Siempre cuadra: inicial + ingresados − retirados = final. Un retirado que volvió a matricularse el mismo año cuenta una sola vez, con la matrícula viva.
  - **Resultados** salen del cierre de promoción de M19 (`clasificarEstudiante`); quien aún no tiene resultado final (recuperación, comisión, notas por completar) va en **«Sin resultado final»**, una columna que no es del formulario pero sin la cual los totales no cuadrarían, y el reporte sale **PRELIMINAR**. Preescolar cuenta como promovido (Decreto 2247/1997).
  - **Sexo:** el sistema guarda `M` (masculino), `F` y `OTRO`; el formulario tiene Hombres y Mujeres. `F` es Mujeres, `M` es Hombres y lo demás (o sin dato) va en **«Otro / sin dato»**, columna que solo aparece cuando hay alguien en ella.
  - **Edad** = años cumplidos a una fecha de corte editable (por defecto el inicio del periodo 1), de 4 a 17 una por una y «18 o más»; «menos de 4» solo si hay alguien. Cuenta solo a los matriculados al cierre; quien no tiene fecha de nacimiento no entra y se avisa.
  - Ver el reporte en pantalla **no** se audita (cambia con cada filtro y no lleva datos de personas); bajar el Excel o el PDF sí (`REPORTE_CIERRE_GENERADO`).
- **Consolidado general de la institución** (`consolidadoInstitucional.service`, `GET /reportes/consolidado/excel|pdf`, solo ADMIN y COORDINADOR): los indicadores del panel de rectoría y la matriz de eficiencia por grado como un `ReporteTabular` (mismos cálculos, así que ambos dicen lo mismo). Se baja desde el acceso rápido del panel de rectoría.
- **Diseño del panel de rectoría** (`DashboardDirectivoPage`): cuatro tarjetas de resumen teñidas (`TarjetaIndicador tinte`, la familia `-soft` del tono que se desvanece a blanco: sin colores nuevos), la matriz de eficiencia **resumida por nivel educativo** (`MatrizEficienciaCompacta`, `lib/matrizEficiencia.ts`; cada nivel se abre para ver sus grados; `FilaEficiencia.nivel` sale del catálogo de grados, nunca de rangos de grado quemados) con aprobados/reprobados sobre quienes ya tienen resultado (igual que la tarjeta de rendimiento, así el total coincide) y desertores sobre la matrícula inicial, la morbilidad como barras verticales (`GraficaBarrasVerticales`, top 8) debajo de la matriz, ambas al ancho de la columna izquierda; en la columna derecha, los siete accesos rápidos (`AccesosRapidos destacados columnas={1}`, color por tipo: reportes verde, gestión azul, comunicación naranja) y debajo noticias y comunicados en lista (`PanelComunicacion variante="lista"`). **Rectoría ya no ve el resumen de convivencia y orientación en su panel** (decisión del usuario; `AlertasDeBienestar` sigue existiendo pero sin uso aquí): ese seguimiento está en `/convivencia/*` y `/orientacion/*`. Coordinación sigue con la versión anterior de esos componentes.
- **La pantalla conserva la cuadrícula de accesos del menú** (`CuadriculaDeAccesos`, plegable en pantallas grandes y abierta en las pequeñas): en pantallas pequeñas el menú lateral se oculta y esa cuadrícula, con sus puntos rojos de M28, es la navegación. El resto de roles la sigue viendo como antes.
- **Cambios mecánicos en otros módulos:** `AnunciosPage` (M28) ahora usa `AnuncioDrawer`, el formulario extraído a `components/anuncios/` para compartirlo con el botón «Redactar comunicado» (la lógica y los permisos no cambian); `ReportesCierrePage` (M33) acepta `?pestana=` opcional; `seguimiento` (M12) acepta `group_ids`; `riesgoAcademico.service` separa `calcularTableroDeRiesgo` de su auditoría.
- **Pruebas:** `tests/dashboard.test.ts`, `tests/dashboardBienestar.test.ts` y `tests/c600.test.ts` (cálculos puros y caché) y `tests/integracion/dashboard.http.int.test.ts` y `dashboard.bienestar.http.int.test.ts` y `c600.http.int.test.ts` (rutas, permisos por rol y sede, forma de cada bloque, que lo calculado coincide con lo registrado y que nada confidencial viaja; la caché se vacía entre casos). La interfaz compila (`tsc -b`) y pasa el lint, pero **no se probó en un navegador** (no había uno disponible ni se usó la base del desarrollador).
- **Pendiente, a propósito:** Cuadro de Honor (fuera de alcance por decisión del usuario).

### Noticias y eventos institucionales — módulo propio (aparte de los anuncios de M28) — estado: núcleo completo

Backend `/noticias` (modelos `Noticia`, `CategoriaNoticia`, `HabilitacionNoticias`; servicios `noticia.service`, `noticiaCategoria.service`, `noticiaHabilitacion.service`; reglas puras `utils/noticias.ts`, constantes `constants/noticias.ts`), frontend `NoticiasPage` (`/noticias`, todos los perfiles), `components/noticias/` y `hooks/useNoticias.ts`. **Es un módulo nuevo e independiente**: no extiende `Anuncio` (que sigue siendo el aviso corto por perfil de M28) ni es el M25. Una noticia tiene categoría, fecha, hora, lugar y un alcance. Reglas que no se ven leyendo un solo archivo:

- **Alcance**: vacío = toda la institución; si no, manda lo más específico (`alcanceDe`): grupos, luego grados, luego sedes (`INSTITUCION > SEDES > GRADOS > GRUPOS`). Se guarda calculado en `Noticia.alcance` porque es lo que se compara con la habilitación de un docente. `roles_destino` (DOCENTE, ESTUDIANTE, ACUDIENTE) dice a quién se dirige.
- **Quién publica** (`motivoSinPermiso`, función pura con tests, lista de permitidos sin herencia): ADMIN y COORDINADOR, cualquier alcance (y solo ellos **fijan**); SECRETARIA solo para sus sedes (nunca toda la institución; los grados y grupos son de esas sedes); **un DOCENTE solo con una habilitación** que le dan ADMIN, COORDINADOR o SECRETARIA (esta solo a docentes de sus sedes). El resto (estudiante, acudiente, convivencia, orientación) solo lee. El servidor decide siempre; `GET /noticias/permisos` solo le dice a la pantalla qué ofrecer.
- **La habilitación** (`HabilitacionNoticias`, registro propio: no toca `User`): alcance máximo (`GRUPOS < GRADOS < SEDES < INSTITUCION`), categorías opcionales (vacío = todas), **sin vigencia: dura hasta que alguien la revoque** (queda como historia; una activa por docente, índice parcial). Un docente con máximo «grupos» publica solo para los grupos donde dicta clase o dirige (carga de M08 y director de grupo de M01, año de trabajo); por debajo de «toda la institución» solo para sus sedes (si no indica sede en un grado, se usan las suyas). **Revocarla no borra lo publicado**: el docente deja de poder publicar y editar, pero sigue pudiendo archivar lo suyo. Al editar se vuelve a comprobar el permiso con los valores finales.
- **Categorías**: catálogo del colegio (`CategoriaNoticia`), no una lista en el código. Se siembran 7 de partida **una sola vez** (`Counter` `NOTICIAS_CATEGORIAS_SEMBRADAS`, al leerlas) y desde ahí las crean, editan, desactivan y eliminan ADMIN, COORDINADOR y SECRETARIA; una categoría con noticias o con un permiso activo se **desactiva**, no se elimina. Usan solo los 5 tonos de `Chip`. La noticia **copia** nombre y tono al publicar.
- **Quién lee qué** (`noticiaAplica`, pura): ADMIN y COORDINADOR ven todo; SECRETARIA, COORDINADOR_CONVIVENCIA y ORIENTADOR ven lo de sus sedes aunque no se les nombre; docentes, estudiantes y acudientes ven lo dirigido a su perfil que llegue a sus grupos, grados o sedes (`lectorDe`: el estudiante por su matrícula, el acudiente por la de sus hijos, el docente por su carga y sus sedes; todo sale de lo que ya existe, nada se guarda aparte). Vigente = publicada, ya empezó y no venció; **si no se indica cuándo vence, deja de verse al terminar el día del evento** (hora de Colombia). Orden: fijadas, eventos próximos (el más cercano primero) y luego lo reciente. Una noticia no se borra: se archiva.
- **Dónde se ve**: **como mosaico** (`MosaicoNoticiasInicio`) en el inicio de docentes, estudiantes y secretaría (`DashboardPage`), arriba del portal del acudiente (M27) y en los paneles de convivencia y orientación (M30); y el personal (administración, coordinación, secretaría, convivencia, orientación) además en un botón del encabezado que abre un panel lateral (`BotonNoticias`); los paneles de rectoría y coordinación (M30) muestran las próximas en `PanelComunicacion`, junto a los avisos y al calendario de M05. Las páginas de gestión (publicaciones, categorías, docentes habilitados) son pestañas de `/noticias` según lo que cada perfil puede usar.
- **Avisos** (`noticiaAvisos.service`): al quedar publicada, una noticia avisa a sus destinatarios con el evento `NOTICIA_NUEVA` de M28: **alerta en la campanita** (`CAMPANITA`, INFO) y **punto en «Noticias y eventos» del menú** (`ruta: /noticias`, se apaga al entrar). Las nuevas se **agrupan en una sola alerta** por destinatario (`entidad_id: noticias-nuevas`: «Hay 3 noticias y eventos nuevos. El último: …»), como M28 agrupa las entregas. `destinatariosDeNoticia` es `noticiaAplica` al revés: por institución, todos los usuarios activos de cada perfil; por sede, grado o grupo, los estudiantes matriculados ahí, sus **acudientes con portal** y los docentes que dictan o dirigen en esos grupos (por sede, también los docentes asignados a ella); solo a los perfiles de `roles_destino`, nunca al autor ni al personal (ya la tiene en su panel). Un aviso que falla no tumba la publicación (`sinRomper`, vuelve a quedar pendiente).
- **Publicación programada:** `publicar_desde` puede ser futuro (la pantalla lo llama «Publicar el»; los permisos son los de siempre, también para docentes habilitados). Mientras no le llega la hora **no se ve ni avisa** (solo la ve su autor y quien modera, marcada `programada`); a su hora la publica y avisa **el planificador** (`planificadorNoticias.service`, arrancado en `server.ts`): cada 60 s toma las noticias con `avisada: false`, publicadas, vigentes y con la hora cumplida y las **reclama de forma atómica** (`avisada: true` en un solo `findOneAndUpdate`), así que ni con varias instancias ni al revisar dos veces se avisa dos veces. Si se **adelanta** la hora de una programada al editarla, sale y avisa en el acto; una ya avisada no se vuelve a avisar. Archivar antes de su hora la deja sin avisar. A diferencia de los avisos diarios de M28, aquí la hora importa, por eso es frecuente.
- **Imagen = portada obligatoria** (`noticiaImagen.service`, `noticiaPortada.service`, `ImagenNoticia`): una por noticia (afiche o foto), PNG, JPG o WEBP de hasta 2 MB, confirmada por **firma de bytes** (`detectarFirmaArchivo`) y guardada en **su propia colección** para que listar noticias no arrastre megabytes (como `ImagenInstitucional`). **Nunca es pública**: en un evento puede haber niños en la foto. `GET /noticias/:id/imagen` exige sesión y solo la sirve a administración, coordinación, el autor y a quien puede ver esa noticia ya publicada; «no existe» y «no te toca» responden 404. Reemplazar la portada (`POST …/imagen`, multipart como toda subida) lo puede hacer quien puede **editar** esa noticia (el autor con su permiso aún vigente, o administración y coordinación; no una archivada) y queda en auditoría; **quitarla ya no se puede** (`DELETE …/imagen` responde 409: toda noticia lleva fotografía). La pantalla la pide con la sesión (`useImagenNoticia`: baja el archivo y usa su dirección local; la `imagen_version` va en la clave, así al reemplazarla nunca se ve una vieja). Al **crear o editar**, la portada viaja dentro del JSON como data URI (`portada`; el navegador la reduce a 1600 px y ≤ 2 MB con `lib/imagenes.ts`) y el servidor la confirma por la firma de bytes (`utils/portadaNoticia.ts`): la noticia y su portada se guardan **en la misma transacción**, así no puede quedar publicada sin foto. Las noticias anteriores a este cambio pueden no tener portada (`imagen_version: null`): se ven con el color suave de su categoría y piden una al editarse (fijarlas no la exige).
- **`afecta_clases`**: marca los eventos que suspenden o alteran las clases; hoy solo se guarda, lo usará el cálculo de carga institucional de los estudiantes.
- **Pruebas:** `tests/noticias.test.ts` (reglas puras y texto del aviso), `tests/integracion/noticias.http.int.test.ts` (rutas, permisos por rol, habilitaciones, quién ve qué por perfil, grupo, grado y sede, vigencia, orden, moderación y auditoría) y `tests/integracion/noticias.avisos.http.int.test.ts` (a quién avisa y que no se duplica, agrupación de alertas, publicación programada con el planificador, y la imagen: firma de bytes, tamaño, permisos y que no es pública). La interfaz compila y pasa el lint, pero **no se probó en un navegador**.
- **Editor editorial y mosaico.** Cada noticia suma `subtitulo` (bajada o entradilla, ≤ 200), `contenido_html` (el cuerpo con formato; `descripcion` pasa a ser su texto plano derivado, como en las actividades; una noticia anterior solo con `descripcion` se sigue leyendo y al editarla se abre en párrafos), `tamano_mosaico` (`PRINCIPAL` 2x2, `DESTACADA` 2x1, `ESTANDAR` 1x2, `BREVE` 1x1; por defecto Estándar) y el **punto de enfoque** de la portada (`enfoque_x`/`enfoque_y`, 0–100: **no recorta el archivo**, cada tarjeta lo usa como `object-position` según su forma). El cuerpo se limpia en el servidor con las reglas de las actividades más **una sola clase**, `letra-capital`, aceptada solo en un `<p>` (`utils/contenidoNoticia.ts`; las opciones de `contenidoActividad.ts` se exportan, sin cambiar las de las actividades). Los listados (`/mias`, `/gestion`) **no** traen el cuerpo: `GET /noticias/:id` lo da con las mismas reglas de visibilidad que la imagen (administración, coordinación y el autor siempre; los demás solo si está publicada, vigente y les toca; «no existe» = «no te toca» = 404) y trae el autor (solo el nombre, también en los listados). `app.ts` sube el límite de `express.json` a 8 MB solo para `/api/v1/noticias`.
- **Pantalla.** `EditorRico` acepta la opción aditiva `editorial` (botones de cita editorial y de letra capital por párrafo, sin librerías nuevas: `Extension` de Tiptap; el CSS está en `.contenido-editorial` y `p.letra-capital::first-letter` de `index.css`). El drawer (`NoticiaDrawer`, tamaño `xl`) es de dos columnas: el formulario (título, bajada, categoría, cuerpo, fechas, **tamaño de impacto** `SelectorTamanoMosaico`, **portada con punto de enfoque** `EnfoqueDePortada` con miniaturas por tamaño y controles de teclado, alcance…) y a la derecha la **vista previa en tiempo real «Mosaico de Noticias»** (`VistaPreviaMosaico`: la noticia en edición junto a las vigentes). **Las reglas del mosaico** (`lib/mosaicoNoticias.ts`, `paraMosaico`): cuadrícula de 4 columnas (2 en pantallas pequeñas y en la vista previa) con filas de altura fija y `grid-flow-dense`, para que las tarjetas de tamaños distintos se encajen; **solo la primera Principal se ve grande** (las demás se dibujan como Destacadas) y en los inicios entran hasta 10 celdas (una más pequeña puede ocupar el hueco de una grande que no cabe); en `/noticias` se ven todas. Una tarjeta (`TarjetaMosaico`) lleva la foto con degradado oscuro, categoría (el nombre siempre escrito), título, bajada, autor y fecha; el detalle (`NoticiaDetalleDrawer`) trae portada, cuerpo con formato y autor. Se omitieron a propósito las reacciones rápidas del diseño de referencia. Pruebas: `tests/contenidoNoticia.test.ts` (limpieza del cuerpo y decodificación de la portada) y `integracion/noticias.http.int.test.ts` / `noticias.avisos.http.int.test.ts` (portada obligatoria, cuerpo limpio, detalle y visibilidad, noticias anteriores). La interfaz se revisó en un navegador (Edge sin cabeza) con datos de ejemplo: mosaico de 4 y 2 columnas, selector de tamaño, punto de enfoque y editor.
- **Pendiente, a propósito:** avisar a quien se le habilita o revoca el permiso de publicar; avisar al personal (hoy solo a docentes, estudiantes y acudientes); correo (el canal de M28 aún no envía); varias imágenes por noticia; reprogramar una noticia que ya salió; calendario mensual de eventos; que `afecta_clases` alimente la carga institucional; enlazar una noticia de reunión de padres con una citación (M24); notificar a quien se le habilita.

### Asistente flotante de navegación

- **Menú lateral y encabezado** (`components/layout/`): el layout ocupa la altura de la ventana (`h-dvh`) y **solo `<main>` se desplaza**; el menú (con scroll propio si es largo) y el encabezado quedan fijos. El menú se arma con `agruparMenu(items)` (`navigation.ts`, pura) a partir de `GRUPOS_NAV`: cada categoría lista sus rutas, no sale si el rol no ve ninguna, y una con una sola pantalla visible se muestra suelta. **Una pantalla nueva en `NAV_ITEMS` se agrega también a la categoría que le corresponda en `GRUPOS_NAV`** (si no, queda suelta arriba) y a `PALABRAS_CLAVE_POR_RUTA`. `MenuLateral` abre sola la categoría de la pantalla activa y recuerda las abiertas en `localStorage` (solo comodidad); cerrada, la categoría suma los puntos rojos de sus pantallas. `Mi cuenta` (`soloEncabezado: true`) no está en el menú ni en los accesos del Inicio: es el botón de usuario junto a la campanita.

Botón flotante en `AppShell` (`components/asistente/AsistenteFlotante.tsx`) que lleva al usuario a la pantalla que busca. Reglas que no se ven leyendo un solo archivo:

- **Solo ofrece pantallas que el rol puede abrir**: recibe los `items` de `NAV_ITEMS` ya filtrados por rol y modalidad. **Una pantalla nueva en el menú se suma también a `PALABRAS_CLAVE_POR_RUTA`** (`lib/asistente.ts`: descripción + palabras clave) o el asistente no la conocerá bien.
- **Dos niveles**: `POST /asistente/orientar` (`asistente.service.ts`, Claude con una herramienta forzada que elige ruta) y, si falla o no hay `ANTHROPIC_API_KEY` (503), la búsqueda local por palabras clave (`buscarDestinos`). La salida del modelo se valida (`utils/asistente.ts#validarRespuesta`): una ruta o grado que no estaba en la lista enviada se descarta.
- **Abrir un grado**: una pantalla con `aceptaGrado: true` en el catálogo acepta `?grado=<id>` (hoy solo Plan de estudios, que abre el nivel de ese grado y resalta su columna).
- **El botón se arrastra** (mouse o dedo, `useBotonArrastrable`): queda dentro de la ventana, la posición se recuerda en el navegador
  (`localStorage`, solo comodidad) y un movimiento menor a 5 px es un clic. El chat sigue al botón y se cierra con clic fuera, Escape o la X.
- Variables: `ANTHROPIC_API_KEY` (opcional), `ASISTENTE_MODELO` (por defecto `claude-haiku-5-5`). Límite de 20 preguntas/min por IP.

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

### Matricular a los estudiantes ya registrados (script)

- `npm run matricular:estudiantes` (`backend/scripts/matricularEstudiantes.ts`) matricula a los estudiantes activos sin matrícula viva en el año de trabajo (EN_CURSO o el más reciente sin cerrar) llamando al mismo `createEnrollment` de secretaría (cupo, folio, checklist): nacen **condicionales** con plazo de compromiso (`--dias-compromiso`, 30 por defecto) y pasan a definitiva al aprobarse sus documentos. El estudiante no guarda su grado, así que los reparte en orden (grado, grupo) llenando cada grupo hasta su cupo; `--grado=` y `--grupo=` acotan, `--tipo=` fija el tipo de ingreso (NUEVO por defecto). **Solo simula** salvo `--aplicar`.

### Simulación multi-año de un colegio (script, base aparte)

- `npm run sim` (`backend/scripts/simulacion/`, guía en su `LEEME.md`) llena la base **`klassy_sim`** (el nombre debe contener `sim`; se niega a correr sobre una base con usuarios que no creó) y `uploads-sim/` con un colegio pequeño ficticio, por fases con respaldo (`respaldos-sim/`). Todo número del colegio vive en `config/colegio-pequeno.json`.
- **Todo pasa por la API** (servidor en proceso, un token por persona: ADMIN, coordinación, secretaría, cada docente), así cada paso respeta las reglas y deja auditoría; las únicas escrituras directas son el primer ADMIN y el catálogo de grados (como `npm run seed`).
- **Reloj simulado** (`nucleo/reloj.ts`, se importa antes que todo): reemplaza `Date` por una subclase con desfase para que ventanas, «no futura» y `createdAt` caigan en la fecha del paso. Mongoose mide su latido con ese reloj: el orquestador corre `_lastHeartbeatAt` en cada salto (si no, las transacciones esperan una reconexión que nunca llega).
- Lo propio de la simulación va en colecciones `sim_*` (`sim_fases`, `sim_registro` clave→id, `sim_perfiles` = la «verdad oculta» de cada estudiante, para evaluar la IA, nunca para entrenarla). Funciones puras con pruebas en `tests/simulacion.test.ts` (reparto de carga docente, perfiles, festivos).
- **Un periodo** (`fases/periodo.ts`, `logica/notas.ts`): una cola de eventos con fecha (el reloj salta a cada uno antes de llamar a la API); publicar una actividad agenda las entregas de sus estudiantes en esa misma cola. La nota de cada actividad sale de la habilidad del estudiante en la familia del área (`habilidad_area`), el tipo de nota de la asignatura, la tendencia y la volatilidad; lo no entregado vale 1.0 (regla de este colegio) y la entrega tardía resta décimas. Las recuperaciones usan la política de M18 de la simulación y su ventana del calendario. **Asistencia y convivencia** (`fases/asistenciaConvivencia.ts`, reglas puras `logica/asistencia.ts`): cada docente sube la cuadrícula de M13 cada `dias_por_registro` días lectivos, solo en los días que el horario publicado dicta su clase; la inasistencia se decide **por estudiante y día** (el azar se pide con esas claves, así falta a todas las clases del día) y una falta sin excusa el día de una actividad presencial la deja en 1.0. Los docentes registran faltas leves del manual (`POST /observaciones/faltas`) y reportan lo grave como reporte urgente (`POST /observaciones/reportes-urgentes`, con la contención) y la coordinación de convivencia abre un caso por cada solicitud cada 5 días lectivos. Asistencia y faltas no se pueden rellenar en años cerrados (la API exige el año EN_CURSO): para tenerlas en 2024–2025 se repite la simulación desde `2024/periodo-1`.
- **Encadena 2024, 2025 y 2026** (`orquestador.ts#planDeFases`): por año `preparar-anio`, `inicio-anio` (el primero crea el colegio, `faseInicioAnio`; los siguientes hacen `faseRematricula`), `periodo-1..4` y `cierre-anio`. 2024 y 2025 se cierran; 2026 llega hasta la **fecha de corte** y queda abierto.
- **Fecha de corte** (`config.fecha_corte` o `--corte=AAAA-MM-DD`; por defecto hoy): último día simulado. Una fase que empieza después no se planea y los eventos posteriores al corte dentro de la última fase se descartan (`nucleo/eventos.ts#ejecutarEventos`), así el periodo en curso queda «a medias» como un colegio real.
- **Cierre del año** (`fases/cierreAnio.ts`): promoción `CIERRE`, recuperación final anual por asignación, paz y salvo (el de 11° antes del cierre, para que se gradúen y no queden extemporáneos; ~4 % no lo confirma), `TRAS_RECUPERACION` y cierre de la vigencia. **Rematrícula** (`fases/rematricula.ts`): rollover de M19 por sede y grado; 5°→6° cambia de sede y el rollover responde `SIN_CUPO`, por eso secretaría los matricula directo; se descarta la lista de espera, se llenan los grupos con estudiantes nuevos (`soloNuevos`), se formalizan las pre-matrículas y se activa el año. **Vida del año** (`fases/vidaEscolar.ts`): retiros y traslados desde el periodo 2, servicio social (10°: 40 h, 11°: 80 h) y Saber 11. El perfil oculto evoluciona de un año al siguiente (`logica/trayectoria.ts`, pura y con tests).
- **Defecto real del backend que la simulación destapó:** el índice único de folio es `(numero_libro, numero_folio)` sin el año, pero el contador de folios es anual; en el segundo año el libro 1 repite folios y da 409. La simulación usa un libro por año (`libroDelAnio`); no se corrigió el backend (fuera de alcance).

- **Exportador para el módulo predictivo** (`npm run sim:exportar`, `scripts/simulacion/exportar.ts`, reglas puras `logica/exportacion.ts` con tests en `tests/simulacion.test.ts`): solo lee `klassy_sim` y escribe en `backend/exportacion-sim/` (git-ignorada) una fila **estudiante × corte** (`periodo_corte` 1..n−1) con entradas 0–1 calculadas solo con lo cerrado hasta ese periodo y la etiqueta `pierde_anio` del cierre de M19; parte entrenamiento/prueba **por año**; `ratio_inasistencias` = fallas sin justificar ÷ registros de M13 y `alertas_convivencia` = faltas II (1 punto) y III (2) como presunto responsable ÷ `TOPE_ALERTAS_CONVIVENCIA` (4), con tope 1; la Tipo I no es alerta. Ver el LEEME de la simulación.

### Módulo predictivo escolar (local, Brain.js) — estado: backend y pantallas completos

Todo vive en **su propia carpeta**: `backend/src/modulos/predictivo/` (rutas `/predictivo`, controlador, validador, `models/`, `services/`, `utils/`, `constants/`, el hilo `entrenamiento.worker.ts` y `modeloDemostracion.ts`); fuera de ella solo hay cambios mecánicos (montar la ruta, arrancar la cola en `server.ts`, tres acciones de auditoría, la dependencia `brain.js`). La red corre **en el propio servidor**: ningún dato sale de la instalación. Reglas que no se ven leyendo un solo archivo:

- **Qué predice (decisión del usuario):** la probabilidad de que un estudiante **pierda una asignatura en el año**, por estudiante y asignatura, con lo cerrado hasta un corte. El **riesgo de no promoción** no lo aprende la red: se deriva con la **política del colegio** pasando 2000 escenarios (Monte Carlo con semilla fija, `utils/riesgoPromocion.ts`) por el **motor real de M19** (`evaluarPromocion`), así respeta umbrales, imprescindibles, recuperación e inasistencia del SIEE. Preescolar no se analiza (no reprueba).
- **Entradas** (`ENTRADAS_MODELO`, `utils/caracteristicas.ts`, puras y con tests; todas 0–1): nota de la asignatura y del último periodo, tendencia, promedio general, proporción de asignaturas perdiendo, actividades no entregadas, inasistencia de la asignatura y general (sin justificar, M13), alertas de convivencia (II = 1, III = 2, tope 4; la Tipo I no cuenta), **repitente** (lo pidió el usuario: es un dato a tener en cuenta), periodo normalizado, si hay notas y la nota del año anterior (misma asignatura, si no el promedio del área, si no el general). **Corte 0** = periodo recién abierto: sin notas del año, predice con el año anterior. Cambiar las entradas exige subir `VERSION_ENTRADAS`: los modelos de otra versión dejan de usarse y no se activan.
- **Etiqueta:** la asignatura se perdió si la nota antes de la recuperación final (`entrada.asignaturas[].nota_antes` del cierre vigente de M19) quedó por debajo de la aprobatoria. Solo años `CERRADO` entran al entrenamiento (`conjunto.service`). Las entradas se calculan con el mismo código para entrenar y para analizar (`datos.service`), así no hay dos fórmulas.
- **Entrena el ADMIN desde su pantalla, nunca desde la terminal** (`POST /predictivo/modelos/entrenar`, 202). La petición entra a una **cola en Mongo** (`ModeloPredictivo`, `en_cola`; índice único parcial: un entrenamiento a la vez, 409 si ya hay uno) y la procesa `iniciarColaEntrenamiento()` en un **`worker_threads`** para no frenar la API (reclamo atómico con reserva de 30 min, como la cola de correo). Cada versión guarda métricas sobre datos que no vio (`utils/metricas.ts`: AUC, Brier contra la prevalencia, exactitud, sensibilidad, especificidad y calibración en 10 tramos), con prueba **por año** (el último año cerrado) si hay dos o más **y ese año no trae filas de un tipo que el entrenamiento nunca vio** (corte 0, o con/sin año anterior: el primer año de un colegio en Klassy no tiene ninguno de los dos, y probar contra él daba un Brier engañoso); si no, por estudiantes (`partirParaPrueba`). En desarrollo (`tsx`) el hilo arranca con un cargador de una línea que registra `tsx/cjs`; compilado usa el `.js` de `dist`. **Solo reemplaza al modelo activo si pasa la prueba** (`UMBRALES_ACEPTACION`: AUC ≥ 0.7, Brier mejor que la referencia, mínimo 50 filas de prueba); si no, queda `RECHAZADO` con el motivo y el activo no cambia. Un fallo inesperado queda `FALLIDO` con un mensaje genérico (el detalle técnico va al registro del servidor, nunca a la pantalla); solo «no hay años cerrados» se le dice tal cual al ADMIN (`MotivoParaElAdmin`). El ADMIN puede volver a activar una versión anterior que pasó (`POST /modelos/:id/activar`). Con menos de `ANIOS_REALES_MINIMOS` (2) años cerrados el modelo se marca **de demostración**.
- **Modelo de demostración** (`modeloDemostracion.ts`): se genera con la simulación (`npm run predictivo:modelo-demo`, solo lee `klassy_sim`) y se usa mientras el colegio no tenga un modelo propio activo; la pantalla lo avisa. El actual salió de 2024–2025 de la simulación (prueba por estudiantes: AUC 0.98, Brier 0.026 contra 0.047 de referencia); los pesos se guardan con nueve cifras (son float32). Sin ningún modelo, el análisis muestra notas y nota requerida sin riesgo estimado.
- **Quién ve qué** (`puedePredictivo`/`vistaDelAnalisis`, `utils/permisos.ts`, pura con tests): entrena y ve versiones solo el ADMIN; buscan a **cualquier estudiante** con matrícula activa ADMIN, COORDINADOR, COORDINADOR_CONVIVENCIA, ORIENTADOR y DOCENTE (decisión del usuario); el **estudiante** ve el suyo (`GET /predictivo/mio`, solo con matrícula activa: 409 si no) y el **acudiente** el de cada hijo vinculado (`GET /predictivo/hijos/:id`, `exigirAcudienteDe`; un estudiante ajeno es 404). **El estudiante y su familia ven el FODA y la nota requerida, nunca el porcentaje ni el nivel de riesgo** (el servidor los quita del JSON). La convivencia **cuenta en el cálculo**, pero solo se **nombra** en el FODA a ADMIN y COORDINADOR_CONVIVENCIA. Cada consulta se audita (`PREDICTIVO_ANALISIS_CONSULTADO`, sin contenido).
- **Nota requerida** (`utils/notaRequerida.ts`, pura): cuánto necesita en los periodos que faltan para aprobar la asignatura (ponderado por el porcentaje de M05, sin contar exentos): APROBADA, ASEGURADA, ALCANZABLE (con la nota), NO_ALCANZA, PERDIDA o SIN_DATOS. Lo ya decidido por las notas manda sobre la red (probabilidad 0 o 1).
- **FODA** (`utils/foda.ts`): frases con marcas `{asignatura}`, `{nota}`… elegidas por reglas sobre los datos (por asignatura y general), no texto libre. Una frase nueva es una entrada en `PLANTILLAS_FODA` con su cuadrante y su audiencia; las notas se escriben con los decimales de la escala del año (`decimales`, que también viaja en el análisis para la pantalla: «3.0», no «3»); los conteos van con `cantidad(n, singular, plural)` («1 falta», «2 faltas»). La fortaleza general «ya tiene asegurado aprobar: …» lista las asignaturas con nota requerida ASEGURADA o APROBADA.
- **Caché:** el análisis de un estudiante se memoriza `TTL_ANALISIS_MS` (90 s) por estudiante, año, modelo y vista.
- **Pruebas:** `tests/predictivo.test.ts` (entradas, nota requerida, métricas, riesgo con la política de M19, FODA, permisos y un entrenamiento real de Brain.js) y `tests/integracion/predictivo.http.int.test.ts` (rutas, permisos por rol, que el estudiante y el acudiente no reciben el porcentaje, buscador, cola y su 409, fallo claro sin años cerrados).
- **Pantallas** (`frontend/src/modulos/predictivo/`, hook `usePredictivo.ts`, textos en `lib/presentacion.ts`): `PredictivoPage` (`/predictivo`, ADMIN, coordinaciones, orientación y docentes: buscador de estudiantes y su análisis; solo el ADMIN ve la pestaña «Entrenar la IA», `PanelModelos`, con versiones, métricas, estado y «Usar esta versión»), `MiAnalisisPage` (`/mi-analisis`, ESTUDIANTE) y la pestaña «Análisis y FODA» del portal del acudiente (`PortalAnalisis`, por hijo, solo con matrícula activa). `AnalisisEstudiante` y `FodaCuadrantes` son compartidos: el porcentaje y el nivel de riesgo solo se dibujan si el servidor los manda. Las notas se escriben con `decimales` de la escala. Se revisaron en un navegador contra `klassy_sim` (admin, docente, estudiante en escritorio y móvil, acudiente con un hijo activo y uno retirado).
- **Pendiente, a propósito:** explicar por qué la red dio una probabilidad (importancia de cada entrada); reentrenar solo al cerrar un año; avisos (M28) a quien tiene riesgo alto.

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

### Una matrícula viva por estudiante y año (M04)

- **Un estudiante tiene una sola matrícula «viva» (`PREINSCRITO`, `MATRICULADO_CONDICIONAL` o `MATRICULADO_DEFINITIVO`, `ESTADOS_MATRICULA_VIVOS`) por año lectivo.** Antes nada lo impedía y un estudiante quedaba en 10-A y 11-A a la vez, con dos folios.
  Lo garantizan dos capas: `exigirSinMatriculaViva` en `createEnrollment` (409 que dice en qué grupo ya está, con su estado y folio, manda a «Cambiar grupo» y trae `details.enrollment_id`) y el índice único parcial `matricula_viva_unica`
  (`student_id` + `academic_year_id`, solo con esos estados) en el modelo, que cubre cualquier otro camino y la carrera entre dos secretarias. `RETIRADO` y `ANULADO` son historial y no bloquean una matrícula nueva en el mismo año.
  La aprobación de una preinscripción crea al estudiante nuevo, así que no puede chocar.
- **Mover a un estudiante de grupo o de grado (p. ej. corregir 10-A a 11-A) nunca crea otra matrícula**: es `cambiarGrupo` (`PATCH /enrollments/:id/grupo`, botón «Cambiar grupo» del expediente), que conserva el folio, el checklist y el historial y mueve los cupos.
- **Bases con duplicados:** crear el índice falla mientras existan. `npm run migrate:matricula-unica` lista los estudiantes con más de una matrícula viva en el año; con `--aplicar` conserva la más reciente (`--conservar=antigua` la primera) y **anula** las demás con motivo
  (libera el cupo; el folio queda como asiento del Libro, no se renumera), reemplaza el índice no único `student_id_1_academic_year_id_1` y crea el único. Por defecto solo simula: revisar la lista y hacer respaldo de Mongo antes de aplicar. Notas, asistencia y demás datos
  siguen colgando del grupo de la matrícula anulada: si eran de la que se conserva, hay que revisarlos a mano.
- Pruebas: `tests/integracion/matriculaUnica.int.test.ts` (base real; no se pudo correr donde no hay binario de MongoDB).
- **Elegir al estudiante en «Formalizar matrícula»** (`SelectorEstudianteMatricula`, `FiltrosRapidos` en `components/ui/`): filtros rápidos *Disponibles* (por defecto), *Ya matriculados*, *Retirados / Reingreso* y *Todos* sobre **un solo** buscador (`SelectBuscable`); en *Todos* cada opción lleva su badge
  (`OpcionBuscable.etiqueta`, opcional). La situación sale del servidor (`GET /enrollments/estudiantes-situacion?academic_year_id=` → `listarSituacionEstudiantes`; regla pura `situacionDeEstudiante`, `utils/situacionEstudiante.ts`, espejo de textos en `lib/situacionEstudiante.ts`):
  `MATRICULADO` (matrícula viva en el año: manda sobre todo lo demás), `GRADUADO`, `USUARIO_INACTIVO`, `REINGRESO` (expediente M03 `RETIRADO` o `INACTIVO`) o `DISPONIBLE`. Con un matriculado elegido el botón de guardar se deshabilita y un banner da su grupo y folio con acceso a su expediente.
  **Reingreso guiado:** `createEnrollment` responde 409 si el expediente está RETIRADO/INACTIVO y no llega `reingreso: true`; con él, en la misma transacción el expediente vuelve a `ACTIVO` y se audita `MATRICULA_REINGRESO`. La pantalla pide marcar «Confirmo la reincorporación» y propone el tipo de ingreso ANTIGUO. El servidor sigue rechazando una segunda matrícula viva (409) aunque se salte la pantalla.


### Matrícula por grado (M04, lee M19) — segunda forma de matricular, la de siempre no se toca

- **«Matrículas» → pestaña «Por grado»** (`MatriculaPorGrado`, `GET /enrollments/estudiantes-por-grado?academic_year_id=`, `listarEstudiantesPorGrado`): una pestaña por grado donde quien cursó 5° el año anterior aparece en la de 6°, con los mismos filtros de siempre (*Disponibles / Ya matriculados / Retirados-Reingreso / Todos*), un buscador, y la casilla «incluir a quienes cursaron este grado» para ver también a quienes repiten. Además hay **«Sin grado registrado»** (sin matrículas anteriores) y **«Egresados»** (terminaron el último grado: no salen en ningún grado, y esto resuelve a los de 11°). «Matricular» abre el formulario de siempre con el estudiante y el grado ya elegidos; **«Matricular existente» y «Matrícula exprés» siguen igual y permiten cualquier grado** (hay promociones por decisión).
- **No hay un «nivel» guardado en el estudiante: se deriva** (`utils/ubicacionEstudiante.ts`, pura y con tests; `ubicacionEstudiante.service.ts` solo lee). Orden: matrícula viva del año (su grado, aunque difiera del historial: «Fuera de su nivel») → retirada del año (vuelve a ese grado) → la última matrícula cursada en un año anterior (no cuentan ANULADA ni PREINSCRITO) con su **cierre vigente de M19** vía `destinoDeRollover` (promovido → siguiente, no promovido → mismo, promovido en el último grado → egresado) → retirada en un año anterior (vuelve a ese grado) → sin cierre o con uno pendiente (**se propone el siguiente grado y se avisa** que secretaría lo confirme con el boletín o certificado) → sin historial. El expediente M03 `GRADUADO` también manda a egresados (hoy nada lo escribe: el egresado sale del cierre de M19). `no_renueva_cupo` no cambia el grado, solo avisa. Los años se ordenan por número y creación, como el resto (un mismo número puede repetirse).
- **El único dato nuevo guardado** es `Enrollment.ultimo_grado_aprobado` (`Grade.numero`, opcional): lo declara secretaría al matricular a quien **no tiene historial** (o a un estudiante exprés) según el certificado que trae, y solo sirve para el aviso de abajo.
- **El grado elegido solo advierte, no bloquea** (`compararGradoElegido`, `verificarGradoDeMatricula`): si el grado del grupo no es el que indica el historial (o el último aprobado declarado, que manda), el formulario muestra el aviso y pide un **motivo escrito** (mínimo 10 caracteres, `motivo_grado`); sin él el servidor responde 409 (`details.requiere_motivo_grado`) y con él matricula y audita `MATRICULA_GRADO_CON_MOTIVO` (con el motivo). Sin historial ni certificado no hay con qué comparar y no se pide nada. **Solo lo activa `POST /enrollments`** (el formulario de secretaría): el rollover de M19, la aprobación de preinscripciones y el script de matrícula masiva deciden el grado por su propia regla y no pasan por aquí. `veredictoDeGrado` (`lib/matriculaPorGrado.ts`) es el espejo del frontend: si cambia una, cambia la otra.
- **Pruebas:** `tests/ubicacionEstudiante.test.ts` (ubicación y comparación de grado). La interfaz se revisó en un navegador con la API simulada (pestañas, filtros, casilla de quienes repiten, formulario con certificado de 5° y grupo de 1°); las pruebas de integración no se pudieron correr donde no hay binario de MongoDB.
- **Pendiente, a propósito:** nada escribe `StudentProfile.estado = GRADUADO` (el egresado se deriva); matricular en lote desde la lista (hoy es de a uno; el masivo es el rollover de M19); un filtro por sede/jornada en la lista.

### Documentos de matrícula y paz y salvo de fin de año (M04)

- **Compuerta de la definitiva.** `MATRICULADO_DEFINITIVO` solo existe con todos los documentos obligatorios del checklist `APROBADO` (`documentosObligatoriosPendientes`,
  `utils/documentosMatricula.ts`). `createEnrollment` ya no admite `estado_inicial: DEFINITIVO` (409: nace condicional) y `updateEnrollmentStatus` responde 409 con la lista de
  lo que falta. Pasa sola a definitiva al aprobar el último documento (`revisarDocumento`, sin cambios). Para algo que no aplica a un estudiante, se quita del checklist.
- **El catálogo de documentos es configurable** (`RequisitoDocumental`, `/requisitos-documentales`, pestaña «Documentos que se piden» de `EnrollmentsPage` (`/admin/enrollments?pestana=documentos`, componente `CatalogoDocumentosMatricula`; no tiene ruta ni ítem de menú propios); lo editan ADMIN, COORDINADOR y SECRETARIA, que ya agregan y quitan documentos por matrícula; todo queda en auditoría `REQUISITO_DOCUMENTAL_*`). Cada requisito tiene clave estable (no se edita), nombre, indicación, categoría, obligatorio, **niveles y grados** (`grados_numeros`, números de grado -2..11, vacío = todos), **tipos de ingreso** (vacío = todos) y una `condicion_especial` de lista cerrada (`NINGUNA`, `CON_DISCAPACIDAD`, `ACUDIENTE_NO_PADRE_MADRE`: una condición nueva es una entrada en `constants/requisitosDocumentales.ts` y su caso en `utils/requisitosDocumentales.ts#cumpleCondicion`, no fórmulas libres). `aprobacion_automatica` (hoy solo `PAZ_Y_SALVO_ANIO_ANTERIOR`) la fija el sistema: ese documento no se elimina ni cambia de clave. **`generarChecklistMatricula` ya no arma ningún checklist**: la selección es `seleccionarRequisitos` (pura, con tests) sobre el catálogo activo (`generarChecklistDesdeCatalogo`); la función vieja se conserva solo como referencia y `tests/requisitosDocumentales.test.ts` comprueba que el catálogo sembrado pide **exactamente lo mismo** en las 448 combinaciones de grado × ingreso × discapacidad × parentesco. El catálogo se **siembra una sola vez** con lo de siempre (`REQUISITOS_INICIALES`, marca en `Counter`; lo que el colegio elimine no vuelve; `npm run migrate:requisitos-documentales`, idempotente, no toca ninguna matrícula). Cada ítem del checklist **copia** nombre, indicación y categoría al crearse (`nombre_personalizado` ya lleva el nombre resuelto; `{grado_anterior}` se reemplaza por el número anterior), así editar o desactivar el catálogo no cambia matrículas existentes: llega con «Sincronizar requisitos». Los ítems anteriores sin copia leen las constantes de partida (`nombreDeItem`/`indicacionDeItem`/`categoriaDeItem`). `tipo_documento` ya no es un enum sino la clave (`/^[A-Z0-9_]{2,60}$/`); un documento adicional de una matrícula recibe una clave propia `OTRO_XXXXXX` (antes todos eran `OTRO_DOCUMENTO` y las operaciones actuaban sobre el primero). Un documento usado por alguna matrícula no se elimina, se desactiva. Una diferencia con lo anterior: el certificado de 10° se llama «Certificado de 9° aprobado» (sin el sufijo «cierra la básica»; el colegio puede escribirlo en la indicación).
- **Quién subió el documento y qué se revisa.** Cada ítem guarda `cargado_por_tipo` (`FAMILIA` desde el sitio público o el portal, `PERSONAL` desde el expediente) y `cargado_por`. Lo de la familia queda `CARGADO` y entra a «Documentos por revisar» (que ahora muestra «Subido por» y filtra por familia/personal). **El personal sube con la casilla «Ya verifiqué el original: aprobar al subir» (marcada por defecto)**: el documento queda `APROBADO`, con quien lo subió como revisor, puede pasar la matrícula a definitiva y no genera tarea; sin la casilla queda por revisar (p. ej. secretaría escanea y otra persona aprueba). El punto rojo de la bandeja no se enciende para quien subió el archivo. `cargarDocumento` recibe `{ id, tipo, aprobar? }`.
- **Qué documentos pide cada grado** (reglas de partida del catálogo; antes `generarChecklistMatricula`, hoy `seleccionarRequisitos` para crear, sincronizar, preinscribir y previsualizar): quien llega de otro colegio (`NUEVO`/`TRASLADO`)
  trae el certificado del grado que acaba de aprobar: **6° → `CERTIFICADO_QUINTO_PRIMARIA`**, **10° → 9°** (`CERTIFICADO_GRADO_ANTERIOR` con `nombre_personalizado` «Certificado de 9° aprobado (cierra la básica
  secundaria)»), y en los demás grados (2° a 5°, 7° a 9°, 11°) el del grado inmediatamente anterior; para entrar a 1° y a preescolar no se pide. Los antiguos y repitentes no traen certificado (el boletín ya está
  aquí), solo el paz y salvo de fin de año. Lo común (identidad, foto, EPS, acudiente), vacunas hasta 2°, notas anteriores y SIMAT, servicio social en 11° por traslado, diagnóstico por discapacidad y custodia si el
  acudiente no es padre ni madre siguen igual. Las matrículas viejas que ya traen `CERTIFICADO_QUINTO_PRIMARIA` en 7°–11° lo conservan (se corrigen quitándolo desde el expediente).
- **Verlos antes de matricular**: `GET /enrollments/documentos-previstos?group_id=&tipo_ingreso=&student_id?` (STAFF) devuelve lo que el checklist pedirá (nombre, indicación, categoría, obligatorio) sin crear nada;
  el drawer «Formalizar matrícula» lo muestra en `DocumentosPrevistos` (todos «No enviado»: **en el drawer no se suben documentos**) y al crear la matrícula el drawer muestra la confirmación con el botón «Ir al expediente»
  (`/admin/enrollments/:id`; no navega solo), donde se cargan, aprueban y rechazan. La lista de matrículas lleva la columna «Documentos» (aprobados/obligatorios, en revisión, rechazados) leída del `checklist` que ya viene en el listado.
- **Bandeja «Documentos por revisar»** (`GET /enrollments/documentos-por-revisar`, `DocumentosPorRevisarPage` en `/admin/documentos-por-revisar`, STAFF): una fila por documento
  `CARGADO` de matrículas no terminales, del más antiguo al más reciente, con ver / aprobar / rechazar sin abrir el expediente.
- **Paz y salvo de fin de año** (`PazYSalvo`, `/paz-y-salvo`, `PazYSalvoPage` en `/paz-y-salvo`): un registro por estudiante y año que termina (`CARGADO` → `CONFIRMADO` | `RECHAZADO`;
  «sin cargar» se deriva). **Confirmar no exige archivo** (es el «check»); rechazar exige motivo. No se modifica en un año `CERRADO`. El aviso fijo de la pantalla dice que se usa al terminar el periodo final.
  Quién lo gestiona (`permisoPazYSalvo`, `utils/permisosPazYSalvo.ts`, pura con tests, sin herencia): ADMIN, COORDINADOR y SECRETARIA siempre; **DOCENTE solo si
  `Institution.paz_y_salvo_docentes`** (Configuración institucional, apagado por defecto), y entonces solo para los estudiantes de los grupos donde dicta clase o dirige, sin poder quitar una
  confirmación (eso es del personal de matrículas). Con la opción apagada el docente ve el motivo, no un vacío. Los soportes van a `uploads/paz-y-salvo/<año>/` (firma de bytes, 5 MB, se bajan con sesión y se auditan).
- **Lo lee la matrícula del año siguiente.** El checklist de `ANTIGUO` y `REPITENTE` lleva el documento `PAZ_Y_SALVO_ANIO_ANTERIOR` (el de `NUEVO`/`TRASLADO` sigue siendo el de SIMAT). Si el estudiante ya tiene
  un paz y salvo `CONFIRMADO` de un año anterior (`pazYSalvoConfirmadoPrevio`), el documento nace `APROBADO` sin archivo propio (en `createEnrollment` y en `sincronizarRequisitosMatricula`). Si se
  confirma después, `aprobarEnMatriculasPosteriores` lo aprueba en las matrículas preinscritas/condicionales/definitivas del año siguiente y promueve a definitiva si ya está completo; quitar la confirmación devuelve
  a `PENDIENTE` solo lo aprobado automáticamente (sin `archivo_path`) y baja a condicional. Matrículas existentes de antiguos reciben el documento nuevo con «Sincronizar requisitos».
- Pruebas: unitarias en `tests/pazYSalvo.test.ts` y `tests/checklistMatriculas.test.ts`; con base real en `tests/integracion/pazYSalvo.int.test.ts` (compuerta, bandeja, permisos, propagación).
- **Pendiente, a propósito:** que el estudiante o el acudiente suban su propio paz y salvo desde un portal (M27: hoy lo sube el personal o, si se habilitó, el docente); avisos a los docentes al terminar el periodo final (M28);
  confirmación masiva por grupo; filtrar la bandeja por grupo en pantalla (el endpoint ya lo acepta).

### M27 (Portal del acudiente) — estado: núcleo completo

Backend `/portal` (`portalAcudiente.routes.ts` → `portalAcudiente.controller.ts` → `portalAcudiente.service.ts`; validador `portalAcudiente.validator.ts`),
frontend `PortalAcudientePage` (`/portal`, solo perfil ACUDIENTE) con `hooks/usePortal.ts` y `components/portal/`. Reglas que no se ven leyendo un solo archivo:

- **Cero datos propios: el portal solo lee y reusa.** Notas = `notasEstudiante.service` (M12, `misNotas`); inasistencias = `listarInasistencias` (M13);
  convivencia = `observadorDelEstudianteParaAcudiente` (M14, mismas reglas de `observadorParaLaFamilia` que el estudiante: nunca confidenciales ni el detalle
  de una falta II/III; se audita `CONVIVENCIA_OBSERVADOR_CONSULTADO_POR_ACUDIENTE`); documentos = checklist de M04 (`construirDetalle`, `cargarDocumento`);
  certificados = M26 (`expedirCertificado`, `dibujarCertificadoEmitido`). Las pantallas de notas y observador del estudiante y del acudiente comparten componentes
  (`TarjetaNotasAsignatura` con `paraFamilia`, `ObservadorFamilia`): un cambio se hace una vez.
- **Acceso por vínculo, siempre en el servidor.** Todas las rutas exigen perfil activo ACUDIENTE; cada ruta de un hijo vuelve a comprobar `Guardian(user_id, estado≠inactivo)`
  + `StudentGuardian` (`exigirAcudienteDe`). Un estudiante que no es hijo suyo responde **404** (igual que si no existiera). El vínculo lo crea secretaría en M03
  («Habilitar portal»); sin vínculo el acudiente ve la lista vacía. El hijo seleccionado viaja en la URL (`?hijo=&pestana=`) y cada pestaña lleva `key` con el id
  del estudiante, así cambiarlo recarga todo.
- **Qué ve según la matrícula** (`matriculaVigente`): con matrícula CONDICIONAL o DEFINITIVA, notas/inasistencias/convivencia; con la preinscripción en revisión solo
  Documentos (la pestaña por defecto) y un aviso en las demás. Boletín: no tiene pestaña propia; el `/report-card` existente ya lo sirve al ACUDIENTE publicado.
- **Documentos pendientes** (`POST /portal/hijos/:id/documentos/:tipo`, multipart `file`): mismo guardado que secretaría y la preinscripción pública
  (`guardarArchivoDeDocumento`, 5 MB, firma de bytes). Solo mientras la matrícula es PREINSCRITO/CONDICIONAL (`ESTADOS_QUE_ADMITEN_DOCUMENTOS`) y un APROBADO no se
  reemplaza. El documento queda `CARGADO` y aparece en «Documentos por revisar» de secretaría; la auditoría (`DOCUMENTO_CARGADO`) lleva el usuario acudiente.
- **Certificados de autoservicio (M26)**: `TipoCertificado.autoservicio_acudiente` (**apagado por defecto**; solo el ADMIN lo enciende en «Tipos de documento»; no
  se admite en un tipo con la fuente `DEPENDENCIAS`, p. ej. el paz y salvo, que sigue siendo de secretaría). El acudiente solo manda tipo + destinatario: el contenido,
  las firmas y el consecutivo salen del mismo `expedirCertificado` de secretaría (`autoservicio=true`), con la política de firmas del tipo; la de Rectoría solo se
  estampa si `permitir_firma_rectoria_a_secretaria` está encendido. Máximo `MAX_CERTIFICADOS_AUTOSERVICIO_POR_DIA` (3) por estudiante y tipo cada 24 h (429). Un tipo con
  valoraciones sigue respondiendo 409 hasta que exista M19. Las opciones de destinatario que leen la EPS (`fuente_entidad`) no se ofrecen en el portal. Los emitidos se
  reimprimen con `dibujarCertificadoEmitido` y quedan en el historial de secretaría.
- **Pruebas:** `tests/rolesMultiples.test.ts`, `tests/certificadosAutoservicio.test.ts` y `tests/integracion/portalAcudiente.int.test.ts` (base real; no se pudo correr donde no había binario de MongoDB).
- **Pendiente, a propósito:** pestaña de boletín en el portal; justificar inasistencias desde el portal (la API de M13 ya está lista); aviso al acudiente de documentos rechazados o notas publicadas (M28);
  paz y salvo subido por el acudiente (M04); solicitudes de otros certificados con aprobación humana.

### M28 (Notificaciones — campanita, puntos del menú y tablero de anuncios) — estado: núcleo completo

Backend `/notificaciones` (modelos `Notificacion`, `Insignia`, `Anuncio`; servicios `notificaciones.service`, `notificacionesEventos.service`, `destinatariosNotificacion.service`, `anuncio.service`; texto en `utils/notificaciones.ts`), frontend `Campanita` y `ContadorInsignia` (`components/notificaciones/`), `AnunciosPage` (`/anuncios`), hook `useNotificaciones.ts`. Reglas que no se ven leyendo un solo archivo:

- **Tres piezas, tres propósitos.** *Campanita* = alertas directas y críticas del perfil (`Notificacion`). *Puntos rojos* = contadores masivos sin push (`Insignia`, por usuario+perfil+ruta+pestaña): no tocan la campanita y se apagan al entrar al módulo (`AppShell` llama `POST /notificaciones/visto`) o, los de pestaña, al abrirla. *Tablero* = comunicados de ADMIN/COORDINADOR a perfiles (`Anuncio`, se archivan, no se borran; un anuncio ya vigente suma un punto en «Anuncios» a los perfiles destino, salvo al autor). Todo se acota al **perfil activo** (`req.user.rol`): un docente que también es acudiente tiene campanita y puntos distintos en cada perfil.
- **Dónde se ve el punto rojo.** En cada botón del menú lateral **y en cada tarjeta del Inicio** (`DashboardPage`, que es la navegación en pantallas pequeñas), sumando el contador del módulo y el de todas sus pestañas (`contadorDeRuta`). Dentro del módulo, `Tabs` acepta `contador` por pestaña; la pantalla usa `useContadoresDePestana(ruta, pestanaActiva, sufijo?)`, que devuelve el contador de cada pestaña y **apaga el de la que está abierta** (también la que abre por defecto). El `sufijo` es para pantallas que muestran un elemento a la vez: el portal del acudiente guarda `<pestaña>-<id del hijo>` (`pestanaDeHijo`), así abrir «Inasistencias» de un hijo no apaga el punto de otro. **Una campanita lleva a la pantalla exacta del evento** (la `ruta` se guarda por notificación: entrega nueva → página de la actividad, no el módulo). Los catálogos de actividades usan el mismo mecanismo: el botón de cada grupo del docente (`clase-<asignación>`, `pestanaDeClase`) y la tarjeta de cada asignatura del estudiante (`pendientes-<asignatura>`, `pestanaDeAsignatura`) llevan su punto; entrar a esa clase o asignatura —o a la actividad desde la campanita— lo apaga (`useContadoresDePestana(ruta, 'clase', asignaciónId)`), y el del menú sigue sumando todos. Las claves se arman igual en `constants/notificaciones.ts` y en el frontend (máximo 40 caracteres). El título del navegador muestra `(N) Klassy` con las alertas sin leer.
- **Agrupación estilo YouTube.** Una alerta sin leer por `(usuario, perfil, evento, entidad_id)` (índice único parcial `alerta_sin_leer_unica`, `leida:false`): `avisar` hace upsert con `$inc: {contador}` (un reintento ante E11000). Al leerla, el siguiente evento crea una fila nueva. **El texto no se guarda: se arma al leer** con `renderizarNotificacion(evento, contador, datos)` (pura, con tests), por eso «1 entrega» pasa a «145 entregas nuevas en la actividad X» sin reescribir nada. Una alerta crítica sin leer se marca con borde rojo en la campanita.
- **Canal de entrega** (`Notificacion.entregas[]`: `canal` CAMPANITA | CORREO, `estado` PENDIENTE | ENTREGADA). `METADATOS_EVENTO` define severidad y canales por evento (`FALTA_GRAVE`: CRÍTICA, campanita + correo). **El envío de correo no existe todavía**: el canal queda registrado como PENDIENTE para que un futuro emisor lo recorra. Los anuncios tienen `canales` por la misma razón.
- **Los emisores nunca rompen la acción de negocio** (`sinRomper`: try/catch + `console.error`) y se llaman con **una línea** desde el servicio dueño, después de su propia escritura. Mapa por perfil (campanita / punto):
  - *Docente*: entrega nueva M11 (campanita agrupada por actividad, «Tienes N entregas nuevas en la actividad X del grupo 10-A», que abre **la página de esa actividad** `/docente/actividades/<id>` / punto rojo en el botón del grupo, pestaña `clase-<asignación>`), plan devuelto o aprobado M07 (campanita / `/docente/planeacion` pestaña `aula` o `area`), cierre de periodo y recuperaciones o desarrollo institucional próximos (campanita, por el script diario).
  - *Coordinación / ADMIN*: plan en revisión M07 (`/admin/revision-planeacion` pestañas `aulas`/`areas`), justificación de inasistencia por revisar M13 (`/asistencia/gestion` pestaña `justificaciones`), documento de matrícula por revisar M04 (`/admin/documentos-por-revisar`), solicitud de admisión nueva (`/admin/admisiones`), cierre de periodo (campanita).
  - *Convivencia / Orientación*: reporte urgente (campanita crítica agrupada) o falta Tipo I escalada (punto rojo) (`/convivencia/solicitudes`, solo la sede), solicitud de apoyo M16 (`/inclusion` pestaña `solicitudes`), remisión a orientación M15 (`/orientacion/remisiones`).
  - *Estudiante*: actividad publicada M11 (campanita por asignatura, abre `/mis-actividades?asignatura=<id>` / punto rojo en la tarjeta de la asignatura, pestaña `pendientes-<asignatura>`), actividad calificada M12 (campanita, abre `/mis-actividades/<id>`, o `/mis-notas` si la actividad es presencial), boletín publicado M17 (campanita / `/report-card`), registro visible en el observador M14 (`/mi-observador`).
  - *Acudiente*: inasistencia nueva M13 (campanita agrupada por estudiante / `/portal` pestaña `inasistencias-<hijo>`), justificación revisada, registro visible en el observador y caso II/III abierto o escalado (`convivencia-<hijo>`; es CRÍTICA, solo a las familias de afectados y presuntos responsables, y **no lleva hechos ni nombres**), documento rechazado (`documentos-<hijo>`), boletín publicado.
- **Inasistencias: solo el paso a falla cuenta.** `registrarAsistencia` compara el estado anterior de cada estudiante con el nuevo (`nuevasFallas`, por planilla): volver a guardar una planilla, o cambiar de una falla a otra, no suma. Una falta justificada por su estado no es inasistencia. **El observador respeta la visibilidad de la familia**: una observación confidencial o de un tipo no visible al estudiante no genera ninguna alerta.
- **Avisos diarios automáticos**: el servidor los corre solo (`planificadorNotificaciones.service`, arrancado en `server.ts`: 30 s después de iniciar y luego cada hora; el reclamo `TareaDiaria` con `_id` `notificar-diario:<día Colombia>` garantiza una ejecución por día aunque haya varias instancias, y si falla se libera para reintentar). No se programa cron. `npm run notificar:diario` queda solo como disparo manual. Hacen: recordatorio de cierre de periodo (`DIAS_RECORDATORIO_CIERRE` = 7), desarrollo institucional (`DIAS_RECORDATORIO_EVENTO` = 3), **avisos de recuperaciones** (inicio y «mañana termina», ver M18) y actividades programadas que se publican ese día (solo las creadas antes de su fecha de apertura: las ya publicadas avisaron al crearse). Es idempotente mientras el aviso siga sin leer (agrupa en la misma alerta). **Reuniones de padres (módulo futuro)** entrará como un tipo más de evento del calendario en `recordarEventosDelCalendario`.
- **Transacciones**: `crearDesdeMatricula` (M16) avisa dentro de la transacción de la matrícula; si esa se deshace a lo sumo queda un punto de más que se apaga al entrar.
- **Pruebas:** unitaria `tests/notificaciones.test.ts` (textos, plural, sin filtrar hechos, clave de pestaña por hijo). Integración con base real (`tests/integracion/notificaciones.int.test.ts`: agrupación, aislamiento por perfil, puntos por pestaña, anuncios) escrita pero no ejecutada donde no hay binario de MongoDB. La interfaz no se probó en un navegador (solo compila: `tsc -b`, `vite build`).
- **Pendiente, a propósito:** envío real de correo y su reintento; un anuncio con fecha de publicación futura no suma punto el día que se publica; recordatorio de planes de aula por entregar y avisos de nueva asignación de carga (M08); punto en pantallas sin emisor (p. ej. seguimiento de notas, comité); aviso de justificación al estudiante.

### M24 (Agenda y reuniones — citaciones a acudientes) — estado: citaciones, correo en cola y confirmación

Backend `/citaciones` (modelos `Citacion`, `CitacionDestinatario`, `CorreoEnCola`; servicios `citacion.service`, `citacionRespuesta.service`, `citacionCorreo.service`, `colaCorreo.service`, `correo.service`; reglas puras `utils/citaciones.ts` y `utils/correoCitacion.ts`, tests en `tests/citaciones.test.ts`),
frontend `CitacionesPage` (`/reuniones`, ADMIN/COORDINADOR/DOCENTE), pestaña «Citaciones» del portal del acudiente (`PortalCitaciones`, M27) y `ConfirmarCitacionPage` (`/citacion/:token`, sin sesión). Hook `useCitaciones.ts`. Reglas que no se ven leyendo un solo archivo:

- **Dos clases de citación.** `GENERAL` (uno o más grupos **de una misma sede**, porque la reunión tiene un solo lugar; p. ej. entrega de boletines) y `PARTICULAR` (un estudiante; comportamiento o rendimiento). El modelo exige grupos o estudiante, nunca los dos. Solo hay agenda de citaciones: no es un calendario general.
- **Quién convoca** (`puedeConvocar`, pura con tests; el servidor lo comprueba por grupo y por estudiante): ADMIN y COORDINADOR cualquier grupo o estudiante del año en curso; un DOCENTE cita a todo un grupo **solo si lo dirige** y a un estudiante concreto si le dicta clase o dirige su grupo. Cada docente ve únicamente lo que convocó; coordinación y ADMIN ven todo. «No existe» y «no es tuyo» responden igual (404). **`ORIENTADOR` y `COORDINADOR_CONVIVENCIA` también citan, pero solo a los acudientes de UN estudiante (citación particular, nunca a un grupo completo) y solo de las sedes que tienen asignadas** (`gruposQueConvoca` les ofrece los grupos de esas sedes; sin sedes no convocan a nadie; un estudiante de otra sede es 404). El motivo `ORIENTACION_CONVIVENCIA` («Orientación y convivencia») es para ellos, y el correo presenta al convocante como «Orientación» o «Coordinación de convivencia». **Una citación puede enlazarse a un caso de convivencia** (`Citacion.caso_id`, solo convivencia porque es quien ve el caso: `cargarCaso`; la citación debe ser particular y el estudiante parte del caso, si no 400): el botón «Citar al acudiente de …» del caso abre el mismo formulario con el estudiante fijo, y el caso lista título, fecha y estado de lo enlazado (`citaciones`), nunca lo que respondió cada acudiente. El título viaja por correo y la descripción de una particular no (la pantalla lo avisa). Una citación enlazada que no se canceló **sí cuenta** como el informe a los acudientes que exige el cierre del caso (`pendientesParaCerrar(…, citacionesEnlazadas)`). El `citacion_realizada` de M14 sigue siendo solo registro.
- **A quién se cita** (`elegirAcudientes`): por estudiante, al acudiente **principal** activo (M03, el responsable legal que recibe citaciones) para no mandar dos correos a una familia; si no hay principal activo, o si se pidió `todos_los_acudientes` (solo en particulares), a todos los activos. El correo y la cuenta de portal se leen de `Guardian` (M03) al convocar y se copian al destinatario (un correo corregido después se usa al reenviar). Sin ningún acudiente registrado, 409.
- **Cola de correo en segundo plano** (`CorreoEnCola`, `colaCorreo.service`). Convocar solo escribe filas en la misma transacción (milisegundos aunque sean 40 acudientes); `iniciarColaCorreo()` (arrancada en `server.ts`) las envía cada 10 s y cuando se encola algo, 50 por tanda y 5 en paralelo, con reintentos (esperas 1, 5, 15 y 60 min; a los 5 intentos queda `FALLIDO` y se ve en la pantalla con «Enviar»/«Reenviar»). **Es una cola en Mongo a propósito**: la instalación ya la tiene y se respalda con ella; no obliga a levantar Redis ni otro servicio. El reclamo es atómico (`findOneAndUpdate` con reserva de 2 min), así que varias instancias o un proceso que muere a mitad no duplican ni pierden correos. Cambiar a BullMQ u otro servicio solo exige reemplazar `encolarCorreos`/`procesarCola`.
- **El mensaje no se guarda armado**: se arma al enviar (`armarMensajeDeCitacion`) con los datos de ese momento. Si la citación se canceló o ya pasó, o hay un correo más reciente para ese acudiente (`destinatario.correo_id` apunta al último), el correo viejo queda `OMITIDO` sin contar como fallo. Reprogramar (cambio de fecha u hora o de lugar) sube `version`, borra las confirmaciones y encola `CITACION_ACTUALIZADA`; cambiar solo título, motivo o descripción no avisa. Cancelar encola `CITACION_CANCELADA` **solo a quien ya había recibido** la invitación.
- **Correo configurable** (`env.correo`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `CORREO_REMITENTE`, más `PUBLIC_URL` para el enlace; ver `.env.example`). `correoConfigurado()` pide host, remitente y URL pública. **Sin eso la citación se crea igual** (portal y campanita), no se encola nada, la respuesta trae `advertencia_correo` y la pantalla lo avisa; al configurarlo se usa «Enviar» por acudiente. Las pruebas reemplazan el envío con `fijarEnviadorCorreo`. `despertarCola()` no hace nada si la cola no se arrancó (pruebas y scripts).
- **Botón de confirmación del correo** (`/public/citaciones/:token`, `GET` consulta y `POST …/respuesta`, rate limit propio, token de 128 bits en hexadecimal guardado en `CitacionDestinatario.token`, único). El botón abre una página, no confirma por sí solo: algunos programas de correo abren los enlaces para revisarlos y confirmarían sin que la persona decida. Se responde (y se cambia la respuesta) mientras la citación esté programada y no haya empezado (`evaluarRespuesta`). Un token con mala forma o inexistente responde 404 igual.
- **Privacidad de un menor**: la **descripción de una citación particular no viaja por correo ni se ve por el enlace público** (`descripcionViajaPorCorreo`); solo la lee el acudiente dentro del portal con sesión. La de una general (p. ej. «traer el desprendible») sí. El enlace público muestra únicamente el nombre de pila del estudiante.
- **M27**: pestaña «Citaciones» por hijo (`GET /portal/hijos/:id/citaciones`, `POST …/:destinatarioId/respuesta`, con la misma comprobación de vínculo `exigirAcudienteDe`); la respuesta desde el portal y desde el correo pasan por el mismo `registrarRespuesta` y quedan con su canal.
- **M28**: eventos `CITACION_NUEVA`, `CITACION_REPROGRAMADA`, `CITACION_CANCELADA` (campanita y punto rojo en la pestaña `citaciones-<hijo>` del acudiente con portal; el correo NO pasa por `Notificacion.entregas`, lo lleva su propia cola) y `CITACION_RESPONDIDA` (una sola alerta agrupada para quien convocó, que abre la citación). Auditoría: `CITACION_*`, sin contenido.
- **Pruebas:** unitarias (`citaciones.test.ts`: permisos, acudientes, respuesta, reintentos, correo, escape de HTML, hora de Colombia) e integración con base real (`integracion/citaciones.int.test.ts`: cola, fallos y reintentos, enlace, portal, reprogramar, cancelar, permisos; **no se pudo correr donde no hay binario de MongoDB**). El envío SMTP real se probó contra un servidor de pruebas local; la interfaz compila (`tsc -b`, `vite build`) pero no se probó en un navegador.
- **Pendiente, a propósito:** recordatorio automático antes de la reunión; registrar quién asistió realmente; que orientación enlace una citación a una remisión; citar a un estudiante mayor de edad; plantilla de correo editable por el colegio (M21/M32); enlace al calendario (.ics); correo de otros avisos de M28 (la cola ya es genérica en lo técnico, pero `armarMensajeDeCitacion` es hoy su único armador); límite de envíos por hora del proveedor SMTP.

### Acceso al portal del acudiente (M03 → M02/M27)

- `POST /users/:userId/guardians` acepta `habilitar_portal` (checkbox en el drawer "Vincular acudiente", solo al
  registrar uno nuevo). Sin marcar, M02 no se toca. Marcado, `vincularAcudiente` corre **todo en una transacción**
  (`runTransaction`: acudiente + cuenta + vínculo; si algo falla no queda nada a medias).
- Dato único: si ya existe un `User` con ese `numero_documento` se reutiliza su id (409 solo si es estudiante; si es
  personal se le **suma** el rol ACUDIENTE y elige perfil al entrar); si no, se crea con rol `ACUDIENTE`, contraseña temporal = número de documento y
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
  subtítulo + acción de la página), `Field` (`Input`/`Select`), `MultiSelect` (selector desplegable de selección múltiple con checkboxes, contador y badges de rol/estado; prop opcional `emptyLabel` cuando elegir es obligatorio), `Alert`, `Spinner`, `EstadoEspacioBadge` (M10), `EstadoAsistenciaChip`/`EstadoJustificacionBadge` (M13), `MallaDisponibilidad` (M09: cuadrícula de tiempo libre por clic, disponible/condicional/no disponible), `GuiaColumnas` (guía colapsable de columnas de una carga CSV), `ProgressBar` (barra de avance con tono, ej. semanas lectivas vs. el mínimo de 40), `LineaTiempo` (línea de tiempo vertical con punto, fecha, chips y contenido por registro; la usa el historial de convivencia), `EstadoCasoBadge`/`TipoSituacionBadge` (M15), `EstadoExpedienteBadge`/`EstadoSolicitudApoyoBadge` (M16), `EstadoNotaBadge` (M12: pendiente/borrador/cerrado/definitivo), `EstadoEntregaBadge`/`TipoActividadChip`/`ArchivoDepuradoChip` (M11: programada → entregada → con retraso → calificada; tipo de actividad; aviso de que el archivo de una entrega se depuró), `EditorRico` (texto enriquecido con Tiptap: negrita, subrayado, subtítulo, listas, enlaces e imágenes pegadas o soltadas —las reduce el navegador—; el servidor siempre vuelve a limpiar el HTML; M11) y `ContenidoRico` (dibuja ese HTML ya limpio; ambos comparten los estilos `.contenido-rico` de `index.css`), `CalendarioCalor` (calendario mensual con una celda por día coloreada por tono —verde/naranja/rojo— con número y descripción, días apagados, selección y navegación de mes; genérico, lo usa `PanelCargaGrupo` de M11), `DropzoneMultiple` (como `Dropzone` pero para varios archivos a la vez, con tope de cantidad; M11 material de apoyo), `Dropzone` (zona para soltar o elegir un archivo, valida extensión y tamaño en el navegador y muestra el archivo elegido; el servidor siempre confirma el contenido), `VistaPreviaPdf` (M17: muestra un PDF dentro de la página con su botón de descargar; recibe `cargar` que pide el blob con la sesión y `claveConsulta` que lo cachea, y libera el blob al cerrar), `VisorDocumento` (PDF dentro de la pantalla con descargar, imprimir y abrir aparte; certificados M26), `PanelDocumentosPdf` (M07: panel lateral para leer PDF mientras se trabaja en otra cosa: un selector con los documentos —agrupables— y el visor del elegido, que se pide con la sesión y solo al abrirlo; lo usan el plan de área, el plan de aula y el formulario de actividades; `VistaPreviaPdf` acepta `altoVisor` y `Dropzone` una `etiqueta` accesible, ambos opcionales), `EstadoPlanBadge`/`FueraDePlazoChip`/`EstadoVentanaBadge` (M07: estado de un plan; la etiqueta roja «ENTREGADO FUERA DE PLAZO» con fecha y hora; y si la entrega del periodo aún no abre, está abierta o venció), `Switch` (interruptor encendido/apagado para decisiones al momento, con `disabledReason` como tooltip; ej. firmas y sello al expedir en M26), `OpcionesTarjeta` (elegir una opción entre pocas, cada una como tarjeta con su ejemplo; M19), `Tabs`/`TabPanel` (navegación por pestañas con subrayado azul en la activa; reusar en vez de reinventar un switch de pestañas en otra página), `EditorConVariables` (párrafo de texto con los datos del sistema como fichas en lugar de `{{llaves}}`: «Insertar dato» o «/», una ficha se borra de una vez, una sola línea, lo pegado se limpia; guarda el mismo formato `{{modulo.dato}}` de siempre; M26 plantillas), `SelectBuscable` (select con campo de búsqueda: filtra al escribir sin tildes ni mayúsculas y con las palabras en cualquier orden, teclado, máx. 100 opciones dibujadas; la lista se dibuja en un portal con posición fija —no la recorta el cuerpo de un drawer ni una tabla con scroll— y se abre hacia arriba si abajo no cabe; opcionales `required`, `error`, `hideLabel`, `className`, `id`; las opciones de personas y grupos se arman con `lib/opcionesBuscables.ts`), `FiltrosRapidos` (hilera de botones tipo píldora, una opción activa con contador opcional; segmenta un listado sin otro select), `Stepper` (indicador de pasos para formularios largos por secciones, ej. el asistente de creación de estudiante en M03), `SelectorRolLogin` (login: elegir el perfil con el que se entra, `components/auth/`), `CambiadorDePerfil` (botones «Entrar como …» en el encabezado), `FilaDocumentoSubible` (fila de un documento de matrícula con su estado y botón de subir; la usan la preinscripción pública y el portal M27, validación en `lib/documentosMatricula.ts`), `TarjetaNotasAsignatura`/`ObservadorFamilia` (notas y observador, compartidos entre estudiante y acudiente), `SelectorEstudiante` (selector global de hijos del portal M27), `AjustesInstitucion`/`ImagenesInstitucion` (bloques de Configuración institucional, `components/institucion/`), `GrupoColapsable` (categoría desplegable del menú lateral: título con flecha y sus pantallas con sangría; la usa `MenuLateral`), `Campanita`/`ContadorInsignia` (M28, `components/notificaciones/`; `Tabs` acepta `contador` opcional y `useContadoresDePestana` apaga el de la pestaña abierta), e iconos SVG propios en `components/ui/icons.tsx` (no se agregó ninguna librería de iconos).
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
- **Un select de personas o de grupos es un `SelectBuscable`, no un `Select`.** Estudiantes, docentes, usuarios y los grupos de toda la
  institución o sede (filtros, drawers, filas de tabla) crecen con el colegio y un `<select>` nativo con cientos de opciones es ilegible. Se
  arman con `opcionesDePersonas` («Apellido, Nombre» y el documento como detalle que también se busca) y `opcionesDeGrupos` («Grado Grupo» con
  sede, jornada y, con `conCupos`, los cupos) de `lib/opcionesBuscables.ts`; el valor sigue siendo el `_id` y se pasa `vacioLabel` donde antes
  había una opción vacía. **Siguen siendo `Select`** las listas cortas por naturaleza: periodos, años, sedes, jornadas, grados, estados, tipos y
  un grupo elegido *dentro de un grado ya elegido* (cascada). Si el listado de usuarios viene de `useUsersPaginados`, **no** pasar `limit`
  (sin `page`/`limit` el servidor devuelve todos): el buscador filtra en el navegador y con una página recortada no encontraría a todos.
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
