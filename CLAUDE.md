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
  peligro suave (eliminar, rojo suave), éxito suave (reactivar, verde suave), secundario
  (cancelar, blanco/gris). Botones de icono en tablas: círculo 32px, icono 16px.
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
  `RolBadge`/`EstadoUsuarioBadge`/`EstadoGrupoBadge`/`EstadoMatriculaBadge`/`CupoBadge`/
  `DesempenoBadge` (chips ya mapeados a la familia de color correcta — no reinventar el mapeo
  rol→color o estado→color en una página), `Card`/`CardHeader`, `Table`/`TableHead`/`Th`/
  `TableBody`/`Td`/`EmptyRow`, `Drawer` (formularios de creación/edición; su botón principal
  acepta `submitVariant` para casos como confirmar un borrado en rojo), `PageHeader` (título +
  subtítulo + acción de la página), `Field` (`Input`/`Select`), `Alert`, `Spinner`, `Tabs`
  (selector de pestañas simple, subrayado azul en la activa — agregado en M06 para las tres
  secciones de Gestión de Planes de Estudio; reusar en vez de reinventar un switch de pestañas
  en otra página), e iconos SVG propios en `components/ui/icons.tsx` (no se agregó ninguna
  librería de iconos).
- **Contenedor global y densidad** (`components/layout/AppShell.tsx`): el `<main>` centra el
  contenido en `max-w-7xl` (no `max-w-5xl`) para que las tablas anchas (Usuarios, Grupos) no
  scrolleen antes de tiempo en pantallas grandes. Cada página usa `space-y-4` (no `space-y-6`)
  como separación entre sus secciones (`PageHeader`, `Alert`, `Card`, `Table`). Este ancho y
  este espaciado son el estándar del contenedor global — no se reduce el ancho ni se vuelve a
  `space-y-6` en una pantalla nueva sin pedirlo explícitamente, y el padding interno de
  `Table`/`Th`/`Td` no se toca por esta regla de densidad (es un ajuste del contenedor, no de
  las tablas).
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

## Documentos fuente

- `doc/Idea_Klassy_Gestor_Academico_Administrativo_v2.docx` — documento maestro: 32 módulos,
  actores, reglas de negocio y grafo de dependencias de datos.
- `doc/Klassy_UI_Spec_1.docx` — guía de identidad visual y especificación de componentes UI.
