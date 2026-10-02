# Análisis M14 (Observaciones y convivencia) y M15 (Comité de Convivencia Escolar)

**Estado:** análisis previo a la programación. No hay código. Rama: `feature/m14_m15_observaciones_convivencia` (sale de `main`).
**Fuentes revisadas:** `CLAUDE.md`; `Idea_Klassy_Gestor_Academico_Administrativo_v2.docx`; `m14_m15.docx` (propuesta); y el código existente
relacionado (roles, estudiantes y acudientes, auditoría, asistencia M13, boletín, plan de estudios y carga docente, año lectivo,
cargas masivas).
**Marco normativo:** las referencias legales de este documento están escritas de memoria y **no se verificó su texto vigente**. El
documento maestro (sección 12) exige validar la norma vigente antes de implementar reglas de convivencia; lo que aquí diga una ley es una
hipótesis de trabajo para revisar con asesoría jurídica de la institución, no una regla ya validada.


> **Actualización 2026-10-02 — decisiones del usuario (registro en la sección 15):** (1) se agrega el rol `COORDINADOR_CONVIVENCIA`;
> (2) el descuento de décimas en notas **queda para después**; (3) **SECRETARIA no tiene acceso** a convivencia; (4) las cargas masivas
> admiten **Excel y CSV**; (5) **el estudiante SÍ ve sus propias observaciones** (con las restricciones de 5.5); (6) se aprueba `mongodb-memory-server` para pruebas de integración. Base del código: `main` en `2c1498b` (incluye el PR #5 de M06/M08).

---

## 0. Resumen ejecutivo

1. **M14 y M15 son dos módulos con ciclos de vida distintos.** M14 es un **registro cotidiano** (observaciones: se crean rápido, las
   escribe el docente, casi no tienen estados). M15 es un **proceso formal** (casos con debido proceso, plazos, actas, remisiones y
   estados). Se conectan por un único enlace: una observación disciplinaria puede dar origen a un caso. La propuesta `m14_m15` los
   funde en una sola pantalla; la **entrada** puede ser única, pero el **modelo de datos y los permisos no deben fundirse**.
2. **"Observador" e "Historial" no son dos almacenes.** El documento maestro solo menciona "Observador" una vez (M03: pestaña
   "Observador y bienestar", como contenedor reservado para M14 y M16) y pide en M14 "construir historial por estudiante". Conclusión:
   el **Observador es la fuente (lo que se registra)** y el **historial de convivencia es una vista derivada** (línea de tiempo) de
   observaciones + casos + compromisos. No se guarda dos veces (Regla 1, datos centralizados). El "Historial escolar" de M03 (matrículas,
   resultados, promociones) es otra cosa y no cambia.
3. **(Decidido: rol nuevo `COORDINADOR_CONVIVENCIA`, sección 5.2.)** **Quién es responsable estaba mal planteado en la propuesta.** Dice "administrador y coordinador". El documento maestro define un actor
   **"Coordinador de convivencia"** (procesos disciplinarios, comité y seguimiento de casos) distinto del coordinador académico, y a
   **Orientación/Psicología**. En el código **no existen** esos dos roles (solo ADMIN, COORDINADOR, DOCENTE, SECRETARIA, ESTUDIANTE,
   ACUDIENTE). Hay que decidir cómo representarlos **antes** de programar (sección 5.2). CLAUDE.md prohíbe agregar roles sin que el
   usuario lo pida.
3. **Dos conceptos distintos están mezclados en la propuesta:** las **faltas del manual de convivencia** (leves/graves/gravísimas, lo que
   cada colegio define y es configurable) y los **tipos de situación Tipo I/II/III de la Ley 1620** (los tres valores son legales, no
   configurables; sí lo son sus protocolos y medidas). Un docente puede **describir** un hecho; **tipificarlo** formalmente es del
   coordinador de convivencia/comité. En la propuesta el docente clasifica Tipo I/II/III en el formulario: debe corregirse.
4. **(Decidido: se deja para después; no se diseña ni se programa en esta etapa.)** **"Descuento de décimas por falta" (M15):** es la decisión más delicada. Hoy Klassy no tiene una "nota de comportamiento" ni
   "tipos de notas" (heteroevaluación, etc.); solo hay notas de actividades por componente Saber/Hacer/Ser. Mi recomendación es **no
   descontar notas académicas** y, si la institución necesita valorar convivencia, hacerlo con una **valoración de comportamiento
   independiente** (opción B, sección 7.4). La opción de modificar la nota de una asignatura (C) es la que más riesgo legal y técnico
   trae. Es una decisión de la institución, no mía.
5. **Seguridad:** son datos de menores y, en casos Tipo II/III, de presuntas agresiones o delitos. Hallazgos del código que afectan este
   diseño: la auditoría solo registra **escrituras** (no lecturas); el **alcance por sede no existe** en ningún servicio (`sedes_ids` se
   guarda y no se usa); `datosSensibles.ts` ya asume que SECRETARIA ve "convivencia" sin que el documento maestro lo diga. Se detallan
   controles en la sección 10.
6. **Carga masiva por Excel:** pertinente para **catálogos** (tipos, descriptores, tipificación de faltas) y para **observaciones
   académicas/comportamentales**; **no** para disciplinarias ni casos (se saltarían el debido proceso). Seis plantillas definidas en la
   sección 11, siguiendo el patrón ya construido en M13.
7. **Alcance sugerido** (sección 13): M14 núcleo → M15 casos → actas y remisiones → Excel. Las integraciones con módulos que aún no
   existen (M17, M24, M27, M28, M29) quedan como **contratos documentados**, no implementados (regla de alcance estricto por módulo).

---

## 1. Qué dice la documentación oficial

### 1.1 Documento maestro (Idea_Klassy)

| Dónde | Qué establece |
|---|---|
| M14 | Registrar observaciones **académicas, comportamentales y disciplinarias**; permitir **compromisos, citaciones y seguimiento**; **controlar quién puede consultar información sensible**; **construir historial por estudiante**. |
| M15 | Casos con tipificación **Tipo I, II y III** "de acuerdo con la normativa aplicable"; registrar **apertura, hechos, involucrados, medidas, mediación, compromisos y seguimiento**; **actas del comité**; **remisiones a entidades externas**; **debido proceso y trazabilidad documental**; **flujos configurables** conforme al manual de convivencia y la normativa vigente. |
| Actores (sección 3) | **Docente**: "observaciones". **Coordinador de convivencia**: "procesos disciplinarios, comité de convivencia y seguimiento de casos". **Orientación/Psicología**: seguimiento, inclusión, PIAR. **Acudiente**: "citaciones y consulta de información autorizada". **Estudiante**: consulta académica, actividades, horario, asistencia y recuperación (no menciona observador ni faltas). **Administrador**: gestión institucional y configuración. |
| M03 | La ficha 360° del estudiante tiene la pestaña "Observador y Bienestar" que "dejará listo el contenedor para M14 Convivencia y M16 PIAR". Ya está en el código como placeholder (`StudentDetailPage.tsx`). |
| M17 | El boletín debe incluir "observaciones" y permitir "**observaciones descriptivas preconfiguradas**". |
| M24 | Reuniones, actas, **compromisos** con responsables y fechas, seguimiento de pendientes. |
| M27 | El portal del acudiente debe "**informar faltas disciplinarias y reuniones** cuando corresponda" y mostrar citaciones. |
| M28 | Notificaciones por rol y contexto (preparado para correo). |
| M29 | Documentos y evidencias de procesos, con **permisos por tipo de documento** y versiones. |
| M30 | Reportes e indicadores (no menciona convivencia explícitamente). |
| M31 | Auditoría: "especial atención a ... **convivencia**"; conservar fecha, usuario, acción y referencia. |
| M32 / Regla 2 | Lo que no debe quedar quemado incluye "**tipos de observaciones**", "**tipos de convivencia y procedimientos institucionales**", "estados de procesos". |
| Sección 9 y 10 | Convivencia es de complejidad **Alta** ("debido proceso, permisos, evidencias y trazabilidad"); se construye después de boletines (paso 11), junto con orientación y PIAR. |
| Sección 12 | Distinguir requisito legal, lineamiento del MEN y regla particular de la institución; validar la versión vigente de la norma antes de automatizar. |

### 1.2 Lo que **no** dice el documento maestro (huecos)

- No define qué es un "Observador" ni su contenido.
- No dice si el **estudiante** puede ver sus propias observaciones.
- No dice qué actor consulta o modifica cada tipo de registro (solo "controlar quién puede consultar información sensible").
- No define la composición del Comité ni cómo se representan sus miembros que no son usuarios (personero, representante de padres).
- No menciona conservación, retención ni supresión de estos registros.
- No menciona si convivencia afecta notas (la propuesta sí lo plantea).
- No dice quién es el "Coordinador de convivencia" en términos de rol de sistema.

### 1.3 CLAUDE.md: reglas que gobiernan este desarrollo

- **Un solo rol administrativo, `ADMIN`.** No reintroducir otro nivel; el rector se modela como ADMIN (el diagrama del maestro relaciona a Admin con Rector como "soporte a"; no hay rol Rector separado en el código).
- Jerarquía M02: ADMIN > COORDINADOR > SECRETARIA = DOCENTE > ESTUDIANTE = ACUDIENTE.
- **Alcance estricto por módulo**: no implementar lógica de M17, M24, M27, M28, M29 ni M12 al construir M14/M15. Solo el cambio mecánico mínimo si hay recurso compartido (un enum, un rol).
- **Regla de oro de datos**: se crea una vez y se consume por llave foránea; nada de escalas, reglas o tipos quemados: viven en configuración (M32).
- "Activo" en consultas = `ESTADO_ACTIVO` (`{ $ne: 'inactivo' }`); ninguna pantalla depende de estado guardado en el navegador.
- Código nuevo en español; backend en capas (modelo valida su forma, servicio orquesta, controlador traduce HTTP); validación de entrada solo en `validators/*.ts` (Joi).
- Frontend: reutilizar `components/ui/` (Chip, Drawer, Tabs, Table…); no tokens ni variantes nuevas; TanStack Query con un hook por dominio; formularios en **Drawer**; fechas con `lib/fechas.ts`.
- Cargas masivas: CSV con `leerCsv`; guía de columnas `GuiaColumnas` alimentada por `lib/columnasImportacion.ts` (se actualiza en el mismo cambio). M13 añadió el patrón `.xlsx` con `exceljs`.
- Un año lectivo CERRADO es histórico y de solo lectura (`asegurarAnioNoCerrado`).
- **Preguntar antes** de tocar algo cuyo alcance sea dudoso.

---

## 2. Contraste del documento `m14_m15`

Leyenda: ✅ establecido y coherente · ⚠️ necesita corrección · ❓ no contemplado en la propuesta.

| # | Propuesta | Veredicto | Análisis |
|---|---|---|---|
| 1 | Tipos de observación configurables (Académicas, Comportamentales, Disciplinarias), propuestos por el sistema | ✅ con matiz | Coherente con Regla 2 ("tipos de observaciones" no se queman). Matiz: las tres categorías no son solo etiquetas, **cambian el comportamiento** (disciplinaria puede escalar a caso, tiene reglas de visibilidad). Por eso cada tipo debe llevar **banderas de comportamiento** (como las banderas de `AttendanceState` en M13) y no depender de su nombre. |
| 2 | Categorías de descriptores (Fortalezas, Debilidades, Recomendaciones) y frases | ✅ | Es el "banco de frases". Debe ser **el mismo catálogo** que M17 consumirá para "observaciones descriptivas preconfiguradas" (una sola fuente, sección 8). |
| 3 | Admin y coordinador crean, editan y activan/desactivan todo el catálogo | ⚠️ | Desactivar sí; **eliminar nunca** (los registros viejos deben seguir resolviendo su frase, patrón M13/M06). Y la autoridad se debe **partir**: catálogos pedagógicos (frases) ADMIN+COORDINADOR; tipificación de faltas y reglas de impacto (M15) solo ADMIN, porque son el manual de convivencia (sección 5.3). |
| 4 | El docente solo selecciona frases del catálogo según su asignatura y grado, y puede agregar texto libre | ✅ con matiz | Correcto como mecanismo. Matiz: una frase **comportamental** no tiene asignatura; el alcance de cada frase debe ser opcional (nivel, grado, área, asignatura, periodo). El texto libre es un riesgo de privacidad (el docente puede escribir diagnósticos o datos de terceros): requiere límite y advertencia (sección 10). |
| 5 | El sistema "genera el texto final" y permite previsualizarlo | ⚠️ | Útil, pero **hay que guardar el texto como quedó** (snapshot) además de los ids de frases: si después se edita o desactiva una frase, el registro histórico no debe cambiar. |
| 6 | Se registra en el Observador y aparece en el Historial | ⚠️ | Son la misma cosa vista de dos formas (sección 6). No se escribe en dos sitios. |
| 7 | Los docentes aplican observaciones o faltas a los grupos que **dictan** y a los que **dirigen** | ✅ con matiz | Coherente con M08 (`TeacherAssignment` CLASE y DIRECCION_GRUPO activas) y con el precedente de M13 (`permisoSobreClase`). Matiz: en M13 el director solo **consulta** otras asignaturas; aquí el director **registra** sobre todo su grupo. Es una regla nueva y hay que decidir si el alcance incluye estudiantes ya retirados o trasladados (sección 9). |
| 8 | M15: admin y coordinador gestionan los tipos de faltas | ⚠️ | Mezcla "faltas del manual" con "Tipo I/II/III" de la ley (ver punto 3 del resumen). Faltan: protocolo por tipo, medidas, entidades de remisión, composición del comité. |
| 9 | Descuento de décimas a una nota por cada falta, configurable | ⚠️ ❓ | No está en el documento maestro. Tiene implicaciones legales y de integridad de datos (M12). Se analiza en 7.4. No se debe programar sin decisión expresa de la institución. |
| 10 | "¿El sistema gestiona diferentes tipos de notas (heteroevaluación, convivencia)?" | ❓ | **No.** Hoy una nota es la de una actividad (`componente_siee` Saber/Hacer/Ser, peso en el componente), consolidada en asignatura y área por M12/M17, con escala configurable por año (`AcademicYear.escala_evaluacion`). No existen heteroevaluación/autoevaluación/coevaluación ni una nota de comportamiento. Agregarlas sería un cambio en M12, fuera del alcance de M14/M15. |
| 11 | Vista "Registro de observaciones" con dos botones: Nueva observación/falta y Casos de convivencia | ✅ con matiz | Buena UX de entrada única. Pero la pestaña "Casos de convivencia" **no la ve el docente** (es de coordinación/comité). La navegación debe ser por permiso, no un menú igual para todos. |
| 12 | Disciplinaria: el docente elige Tipo I/II/III, describe hechos, involucrados, mediación, y el sistema pregunta "¿abrir caso?" | ⚠️ | (a) El docente **no tipifica**: reporta; tipifica el coordinador de convivencia/comité. (b) Una situación Tipo II/III **no puede depender de que el docente responda "sí"**: debe abrirse el caso de forma obligatoria y avisar al coordinador de inmediato. (c) "Mediación" es un paso del protocolo (M15), no un campo de la observación. |
| 13 | "Los casos Tipo I pueden nacer de una observación o crearse directo desde aquí" | ✅ | Además deben poder crearse directo los II y III (denuncias de un estudiante, un acudiente o un tercero que no pasan por un docente). |
| 14 | Historial del estudiante como vista consolidada (timeline) | ✅ | Como vista derivada. Debe respetar los mismos permisos que el Observador (sección 5). |
| 15 | Estados de caso: abierto, en mediación, en seguimiento, cerrado | ⚠️ | Incompleto: faltan atención inmediata/protección, remitido, reclasificado, anulado por error, reabierto y los resultados de cierre (sección 7.2). |
| 16 | Actas, remisiones, seguimientos | ✅ | Sin detalle; se define en 7. |
| — | Compromisos, citaciones (M14 oficial) | ❓ | La propuesta no los trata. El documento maestro los pone en M14. Hay que decidir su frontera con M24 y M27/M28 (sección 8.3). |
| — | Consulta por acudiente/estudiante, confidencialidad por tipo | ❓ | No contemplado. Es el núcleo del "controlar quién puede consultar información sensible". |
| — | Estudiantes mayores de edad, jornadas nocturna/sabatina | ❓ | Klassy soporta esas jornadas (`JORNADAS`): hay estudiantes adultos. Cambia quién autoriza, quién se notifica y qué protocolo aplica. |
| — | Retención, anulación, corrección, auditoría de lectura | ❓ | No contemplado. |
| — | Carga masiva Excel | ❓ | Se solicita ahora; se diseña en la sección 11. |

---

## 3. M14 — Observaciones y convivencia

### 3.1 Propósito

Dar al colegio un **registro cotidiano, trazable y con acceso controlado** de lo que ocurre con cada estudiante en lo académico y
comportamental, que reemplace al "observador" en papel o en Excel. Es la **memoria de seguimiento** que usan el docente, el director de
grupo, la coordinación y, según corresponda, la familia. No es un proceso disciplinario formal: eso es M15.

### 3.2 Alcance

**Dentro de M14:**
- Catálogos configurables: tipos de observación, categorías de descriptores, descriptores (frases).
- Registro de observaciones por estudiante (individual y grupal), con descriptores + texto libre.
- Compromisos y seguimiento derivados de una observación.
- Vista "Observador" en la ficha del estudiante (la pestaña ya reservada en M03) y vista de historial (línea de tiempo).
- Permisos y confidencialidad por tipo; auditoría de escritura **y de lectura**.
- Escalamiento: una observación disciplinaria puede originar un caso (el enlace; el caso vive en M15).

**Fuera de M14** (por regla de alcance): notificaciones (M28), portal del acudiente (M27), documentos y archivo (M29), reuniones (M24),
observaciones del boletín (M17), apoyo psicológico/PIAR (M16), cualquier modificación de notas (M12).

### 3.3 Actores

Ver matriz completa en 5.4. En síntesis: **Docente** registra (clases que dicta y grupos que dirige); **Coordinador de convivencia**
y **Coordinador académico** consultan y gestionan; **ADMIN** configura y audita; **Orientación** consulta lo que le corresponde;
**Acudiente** consulta lo visible de su hijo (vía M27); **Estudiante**: no definido en el maestro (recomendado: no por ahora).

### 3.4 Procesos principales

| Proceso | Cómo se desarrolla |
|---|---|
| **P1. Configurar el catálogo** | ADMIN/COORDINADOR crea tipos de observación (con banderas), categorías de descriptores y descriptores con su alcance (nivel/grado/área/asignatura/periodo). Todo se desactiva, nunca se elimina. Se siembra un catálogo mínimo la primera vez (como M13 con los 4 estados). |
| **P2. Registrar una observación académica o comportamental** | El docente abre al estudiante (de un grupo que dicta o dirige), elige tipo, marca descriptores aplicables, escribe un comentario opcional, previsualiza el texto, guarda. El servidor valida alcance del docente, matrícula activa, fecha dentro del año y periodo, y guarda **snapshot** del texto. Queda en el Observador; aparece en la línea de tiempo. |
| **P3. Registrar una observación disciplinaria** | Igual que P2 más: descripción de hechos, involucrados (otros estudiantes se registran **cada uno con su propio registro**, no en el de otro), lugar y fecha del hecho. El docente puede marcar "requiere atención de coordinación". Si el hecho encaja en una situación Tipo II/III (o el docente lo indica), se abre el caso en M15 de forma obligatoria y se avisa a coordinación. Una disciplinaria leve (Tipo I) puede quedarse en observación, con compromiso. |
| **P4. Registrar un compromiso** | Sobre una observación: qué, quién (estudiante/acudiente/docente), fecha límite. Seguimiento posterior: cumplido/incumplido/vencido con nota. |
| **P5. Consultar el Observador** | Cada consulta valida permiso del usuario sobre ese estudiante, filtra campos por rol, y **deja rastro de lectura**. Listados sin texto completo; el detalle se pide aparte. |
| **P6. Corregir o anular** | Una observación no se borra ni se reescribe en silencio: el autor puede **enmendar** dentro de un plazo configurable (queda la versión anterior) y puede **anular** con motivo; pasado el plazo solo coordinación/ADMIN. |
| **P7. Observación grupal** | Un mismo hecho que afecta a varios estudiantes genera **un registro por estudiante** (con un `evento_id` común interno) para no revelar a unos los datos de otros. |

### 3.5 Procesos secundarios

- Cambio de director de grupo o de docente: reasignación de acceso (sección 9).
- Retiro/traslado del estudiante: el Observador **sigue siendo del estudiante**, no del grupo (M03: persona separada de matrícula).
- Cierre del año lectivo: las observaciones quedan inmutables; los casos abiertos y compromisos vigentes **no** se cierran solos.
- Retención/anonimización al vencer el plazo configurado (sección 10.4).
- Reporte de observaciones por estudiante/grupo/periodo (PDF, con control de quién lo genera).

### 3.6 Reglas de negocio

- **RN-14-01** Una observación pertenece a **un estudiante** (persona, M03), con el grupo y la matrícula **vigentes en la fecha del hecho** guardados como contexto.
- **RN-14-02** Solo registra quien tiene vínculo vigente con el estudiante: docente con `TeacherAssignment` CLASE activa en su grupo, o director del grupo (`DIRECCION_GRUPO` activa / `Group.director_grupo_id`), o coordinación (en nombre de otro, registrándolo).
- **RN-14-03** El **catálogo es configuración**: ninguna lógica compara por nombre de tipo o de frase; se usan banderas (p. ej. `genera_caso_posible`, `visible_acudiente`, `requiere_compromiso`, `confidencial`).
- **RN-14-04** El texto final se **congela** al guardar; desactivar o editar el catálogo no altera registros históricos.
- **RN-14-05** Nada se elimina: se **anula** con motivo y autor. Las enmiendas conservan la versión anterior.
- **RN-14-06** Una observación académica no es una nota ni la modifica.
- **RN-14-07** Una observación disciplinaria que sea (o presuma ser) Tipo II/III **debe** tener caso en M15; no se puede dejar solo como observación.
- **RN-14-08** Año lectivo CERRADO: solo lectura. Estudiante sin matrícula activa en el año: solo coordinación puede registrar (p. ej. un hecho ocurrido antes del retiro).
- **RN-14-09** Fecha del hecho no futura y dentro del año lectivo; periodo derivado de la fecha con el calendario de M05 (de la sede si tiene calendario propio).
- **RN-14-10** Todo acceso a información sensible deja evidencia (quién, qué estudiante, cuándo, para qué vista).

### 3.7 Estados de una observación

`ACTIVA` → `ANULADA` (con motivo; terminal). Las enmiendas no son estados: son versiones. Compromisos: `PENDIENTE` → `CUMPLIDO` | `INCUMPLIDO` (y `VENCIDO` derivado por fecha). No se agregan más estados "por si acaso".

### 3.8 Validaciones y restricciones

- Estudiante con matrícula activa en el año (o excepción de coordinación documentada).
- Descriptores activos y dentro del alcance (grado/área/asignatura/periodo) de lo que el docente dicta; no se aceptan ids de frases fuera de su alcance.
- Longitud máxima del texto libre; el texto libre y los descriptores no pueden estar ambos vacíos.
- Un tipo marcado como "disciplinaria/convivencial" exige hechos.
- Tipificación (I/II/III) **no** la fija el docente.
- Joi estricto (sin campos extra) en `validators/`; los ids deben ser ObjectId válidos y del año/institución.

### 3.9 Relaciones entre entidades (propuesta de modelo)

| Entidad | Contenido clave | Relaciones |
|---|---|---|
| `TipoObservacion` | nombre, código, banderas, estado | catálogo por institución |
| `CategoriaDescriptor` | nombre, orden, estado | agrupa descriptores |
| `Descriptor` | texto, categoría, tipo(s) de observación, alcance opcional (niveles, grados, áreas, asignaturas, periodos), estado | referencia M06 (área/asignatura), M01 (grado) |
| `Observacion` | estudiante, matrícula y grupo de contexto, año, periodo, fecha del hecho, tipo, descriptores (id + texto), comentario, texto generado, registrado por (+ en nombre de), contexto (clase/dirección/coordinación), visibilidad, compromiso(s), caso asociado, estado, enmiendas, anulación | M03, M04, M01, M05, M08, M02 |
| `Compromiso` (embebido en observación o caso) | descripción, responsable, fecha límite, estado, seguimiento | — |

Convenciones: nombres en español, sufijos `Model`/`Document`/`Schema`; índices por estudiante+año, por grupo+periodo y por autor.

### 3.10 Información que recibe, genera, consulta y entrega

- **Recibe:** digitación del docente/coordinación; plantillas Excel (sección 11); catálogo (ADMIN/COORDINADOR).
- **Genera:** observaciones, compromisos, texto final, línea de tiempo, indicadores, eventos de auditoría (escritura y lectura).
- **Consulta de otros módulos:** M03 (estudiante, acudiente principal, banderas de discapacidad/PIAR, autorización de datos), M04 (matrícula y grupo en la fecha), M01 (sede, grado), M05 (año, periodo, días no lectivos), M06 (áreas y asignaturas para el alcance de frases), M08 (asignaciones y dirección de grupo), M02 (usuario, rol, sedes).
- **Entrega a otros módulos:** M03 (contenido de la pestaña), M15 (origen de un caso), M17 (banco de descriptores; resumen opcional), M20/M30 (indicadores), M27/M28 (eventos a notificar), M31 (auditoría).

---

## 4. M15 — Comité de Convivencia Escolar

### 4.1 Propósito

Gestionar de forma **formal y documentada** las situaciones de convivencia que superan el registro cotidiano, garantizando el **debido
proceso**, los **plazos de ley**, la **confidencialidad** y la **trazabilidad documental** (actas, remisiones, seguimientos), conforme al
manual de convivencia de cada institución y a la normativa vigente.

### 4.2 Alcance

**Dentro de M15:** tipificación de faltas del manual; casos Tipo I/II/III con su protocolo; involucrados, hechos, medidas, mediación,
compromisos, seguimientos, citaciones, descargos y decisión; remisiones a entidades externas; composición del comité y actas;
configuración de la política de convivencia (incluida la decisión sobre notas, si se aprueba).

**Fuera de M15:** envío de citaciones/notificaciones (M27/M28), repositorio documental general (M29), agenda general de reuniones (M24),
atención psicológica (M16), reporte al sistema nacional de convivencia (se deja la exportación de datos; la integración externa es futura),
cualquier cambio en notas (M12).

### 4.3 Marco normativo de trabajo (a validar)

| Norma | Para qué se usa aquí |
|---|---|
| Ley 1620 de 2013 y Decreto 1965 de 2013 (compilado en el Decreto 1075 de 2015) | Sistema Nacional de Convivencia Escolar; comité escolar de convivencia; **situaciones Tipo I** (conflictos y situaciones esporádicas sin daño al cuerpo o la salud), **Tipo II** (agresión escolar, acoso o ciberacoso, no constitutivas de delito, repetidas o sistemáticas, con daño sin incapacidad) y **Tipo III** (presuntos delitos contra la libertad, integridad y formación sexual u otros delitos); protocolos de atención; confidencialidad; reporte. |
| Ley 1098 de 2006 (Código de Infancia y Adolescencia) | Interés superior del menor; remisión a autoridades de protección. |
| Constitución, arts. 15 (habeas data), 29 (debido proceso), 44 (derechos de los niños) | Base de derecho de defensa, motivación de decisiones y protección de datos. |
| Ley 1581 de 2012 y Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015) | Datos personales, **datos de menores**, finalidad, circulación restringida, temporalidad, derechos del titular. |
| Ley 594 de 2000 | Archivos y tablas de retención documental. |
| Decreto 1290 de 2009 (compilado en el Decreto 1075 de 2015) | Evaluación de estudiantes: relevante para la discusión sobre descuentos en notas. |
| Decreto 1421 de 2017 | Educación inclusiva: ajustes y medidas para estudiantes con discapacidad (relación con M16/PIAR). |
| Ley 1090 de 2006 | Ejercicio de la psicología y secreto profesional (límite entre M14 y M16). |

### 4.4 Actores

**Coordinador de convivencia** (gestiona casos), **Rector = ADMIN** (preside el comité por ley; aprueba y puede reabrir),
**Orientación/Psicología** (miembro del comité y atención), **Docente** (reporta, no gestiona), **Acudiente** (citado, descargos,
consulta lo que le corresponda), **Estudiante** (descargos; consulta no definida), **miembros del comité no usuarios** (personero
estudiantil, representante de padres): se registran como **designaciones**, no como roles de sistema.

### 4.5 Procesos principales

| Proceso | Cómo se desarrolla |
|---|---|
| **P8. Abrir un caso** | Origen: (a) observación disciplinaria con escalamiento; (b) creación directa de coordinación/ADMIN (denuncia de estudiante, acudiente o tercero). Datos: fecha/hora/lugar, hechos, involucrados con su rol en el caso (afectado, presunto responsable, testigo, reportante), cómo se conoció. El sistema asigna **consecutivo anual** (patrón del folio de matrícula: contador atómico en la misma transacción). La tipificación inicial (I/II/III) la fija el coordinador de convivencia; puede **reclasificarse** hacia arriba con motivo y traza. |
| **P9. Atención inmediata y medidas de protección** | Registro de atención en salud (si hubo daño), informe a los acudientes (con fecha/hora/medio), medidas de protección. Obligatorio en II y III. |
| **P10. Protocolo y debido proceso** | Cada tipificación tiene un **protocolo configurable** (lista ordenada de pasos con bandera "obligatorio": notificación a acudientes, descargos del estudiante y del acudiente, mediación, decisión motivada con fundamento en el manual, notificación de la decisión, recurso si el manual lo prevé). **El caso no puede cerrarse con pasos obligatorios pendientes.** |
| **P11. Mediación** | Solo Tipo I y algunos II (según protocolo); registro de encuentro, acuerdos y compromisos; puede fallar y pasar a decisión formal. |
| **P12. Remisión a entidad externa** | Catálogo configurable de entidades (autoridad de policía de infancia y adolescencia, ICBF, comisaría de familia, fiscalía, salud/EPS, personería, secretaría de educación…). Registro: entidad, fecha y hora, oficio, funcionario receptor, soporte, respuesta. En **Tipo III** es obligatoria y **inmediata**: alerta si pasa un plazo configurable sin remisión. |
| **P13. Seguimiento** | Entradas fechadas con autor, nota y próxima fecha; compromisos con estado; alertas de pendientes vencidos (la entrega de alertas es M28; M15 las calcula y las muestra). |
| **P14. Sesión y acta del comité** | Se crea la sesión (fecha, tipo ordinaria/extraordinaria), asistentes, **quórum**, orden del día, casos tratados, decisiones. Acta con consecutivo anual, borrador → **firmada** (bloqueada); las correcciones son nueva acta o anexo, no edición. Un miembro **implicado en un caso** se excluye de su deliberación (recusación). |
| **P15. Cierre** | Con un **resultado**: solucionado, desestimado (no probado), remitido, con medida formativa/sanción aplicada. Solo si el protocolo está completo. |
| **P16. Reapertura** | Solo ADMIN, con motivo (patrón de reabrir periodo en M05 y planeación aprobada en M07). |

### 4.6 Procesos secundarios

- Configuración de tipificación de faltas y protocolos (ADMIN, por año lectivo o con vigencia).
- Composición del comité por año (designaciones con cargo).
- Tablero de casos por estado/tipo/plazo para coordinación y ADMIN (M30 lo extenderá).
- PDF de acta y de ficha de caso (quién lo generó y cuándo queda registrado, patrón M26/M13).
- Exportación de datos para el reporte externo de convivencia (formato a definir con la institución).

### 4.7 Reglas de negocio

- **RN-15-01** Los tres tipos **I/II/III son fijos** (los define la ley); lo configurable es cómo se llaman las faltas del manual, qué protocolo y qué medidas tiene cada una, y qué entidades existen.
- **RN-15-02** **Tipificar es una decisión de coordinación/comité**, no del reportante. Solo se puede **escalar** (I→II→III) con motivo; bajar de tipo requiere ADMIN con motivo.
- **RN-15-03** Tipo II y III: informar a acudientes, atención inmediata, medidas de protección y seguimiento son **obligatorios**. Tipo III: **remisión inmediata** a la autoridad competente; el caso no se cierra sin ella o sin justificación documentada.
- **RN-15-04** **Presunción de inocencia**: lenguaje y estados neutros ("presunto"), derecho de **descargos** del estudiante y su acudiente antes de la decisión.
- **RN-15-05** La **decisión debe estar motivada** y referirse a una tipificación del manual vigente en la fecha del hecho.
- **RN-15-06** Cualquier efecto sobre notas solo puede nacer de una decisión **en firme** (notificada y sin recurso pendiente). Ver 7.4.
- **RN-15-07** Confidencialidad: un involucrado no ve la identidad de los otros menores involucrados; el acudiente ve lo de **su** hijo.
- **RN-15-08** Actas firmadas e inmutables; consecutivos anuales sin huecos (contador atómico dentro de la transacción).
- **RN-15-09** Un caso puede **cruzar años**: el cierre del año lectivo **no** lo cierra ni lo bloquea (excepción a `asegurarAnioNoCerrado`, deliberada y documentada).
- **RN-15-10** Nada se elimina: se **anula** por error de apertura (con motivo, ADMIN).
- **RN-15-11** Quien esté implicado, o tenga conflicto de interés, no gestiona ni delibera sobre ese caso.

### 4.8 Estados del caso (flujo propuesto)

```
ABIERTO ──► EN_ATENCION ──► EN_MEDIACION ──► EN_SEGUIMIENTO ──► CERRADO
   │             │                │                 ▲
   │             └────────────────┴──► REMITIDO ────┘   (la institución sigue con el seguimiento)
   └──► ANULADO (error de apertura, ADMIN, con motivo)
CERRADO ──► REABIERTO (solo ADMIN, con motivo) ──► EN_SEGUIMIENTO
```

Se implementa como **tabla de transiciones** en `constants/` (patrón `TRANSICIONES_PERIODO` de M05). El **resultado de cierre** es un campo aparte
(solucionado / desestimado / remitido / medida aplicada). Los estados son el contrato del sistema; las **etiquetas** pueden ser
configurables pero el flujo no se quema por nombre.

### 4.9 Entidades propuestas

| Entidad | Contenido clave |
|---|---|
| `TipificacionFalta` | código, nombre, categoría del manual (etiqueta configurable), **tipo de situación I/II/III**, descripción, protocolo (pasos), medidas sugeridas, vigencia, estado |
| `MedidaConvivencia` | catálogo de medidas pedagógicas/restaurativas/correctivas |
| `EntidadExterna` | catálogo de entidades de remisión |
| `CasoConvivencia` | consecutivo, año, sede, tipo, tipificación, estado, resultado, fecha/hora/lugar, hechos, origen (observación/directo), involucrados[], atención inmediata, medidas[], pasos de protocolo[], seguimientos[], compromisos[], remisiones[], citaciones[], descargos[], decisión, recursos, enlace a observaciones, auditoría |
| `MiembroComite` | año, persona (usuario o designación externa), cargo, vigencia |
| `SesionComite` / `ActaComite` | consecutivo anual, fecha, tipo, asistentes, quórum, casos tratados, decisiones, estado (borrador/firmada), archivo/PDF |
| `ConfiguracionConvivencia` | política institucional: plazos de alerta, plazo de enmienda, retención y reincidencia (si se aprueba). **Sin impacto en notas** (D5 diferido) |

### 4.10 Información que recibe, genera, consulta y entrega

- **Recibe:** observaciones disciplinarias (M14), creación directa, evidencias (archivos), digitación de comité.
- **Genera:** casos, actas, remisiones, seguimientos, indicadores, eventos de auditoría (escritura y lectura), PDFs.
- **Consulta:** M03 (estudiantes, acudientes principales, banderas de discapacidad/PIAR), M04 (matrícula/grupo en la fecha), M01 (sede, grupo), M02 (usuarios y roles del comité), M05 (año, calendario), M14 (observaciones origen), M08 (director de grupo del estudiante).
- **Entrega:** M14/M03 (estado del caso en la línea de tiempo con visibilidad mínima), M27/M28 (hitos para notificar), M20/M30 (indicadores), M29 (actas y evidencias, cuando exista), M17/M12 solo si se aprueba una de las opciones de 7.4.

---

## 5. Actores, roles y permisos

### 5.1 Qué dice el maestro vs. qué existe en el código

| Actor del maestro | Rol en el código hoy | Observación |
|---|---|---|
| Administrador institucional (y Rector) | `ADMIN` | Rector se opera con ADMIN (el diagrama los relaciona; no existe rol Rector). Preside el comité por ley. |
| Coordinador académico | `COORDINADOR` | Horarios, carga, currículo. |
| **Coordinador de convivencia** | **No existe todavía → se crea `COORDINADOR_CONVIVENCIA`** (decisión del usuario) | Actor explícito en el maestro; no está en el catálogo de roles de M02 (que sí lista `COUNSELOR`, también ausente del código). |
| Docente / Docente orientador | `DOCENTE` | El diagrama dice "Docente orientador" generaliza a Docente. |
| **Orientación / Psicología** | **No existe; se difiere a M16** | No se agrega ahora. En el comité figura como **designación** (miembro), no como rol. Su acceso al Observador queda fuera de la primera etapa. |
| Secretaría académica | `SECRETARIA` | El maestro no le da función en convivencia. |
| Estudiante, Acudiente | `ESTUDIANTE`, `ACUDIENTE` | M27 pendiente. |

### 5.2 Decisión D1 (tomada): rol `COORDINADOR_CONVIVENCIA`

El usuario pidió agregar el rol "tal y como lo plantea la documentación". Esto **modifica CLAUDE.md** (sección M02: "Un solo rol administrativo" y la
jerarquía), así que se trata como un cambio de reglas aprobado expresamente, y se documenta ahí al implementarlo.

**Definición del rol (según el maestro):** "procesos disciplinarios, comité de convivencia y seguimiento de casos". **No** hereda nada del
coordinador académico: ni horarios, ni carga, ni currículo.

**Jerarquía propuesta:** rango **70, par del `COORDINADOR`**. Efecto: solo el ADMIN crea, edita, desactiva o elimina a un coordinador de
convivencia (un COORDINADOR no, porque la regla M02 exige rango estrictamente menor). Es lo adecuado para un rol que ve información de menores.
Alternativa (60, por debajo de COORDINADOR) permitiría que el coordinador académico lo gestione; no se recomienda.

**Impacto medido en el código (cambio mecánico mínimo):**

| Dónde | Qué | Cómo se detecta |
|---|---|---|
| `backend/src/constants/enums.ts` (`ROLES`) y `backend/src/constants/roles.ts` (`JERARQUIA_ROLES`) | valor nuevo y su rango | `JERARQUIA_ROLES` es `Record<Rol, number>`: no compila sin la entrada |
| `frontend/src/types/api.ts` (`ROLES`, `JERARQUIA_ROLES`) | igual | igual |
| `frontend/src/components/ui/Badge.tsx` (`ROL_LABELS`, `ROL_TONE`) | etiqueta y tono (uno de los 5 existentes; no se crea color) | `Record<Rol, …>` |
| `frontend/src/pages/DashboardPage.tsx` (`ROLE_LABELS`) | etiqueta del rol | `Record<string,…>`: **no** lo detecta el compilador; revisión manual |
| `UsersPage`, `lib/columnasImportacion.ts`, importación CSV de usuarios | listas de roles | salen de `ROLES`/`ROLES_LIST`: se actualizan solas; hay que verificarlo |
| CLAUDE.md (sección M02) | texto de la jerarquía y del rol | documentación |

**Seguridad por defecto (deny-by-default):** `checkRole` es una lista de permitidos. Hay 58 usos de `ROLES.COORDINADOR` en 21 archivos del
backend; **ninguno debe ampliarse** al rol nuevo. El rol queda sin acceso a todo lo que no se le dé expresamente. Dos puntos a revisar en el plan:
- Rutas con solo `authenticate` (sin `checkRole`): el rol nuevo las podría leer como cualquier autenticado. `report-card` ya termina en 403 para
  roles desconocidos (verificado en `reportCard.service.ts`); las demás (catálogos de solo lectura como áreas, asignaturas, plan de estudios,
  grupos, institución) se revisan una por una y se decide si cierran o se aceptan.
- El directorio de estudiantes (`/students`) es solo de STAFF + DOCENTE. **No se abre al rol nuevo**: M14/M15 tendrán su **propio buscador de
  estudiantes acotado a la sede y al motivo**, para no ampliar M03.

**Alcance por sede:** el usuario ya tiene `sedes_ids`. Para este rol la sede es obligatoria (como dice M02: "Coordinador o Docente solo tienen
alcance operativo en sus sedes asignadas"); ADMIN ve todas.

**Orientación/Psicología** sigue **sin rol** hasta M16. Mientras tanto, en el comité es una designación y no accede al Observador.

### 5.3 Quién configura qué

| Qué | Quién | Razón |
|---|---|---|
| Tipos de observación, categorías y descriptores | ADMIN y COORDINADOR | Pedagógico (mismo criterio que M06/M07: `CURRICULUM_MANAGERS`). |
| Tipificación de faltas, protocolos, medidas, entidades de remisión, composición del comité, política (notas, plazos, retención) | **Solo ADMIN** | Es el **manual de convivencia** y política institucional (M32: "ADMIN: configuración macro, reglas SIEE y auditoría"). M13 también dejó los estados solo a ADMIN. La propuesta pone a "admin y coordinador" en todo: se corrige. |
| Con vigencia anual | Cambios al manual **por año lectivo** o con fecha de vigencia | Una decisión se juzga con el manual vigente al hecho (RN-15-05). |

### 5.4 Matriz de permisos propuesta

Convenciones: **R** registra · **C** consulta · **M** modifica/enmienda · **A** anula · **G** gestiona (ciclo del caso) · **—** sin acceso ·
(propio) solo lo que él registró · (grupo) estudiantes de sus grupos · (hijo) solo su hijo/representado.

| Acción | Docente de clase | Director de grupo | Coord. convivencia | Coord. académico | Orientación | ADMIN/Rector | Secretaría | Acudiente | Estudiante |
|---|---|---|---|---|---|---|---|---|---|
| Configurar catálogos (tipos, descriptores) | — | — | — | R/M (frases) | — | R/M | — | — | — |
| Configurar manual/protocolos/política | — | — | — | — | — | R/M | — | — | — |
| Registrar obs. académica/comportamental | R (grupo que dicta) | R (todo su grupo) | R (cualquiera) | R (cualquiera) | — | R | — | — | — |
| Registrar obs. disciplinaria | R (reporta) | R (reporta) | R | R | — | R | — | — | — |
| Consultar observaciones | C (propias + resumen) | C (de su grupo, no contenido de II/III) | C | C (académicas/comport.) | C (las que correspondan) | C | — | C (visibles de su hijo, vía M27) | **C (propias, solo tipos `visible_estudiante`)** |
| Enmendar | M (propias, plazo) | M (propias, plazo) | M | M | — | M | — | — | — |
| Anular | A (propias, plazo, motivo) | A (propias, plazo) | A | A | — | A | — | — | — |
| Abrir caso | R (solicita) | R (solicita) | R/G | — | R (solicita) | R/G | — | R (denuncia, vía M27) | R (denuncia, vía M27) |
| Gestionar caso | — | — | G | — | G (en su parte) | G | — | — | — |
| Consultar caso | — | existencia y estado, **sin contenido** | C | — | C | C | — | C (de su hijo, redactado) | — (sus descargos los registra el personal) |
| Actas del comité | — | — | R/M | — | C (si miembro) | R/M (firma) | — | — | — |
| Remisiones | — | — | G | — | G | G | — | — | — |
| Reabrir caso | — | — | — | — | — | G | — | — | — |
| Auditoría de lecturas | — | — | — | — | — | C | — | — | — |

**Estado de las decisiones asociadas:**
- **D2 (tomada: sí).** El estudiante ve sus observaciones, con las restricciones de 5.5.
- **D3 (pendiente).** ¿Ve el **docente de clase** observaciones de otros docentes? Recomendación: solo las propias + un resumen de alerta; el **director** ve las de su grupo.
- **D4 (tomada).** **SECRETARIA no tiene acceso** a convivencia. Se corrige el comentario de `datosSensibles.ts` que la nombraba, como cambio mecánico.
- La columna **Coord. convivencia** es ahora el rol `COORDINADOR_CONVIVENCIA`. La columna **Orientación** queda diferida a M16 (sin acceso en la primera etapa).

### 5.5 El estudiante ve sus observaciones — decisión tomada: SÍ

**Cómo se diseña (para cubrir los riesgos que motivaban mi recomendación inicial):**
1. Cada **tipo de observación** lleva la bandera `visible_estudiante` (configurable). Solo se muestran las de tipos marcados; por defecto, las académicas y comportamentales; las disciplinarias **no**, hasta que la institución decida.
2. Se muestra **solo el texto final**, y nunca: casos del comité, notas internas, nombres de otros menores, ni compromisos del acudiente.
3. Un estudiante **sin cuenta** (`user_id` nulo, p. ej. primaria) no tiene vista: no se les crea acceso por esto.
4. Estudiante **adulto** (jornadas nocturna y sabatina): ve las suyas aunque el tipo no esté marcado, como titular de sus datos.
5. Cada consulta del estudiante queda en la auditoría de lectura, igual que las del personal.
6. El derecho a ser escuchado sigue garantizándose en el proceso (descargos registrados por el personal); ver una observación no equivale a haber sido notificado formalmente.
7. Impacto en el plan: una pantalla propia para `ESTUDIANTE` (hoy solo ve boletín y cuenta) y un permiso en `permisoSobreEstudiante` (solo su propio `student_id`). Se construye en la Fase 2.

**Razonamiento original (referencia de riesgos que el diseño debe cubrir):** el maestro no le da al estudiante la consulta de observaciones; para un menor la ley se dirige
al representante; no todos tienen cuenta; el contenido está escrito para el personal y puede nombrar a otros menores. Por eso las restricciones de arriba no son opcionales.

---

## 6. Observador vs. Historial

### 6.1 Qué dice la documentación

- "Observador" aparece **solo en M03** (pestaña "Observador y Bienestar", contenedor reservado para M14 y M16) y en la propuesta. M14 oficial dice "**construir historial por estudiante**", no "observador".
- "Historial" aparece en M03 como **historial escolar longitudinal**: matrículas, grupos, resultados, recuperaciones, promociones, retiros, situación final (trayectoria académica y administrativa).

### 6.2 Diferencia funcional

| | **Observador** | **Historial de convivencia** (M14) | **Historial escolar** (M03) |
|---|---|---|---|
| Naturaleza | Registro **primario** de hechos y seguimientos | **Vista derivada** (línea de tiempo) del Observador + casos + compromisos | Trayectoria académica/administrativa |
| ¿Se almacena? | **Sí** (`Observacion`) | **No** (consulta con filtros y permisos) | Ya existe (matrículas, notas) |
| Quién escribe | Docentes, coordinación, comité | Nadie: se calcula | Procesos de M04/M12/M19 |
| Qué responde | "¿Qué se registró, quién, cuándo, con qué compromiso?" | "¿Cómo ha sido el recorrido del estudiante en convivencia?" | "¿Qué cursó y con qué resultado?" |
| Alcance temporal | Cada registro pertenece a un año/periodo | Varios años | Varios años |
| Sensibilidad | Alta (varía por tipo) | Hereda la del registro más sensible visible al usuario | Media |

### 6.3 ¿Corresponde el Observador a M14/M15?

**Sí, a M14** (es su núcleo). M15 lo **alimenta** (el caso aparece en la línea de tiempo con visibilidad mínima) pero no es su almacén. La
pestaña "Observador y bienestar" de M03 tiene **dos secciones con permisos distintos**: Observador/convivencia (M14, M15) y Bienestar/PIAR (M16).
La información de orientación y apoyo psicológico **no entra** al Observador (secreto profesional; permisos distintos).

### 6.4 Qué almacena cada uno

**Observador (`Observacion`):** estudiante; matrícula y grupo de contexto; año y periodo; fecha del hecho y fecha de registro; tipo; descriptores
(id y **texto congelado**); comentario libre; texto final; autor y en qué calidad (clase, dirección, coordinación) y si registró "en nombre de";
asignatura si fue en clase; **visibilidad** (qué ve el acudiente, qué es confidencial); compromisos; acuse "enterado" del acudiente (cuando M27
exista); enlace opcional a un caso; estado y, si aplica, anulación (quién, cuándo, por qué); enmiendas (versión anterior, autor, fecha).

**Historial de convivencia:** nada propio. Calcula: observaciones visibles al usuario, casos (con la redacción permitida), compromisos con su
estado, e indicadores simples (conteo por tipo y periodo). Puede mostrar, como enlace de solo lectura, el resumen de inasistencias de M13.

### 6.5 Respuesta directa: ¿se implementará un Observador? ¿Es el mismo historial?

**Sí, el Observador se implementa**: es el núcleo de M14 y ocupa la pestaña "Observador y bienestar" que M03 dejó reservada. Lo que **no** se
implementa es un segundo almacén llamado "historial".

- **Observador** = lo que se guarda (cada observación con su contexto, autor, compromisos y versiones).
- **Historial por estudiante de M14** (lo que pide el maestro) = **la misma información leída de forma consolidada** (línea de tiempo con filtros por
  año, periodo y tipo, más los casos con visibilidad mínima). **No hay una tabla "historial"**: es una consulta sobre el Observador y M15. En ese
  sentido, Observador e historial de convivencia **no son dos datos distintos**: uno es el registro y el otro su lectura.
- **Historial escolar de M03** (matrículas, grupos, resultados, recuperaciones, promociones, retiros) **es otra cosa** y no cambia: es la
  trayectoria académica y administrativa. Una observación no se copia ahí.

Dicho de otra forma: lo que sí violaría la regla de datos centralizados sería guardar la observación una vez en el "Observador" y otra en un
"Historial". La regla se cumple porque hay **una sola fuente (Observador)** y el historial se **calcula**. Sí puede haber un **enlace de solo
lectura** desde el historial de convivencia al resumen de inasistencias de M13 o a la matrícula de M04, pero sin copiar sus datos.

---

## 7. Decisiones de lógica que deben tomarse antes de programar

### 7.1 Observación disciplinaria vs. caso

Una observación disciplinaria **no es** un caso. Reglas:
- Tipo I leve: puede quedar como observación (con compromiso) sin caso.
- Si el docente indica gravedad, o la coordinación tipifica II/III: **caso obligatorio**, la observación queda enlazada.
- Un caso Tipo I puede crearse sin observación previa.
- Al abrirse el caso, la observación original **no se edita**; el caso la referencia.

### 7.2 Estados y cierre del caso

Ver 4.8. Un caso se cierra con resultado y con el protocolo completo. Reabrir solo ADMIN con motivo. Seguimientos posteriores al cierre no se
permiten: se reabre.

### 7.3 Reincidencia

Muchos manuales acumulan faltas ("tres leves = una grave"). El maestro no lo establece. **No se asume.** Si la institución lo requiere, sería una
regla configurable de la tipificación (conteo en ventana de tiempo), **sugerida** a coordinación, nunca automática.

### 7.4 Descuento en notas (decisión D5) — **DIFERIDO por decisión del usuario**

> **No se diseña ni se programa en M14/M15.** Lo que sigue se conserva solo como referencia para cuando se retome. Mientras tanto: la
> convivencia **no afecta notas**, `ConfiguracionConvivencia` no incluye campos de impacto en notas, la plantilla T4 **no** trae la columna
> `impacto_en_notas`, y M12/M17 no se tocan.

**Hechos del sistema hoy:** la nota de una asignatura sale de actividades (`Activity`) por componente Saber/Hacer/Ser con peso configurable por año
(`ponderacion_componentes`, 40/40/20 por defecto) y se consolida por M12/M17 con la escala del año (`escala_evaluacion`). No existe nota de
comportamiento ni "tipos de nota". `assertPeriodNotLocked` es el único punto que decide si se digitan notas.

**Opciones:**

| Opción | Qué hace | Riesgos |
|---|---|---|
| **A. Sin impacto en notas (recomendada por defecto)** | La convivencia se registra y se informa; el boletín (M17) puede mostrar un resumen cualitativo | Ninguno técnico; la institución debe aceptar que no habrá "descuento" |
| **B. Valoración de comportamiento independiente** | Entidad aparte por estudiante y periodo, con valor derivado de reglas configurables o digitado por el director de grupo, mostrada **como línea propia** en M17, **fuera** del promedio de áreas y del puesto | Requiere diseño en M17; no toca M12. Es la forma que muchos colegios ya usan |
| **C. Descuento sobre una nota académica** | Resta décimas a un componente (p. ej. "Ser") o a una asignatura | **Mayor riesgo.** Legal: la evaluación académica y la sanción disciplinaria son procesos distintos y esta práctica ha sido cuestionada; debe estar en el SIEE **y** en el manual y validarse con asesoría jurídica. Técnico: modifica resultados de M12 (otro módulo), choca con el cierre de periodo, crea doble fuente de verdad y rompe la trazabilidad si no se calcula en lectura |

**Si la institución insiste en C**, condiciones mínimas: (1) configuración solo ADMIN, por año, en M32; (2) aplica **solo** tras decisión
**en firme** (RN-15-06); (3) se calcula **al generar el boletín**, nunca editando las notas de actividades; (4) tope máximo configurable;
(5) reversible si el caso se anula o reabre; (6) visible en el boletín, con su fundamento; (7) no se aplica en periodos CERRADOS ya emitidos.

### 7.5 Frontera con otros módulos (compromisos, citaciones)

M14 oficial incluye compromisos, citaciones y seguimiento; M24 trata reuniones, actas y compromisos genéricos; M27/M28 entregan
notificaciones. Para no duplicar: **M14/M15 son dueños del compromiso y de la citación relacionados con un hecho** (qué, a quién, cuándo,
resultado); **M24/M27/M28** serán los canales y la agenda general. Hoy, sin esos módulos, la citación se **registra** (fecha, medio, quién
informó, resultado) pero no se envía. No se construye un motor de reuniones en M14.

---

## 8. Integración con el resto de Klassy

### 8.1 Módulos que participan

| Módulo | Qué aporta o consume | Cuidado |
|---|---|---|
| M01 | Sede, jornada, grado, grupo | Alcance por sede en todos los accesos |
| M02 | Usuarios, roles, `sedes_ids` | Decisión D1; **`eliminarUsuario` debe contar observaciones/casos** (hoy cuenta vínculos de otros módulos); `puedeGestionarRol` no aplica a convivencia, hace falta otra función de permiso |
| M03 | Persona, acudientes, banderas, autorización de datos, pestaña Observador | Un estudiante sin matrícula activa sigue existiendo |
| M04 | Matrícula y grupo vigentes en la fecha | Guardar el contexto (grupo) del hecho |
| M05 | Año, periodo, calendario, días no lectivos | Casos que cruzan años; fecha del hecho en día no lectivo es válida (un hecho ocurre cualquier día) pero la asistencia no cuenta |
| M06 / M08 | Áreas, asignaturas, asignaciones y dirección de grupo | Mismo criterio que `permisoSobreClase` de M13; cambio de director |
| M13 | Contexto de inasistencias (solo lectura en la vista) | No duplicar datos de asistencia |
| M12 | Solo si se aprueba 7.4-C | Cambio fuera de alcance de M14/M15 |
| M17 | Banco de descriptores; línea de comportamiento si 7.4-B | **Un solo catálogo**; M17 no se implementa ahora |
| M16 | Frontera: bienestar/PIAR | Bandera de PIAR visible como aviso en medidas; no se mezclan datos |
| M20 / M30 | Indicadores | Datos agregados, sin identificar menores cuando sea posible |
| M24 / M27 / M28 / M29 | Canales, portal, notificaciones, archivo | Contratos documentados, no implementados |
| M31 | Auditoría | Ver 10.2 |
| M32 | Configuración | Política y tipificación por año |

### 8.2 ¿Deben M14/M15 enviar información a otros módulos? Consecuencias

| Destino | Qué | Consecuencia |
|---|---|---|
| M03 | Contenido de la pestaña | Seguro y esperado. Cada sección con su permiso. |
| M17 | Descriptores; resumen opcional | **Una sola fuente de frases.** Un resumen de convivencia en el boletín **expone** información disciplinaria a quien vea el boletín (incluido el acudiente) y a veces a terceros que lo reciben: debe ser **cualitativo y configurable**, nunca detalle de casos. |
| M27 / M28 | "Tiene una citación", "hay una observación" | Notificar **sin contenido** (solo el hecho de que existe algo y dónde verlo con sesión). Un correo con el relato es una fuga. |
| M20 / M30 | Conteos | Evitar datos que identifiquen a un menor en tableros; mínimo de celdas por agregado. |
| M12 | Descuento | Solo opción C; ver 7.4. |
| M19 (promoción) | **No** | El maestro separa resultado académico, decisión de promoción y soporte: la convivencia no decide promoción de forma automática. |

---

## 9. Escenarios excepcionales

| Escenario | Tratamiento propuesto |
|---|---|
| Observación al estudiante equivocado | Anular con motivo y volver a registrar. Si ya fue visible a un acudiente, queda en auditoría de lectura para saber quién lo vio. |
| Estudiante trasladado de grupo en el año | El Observador es del estudiante; el grupo del hecho queda como contexto. El docente del grupo anterior pierde acceso a nuevas consultas salvo sus propios registros. |
| Estudiante retirado | Solo coordinación registra o consulta; se conserva. |
| Cambia el director de grupo | El nuevo ve el Observador **desde su designación** (decisión D6: ¿ve lo anterior del año?). Recomendado: ve lo del año en curso. |
| Docente reemplazado o desactivado | Sus registros se conservan con su autoría; no se borra el usuario (M02 ya lo impide con vínculos: hay que agregar estos). |
| Docente sin asignación vigente (incapacidad, reemplazo informal) | Coordinación registra "en nombre de", y se guarda quién lo hizo realmente. |
| Hecho entre estudiantes de **sedes distintas** | El caso pertenece a una sede (la del reporte); quien lo gestiona necesita acceso a ambas: caso explícito de acceso multisede. |
| Hecho con varios involucrados | Un registro por estudiante; en el caso, lista de involucrados con redacción por rol del consultante (RN-15-07). |
| Conflicto de interés (docente reportante es miembro del comité, o pariente) | Recusación y exclusión de la deliberación; queda registrada. |
| **Estudiante adulto** (jornadas nocturna/sabatina) | `es_menor` por fecha de nacimiento: no se notifica a acudiente salvo autorización; protocolos de menores no aplican igual. |
| Estudiante con PIAR/discapacidad | Aviso visible al aplicar medidas: consultar a orientación (flag de M03; sin leer datos de M16). |
| Presunto hecho que involucra a un **adulto de la institución** | Fuera del alcance de convivencia estudiantil; se deriva por la ruta institucional. No se modela en M15. |
| Denuncia anónima o de tercero | Creación directa por coordinación con origen "tercero/anónimo". |
| Caso abierto al cerrar el año | Sigue abierto (RN-15-09); el nuevo año lo hereda con el mismo consecutivo. |
| Estudiante graduado o retirado con caso abierto | El caso continúa hasta cierre. |
| Acudiente que pide rectificar o aclarar (habeas data) | No se edita el registro: se anexa su **aclaración** y queda en el historial (M27 la canalizará). |
| Falla en el flujo (caso Tipo III sin remisión en el plazo) | Alerta visible a coordinación y ADMIN; no se cierra el caso. |
| Retención cumplida | Anonimización o supresión según política (sección 10.4), con acta. |
| Registro masivo equivocado (Excel) | Importación **atómica** (todo o nada) y reversible por lote: anulación del lote por ADMIN. |

---

## 10. Seguridad funcional y técnica

### 10.1 Principios

Mínimo necesario y **need-to-know** (Ley 1581: finalidad, circulación restringida); **interés superior del menor**; trazabilidad de escritura y
**lectura**; defensa en profundidad (la UI oculta, **el servidor decide**); nada se borra sin rastro.

### 10.2 Hallazgos del código que afectan este diseño

| Hallazgo | Dónde | Riesgo en M14/M15 | Mitigación |
|---|---|---|---|
| La auditoría solo registra **eventos de escritura**; no existe auditoría de lectura | `audit.service.ts`, `ACCIONES_AUDITORIA` | Nadie sabría quién consultó un caso de un menor | Eventos `OBSERVADOR_CONSULTADO`, `CASO_CONSULTADO`, `ARCHIVO_DESCARGADO` (id, usuario, motivo de vista), registrados **siempre** para el detalle de casos II/III (sin muestreo) |
| El log es mutable y `detalle` es texto libre | `auditLog.model.ts` | Alguien con acceso a Mongo borra rastro; un `detalle` con relato filtra datos a quien lea la auditoría (ADMIN) | Solo ids y acción en `detalle`, **nunca contenido**; colección append-only con permisos de BD y copia/exportación periódica |
| `sedes_ids` no se usa en ningún servicio | `user.model.ts`, `services/*` | Coordinador de una sede ve convivencia de otra | Filtro por sede **en la consulta** (no después), desde el primer endpoint |
| Permisos dispersos por ruta (`checkRole`) + chequeo fino por servicio | `routes/*`, `attendance.service.ts` (`permisoSobreClase`) | Una ruta nueva olvida el chequeo fino | Una función central `permisoSobreEstudiante(usuario, estudiante, accion)` usada por **todos** los servicios de M14/M15; pruebas unitarias de la matriz de permisos |
| `datosSensibles.ts` supone a SECRETARIA con "convivencia" | `utils/datosSensibles.ts` | Acceso excesivo por una suposición | Decisión D4; corregir comentario |
| Archivos en disco bajo `uploads/` con descarga por sesión | `uploadPaths.ts`, M13/M04 | Path traversal, acceso directo, archivo con firma falsa | Reutilizar `firmasArchivo` (firma de bytes) y rutas generadas por el servidor desde ids; sin nombre del cliente en la ruta; sin servir `uploads/` como estático |
| `eliminarUsuario` solo cuenta vínculos conocidos | `user.controller.ts` | Borrar un docente deja registros huérfanos o sin autor | Agregar observaciones y casos al conteo de vínculos (cambio mecánico en M02) |
| Mongo sin cifrado a nivel de aplicación | despliegue en VPS por colegio | Datos de menores legibles con acceso al disco | Cifrado de disco/volumen y backups cifrados con acceso restringido; evaluar cifrado de campo de los textos de casos II/III |

### 10.3 Vulnerabilidades y controles específicos

| Amenaza | Control |
|---|---|
| **IDOR** (pedir un id de otro estudiante) | Permiso por estudiante en cada endpoint; respuesta **404 uniforme** para "no existe" y "no autorizado" |
| **Listados que filtran después de leer** | Filtro en la consulta (por sede, grupo, asignación); paginación obligatoria; límites |
| **Over-exposure en respuestas** | Listados sin texto completo; DTO por rol; acudiente y estudiante: campos redactados; **nunca** nombres de otros menores del caso |
| **Texto libre**: datos de salud, diagnósticos o de terceros | Longitud máxima, advertencia en pantalla, prohibición de datos clínicos (van a M16), revisión por coordinación |
| **Inyección de fórmulas** al exportar a Excel/CSV | Neutralizar celdas que empiezan por `=`, `+`, `-`, `@` al **generar** archivos |
| **Archivos maliciosos al importar Excel** (zip bomb, macros, tamaño) | Límite de tamaño y de filas, firma ZIP (como M13), `.xlsx` sin macros, lectura con `exceljs` sin evaluar fórmulas, timeouts |
| **Subida de evidencias** | Firma de bytes, tamaño máximo, carpeta por caso, nombres generados, descarga con sesión y permiso por caso |
| **Asignación masiva (mass assignment)** | Joi sin campos desconocidos; el servidor fija autor, año, sede y estado |
| **Escalamiento de privilegios** | Un docente no puede tipificar ni cerrar; transiciones de estado en tabla y por permiso; reabrir solo ADMIN con motivo |
| **Manipulación de actas** | Acta firmada inmutable; hash del PDF generado en el momento de firmar; consecutivos con contador atómico |
| **Enumeración / fuerza bruta de búsqueda de estudiantes** | Rate limiting existente (`express-rate-limit`) y búsqueda restringida al alcance del usuario |
| **Concurrencia**: dos usuarios cambian el estado del caso a la vez | Transacciones y versionado optimista; `runTransaction` con reintento (patrón del proyecto) |
| **Fuga por notificaciones** | M28/M27 solo avisan que existe algo; el contenido se ve con sesión |
| **Reportes/PDF descargados y reenviados** | Marca con usuario y fecha, evento de auditoría de generación, vigencia corta del enlace (descarga por sesión, nunca URL pública) |
| **Datos en logs de errores** | No registrar cuerpos de peticiones de M14/M15 en logs |
| **Menor de edad y adulto** | Cálculo de `es_menor` en servidor; controla notificaciones y protocolo |

### 10.4 Privacidad, conservación y derechos del titular

- **Base y finalidad:** el tratamiento se funda en la función educativa y el manual de convivencia aceptado en la matrícula; la finalidad es seguimiento escolar y convivencia, **no otros usos**. Validar el aviso de privacidad y la autorización (Ley 1581) con la institución.
- **Minimización:** no copiar a M14/M15 datos que ya viven en M03 (salud, EPS); se leen por referencia con el permiso de quien consulta (`ocultarSaludAdministrativa` ya limita al docente).
- **Conservación configurable:** plazo por tipo de registro en `ConfiguracionConvivencia` conforme a la tabla de retención documental de la institución (Ley 594 de 2000, a validar). Al vencer: anonimización o supresión con acta; sin plazo por defecto quemado.
- **Derechos del titular (habeas data):** consulta, actualización, rectificación y supresión se canalizan **por el acudiente** (menor). El sistema debe poder entregar copia y registrar la **aclaración**, no editar el hecho.
- **Circulación:** nada sale a terceros salvo remisión a autoridades competentes (registrada con oficio) o por orden de autoridad.
- **Registro de acceso:** ADMIN (y el rector) pueden consultar quién accedió a un caso; el propio titular podría pedirlo.
- **Casos Tipo III, violencia sexual y datos de salud mental:** nivel de confidencialidad máximo (solo coordinación de convivencia, orientación y rector), sin vista de listado general.
- **Ley 1620:** confidencialidad de los casos y reserva de identidad de los involucrados.
- **Responsable del tratamiento:** la institución (cada colegio tiene su instalación y su base de datos): sin conexión entre instalaciones.

---

## 11. Carga masiva por Excel y CSV

### 11.1 Pertinencia

| Proceso | ¿Carga masiva? | Razón |
|---|---|---|
| Catálogo: tipos, categorías, descriptores | **Sí** | Volumen real (cientos de frases), bajo riesgo |
| Tipificación de faltas del manual | **Sí** (solo ADMIN) | El manual ya existe en un documento; reduce errores de digitación |
| Observaciones **académicas/comportamentales** | **Sí, acotada** | Útil al cierre de periodo; pasan por las mismas reglas del registro individual |
| Observaciones **disciplinarias** y **casos** | **No** | El debido proceso exige pasos y revisión individuales; la carga masiva los saltaría |
| Migración histórica de un observador antiguo | **Sí, una sola vez, solo ADMIN** | Marcada como "importada", solo lectura |
| Miembros del comité, entidades externas | No | Pocos registros; el formulario basta |

### 11.2 Funcionamiento general (patrón M13, reutilizable)

1. **Plantilla generada por el sistema** (`GET .../plantilla/<proceso>`): `.xlsx` con hoja de datos, encabezados fijos, **listas desplegables** con los valores vigentes del catálogo (tipos, categorías, estados), una hoja **Instrucciones** (qué significa cada columna, ejemplos) y una hoja oculta `Datos` con versión de plantilla, institución y contexto (grupo/periodo/fecha cuando aplica), como en M13.
2. **Carga** (`POST .../importar/<proceso>`): `multer` en memoria, **máximo 2 MB** y un tope de filas (p. ej. 500; configurable). Acepta **`.xlsx` y `.csv`**
   (decisión del usuario). `.xlsx`: firma ZIP verificada y lectura con `exceljs`. `.csv`: se lee **siempre con `leerCsv`** (`utils/csv.ts`: separador coma o punto y coma,
   BOM, Windows-1252, línea `sep=;`, encabezados normalizados), nunca con un parser a mano (regla de CLAUDE.md).
   **Un solo canal:** los dos formatos se convierten a las mismas filas normalizadas y desde ahí pasan **por el mismo validador y el mismo servicio**.
   Diferencia práctica: el CSV no trae listas desplegables ni hoja oculta, así que el **contexto** (grupo, periodo, fecha) va en **columnas explícitas**
   o en campos del formulario de carga, no en `Datos`; y no hay hoja de instrucciones (la guía en pantalla `GuiaColumnas` la reemplaza).
3. **Validación total antes de escribir:** se valida **toda** la hoja; si hay un error de fila, **no se guarda nada** y se devuelve la lista de errores por fila (error de fila, no descarte silencioso). Valores fuera de lista = error. Fechas `YYYY-MM-DD` (o `DD/MM/AAAA`, como Excel guarda).
4. **Misma regla que el registro individual:** cada fila pasa por el **mismo servicio** que el formulario (permisos, alcance, matrícula activa, snapshot de texto). Nunca un camino paralelo.
5. **Atómica y reversible por lote:** transacción única; cada importación genera un `lote_id` y un evento de auditoría (usuario, archivo, hash, conteos); **anular lote** (ADMIN, con motivo) revierte todo el lote.
6. **Duplicados:** clave natural por proceso (ver plantillas); un reenvío del mismo archivo no duplica (idempotente) y reporta "ya existente".
7. **Identificación de personas por `numero_documento`** como texto (conserva ceros), no por nombre.
8. **Guía en pantalla:** componente `GuiaColumnas` alimentado por `lib/columnasImportacion.ts`, **actualizado en el mismo cambio** que la plantilla (regla de CLAUDE.md).
9. **Seguridad:** neutralización de fórmulas al generar; sin macros; límite de tamaño; el archivo cargado no se conserva (solo su hash y el resultado).

### 11.3 Plantillas (una por proceso; estructura definida por el sistema)

**T1 — Tipos de observación** *(ADMIN, COORDINADOR)*

| Columna | Obligatoria | Regla |
|---|---|---|
| `codigo` | Sí | Único; clave natural |
| `nombre` | Sí | Único activo |
| `familia` | Sí | Lista: ACADEMICA / COMPORTAMENTAL / DISCIPLINARIA (define las banderas base) |
| `visible_acudiente` | Sí | SI/NO |
| `puede_generar_caso` | Sí | SI/NO (solo DISCIPLINARIA = SI) |
| `requiere_compromiso` | No | SI/NO |
| `estado` | No | ACTIVO por defecto |

**T2 — Categorías de descriptores** *(ADMIN, COORDINADOR)*: `codigo` (único), `nombre`, `orden`, `estado`.

**T3 — Descriptores (frases)** *(ADMIN, COORDINADOR)*

| Columna | Obligatoria | Regla |
|---|---|---|
| `codigo` | Sí | Clave natural |
| `categoria_codigo` | Sí | Debe existir (T2) |
| `tipo_codigo` | Sí | Uno o varios (`;` o `\|`) de T1 |
| `texto` | Sí | Longitud máxima; sin datos personales (advertencia) |
| `niveles` | No | PREESCOLAR/PRIMARIA/SECUNDARIA/MEDIA, vacío = todos |
| `grados` | No | Códigos de grado, vacío = todos los del nivel |
| `areas` / `asignaturas` | No | Nombres o códigos existentes en M06; vacío = todas |
| `periodos` | No | Números dentro de los periodos del año; vacío = todos |
| `estado` | No | ACTIVO por defecto |

**T4 — Tipificación de faltas del manual** *(solo ADMIN)*

| Columna | Obligatoria | Regla |
|---|---|---|
| `codigo` | Sí | Ej. numeral del manual; único por vigencia |
| `nombre` | Sí | |
| `categoria_manual` | Sí | Etiqueta configurable (leve/grave/gravísima u otra) |
| `tipo_situacion` | Sí | I / II / III (fijo por ley) |
| `descripcion` | Sí | |
| `protocolo_codigo` | No | Debe existir (los protocolos se crean en pantalla; la plantilla solo los referencia) |
| `medidas_sugeridas` | No | Códigos del catálogo de medidas |
| ~~`impacto_en_notas`~~ | — | **Fuera de esta etapa** (D5 diferido): la columna no existe |
| `vigente_desde` / `vigente_hasta` | Sí/No | Dentro de un año lectivo |

**T5 — Observaciones académicas/comportamentales** *(DOCENTE sobre sus grupos; COORDINADOR/ADMIN sobre cualquiera)*

| Columna | Obligatoria | Regla |
|---|---|---|
| `numero_documento` | Sí | Estudiante con matrícula activa en un grupo del alcance del usuario |
| `fecha_hecho` | Sí | No futura; dentro del año y un periodo no cerrado |
| `tipo_codigo` | Sí | Solo familias ACADEMICA y COMPORTAMENTAL (DISCIPLINARIA → error) |
| `descriptores` | Sí* | Códigos de T3 (`;`), dentro del alcance del docente |
| `comentario` | Sí* | *Se exige al menos uno de `descriptores` o `comentario`; longitud máxima |
| `asignatura_codigo` | No | Si el docente registra en clase |
| `compromiso_descripcion` / `compromiso_fecha_limite` | No | Juntos o ninguno |

Hoja oculta `Datos`: año, periodo, grupo (si se descarga por grupo; **recomendado**: la plantilla se baja **por grupo**, con la lista de
estudiantes precargada, igual que la planilla de asistencia de M13).

**T6 — Migración de observador histórico** *(solo ADMIN, una vez por año de origen)*

Columnas: `numero_documento`, `fecha_hecho`, `anio_lectivo`, `tipo_codigo`, `descripcion` (texto original), `registrado_por_documento` (si existe usuario) o
`registrado_por_nombre` (texto), `grupo_origen`. Los registros quedan marcados `importado=true`, **solo lectura**, sin compromisos activos,
con su lote y hash. No genera casos ni notificaciones.

### 11.4 Reglas de acceso a la carga

| Plantilla | Quién descarga | Quién importa |
|---|---|---|
| T1, T2, T3 | ADMIN, COORDINADOR | ADMIN, COORDINADOR |
| T4, T6 | ADMIN | ADMIN |
| T5 | DOCENTE (su alcance), COORDINADOR, ADMIN | los mismos |

---

## 12. Funcionalidades propuestas cuya pertinencia debe confirmarse

| Funcionalidad | Veredicto | Motivo |
|---|---|---|
| Texto final generado con vista previa | **Pertinente** | Ahorra tiempo y unifica redacción; con snapshot |
| Entrada única "Nueva observación/falta" | **Pertinente** | Buena UX, con permisos por rol |
| Descuento de notas por falta | **No programar sin decisión** | 7.4 |
| El docente tipifica Tipo I/II/III | **Rechazar** | Tipificar es de coordinación/comité |
| "¿Abrir caso?" opcional para II/III | **Corregir** | Debe ser obligatorio |
| Reincidencia automática | **Diferir** | No está en el maestro; sería regla configurable sugerida |
| Observación visible al estudiante | **Pertinente (decidido)** | D2: sí, con las restricciones de 5.5 |
| Integración con reporte nacional de convivencia | **Diferir** | Fuera de alcance; solo exportar datos |
| Notificar el contenido por correo | **Rechazar** | Fuga de datos de menores |
| Motor de reuniones propio | **Rechazar** | Es M24 |
| Carga masiva de disciplinarias/casos | **Rechazar** | Salta el debido proceso |
| Carga masiva de catálogos y observaciones leves | **Pertinente** | 11 |

---

## 13. Decisiones pendientes (resumen) y propuesta de desarrollo

### 13.1 Estado de las decisiones

| ID | Decisión | Estado | Valor |
|---|---|---|---|
| D1 | Coordinador de convivencia | **Tomada** | Rol nuevo `COORDINADOR_CONVIVENCIA`, rango 70, sede obligatoria (5.2) |
| D2 | ¿El estudiante ve sus observaciones? | **Tomada: SÍ** | Ve **solo las suyas**, solo los tipos marcados `visible_estudiante`, solo el texto final; nunca casos ni nombres de otros menores (5.5) |
| D3 | ¿Qué ve el docente de clase? | **Tomada** | El docente **solo registra y ve lo que él mismo registró**; no consulta el Observador del estudiante. El director de grupo ve el de su grupo (D6) |
| D4 | Acceso de SECRETARIA | **Tomada** | Sin acceso |
| D5 | Impacto en notas | **Diferida** | Fuera de esta etapa |
| D6 | Qué ve el director de grupo | **Provisional** | Por ahora el director ve el historial completo de los estudiantes **de su grupo actual** (incluidos años anteriores); sin contenido de casos Tipo II/III. Se valida con el equipo del usuario; vive en una sola función de permisos, cambiarlo es un ajuste puntual |
| D7 | Quién tipifica y reclasifica | **Tomada (aclarada)** | El docente **sí registra**, pero no decide el tipo: elige la falta del catálogo del manual y el tipo viene de ese catálogo. Reclasificar (subir) lo hace `COORDINADOR_CONVIVENCIA` o el comité; bajar de tipo solo ADMIN con motivo |
| D8 | Quién configura el manual | **Tomada** | ADMIN **y** `COORDINADOR_CONVIVENCIA`, sin flujo de aprobación adicional (cada cambio queda en auditoría); vigencia por año |
| D9 | Plazos de enmienda y anulación | **Tomada** | Configurables (propuesta inicial: 48 h) |
| D10 | Retención | **Tomada** | Configurable, sin purga automática, con reporte de vencidos |
| D11 | Formato de cargas masivas | **Tomada** | `.xlsx` y `.csv` por un mismo canal (11.2) |
| D12 | Reincidencia | **Tomada: configurable** | Reglas configurables (tipo, nº de ocurrencias, ventana, tipo destino). El sistema **sugiere** el escalamiento y quien tipifica lo confirma (16.3) |
| D13 | Pruebas con base de datos | **Tomada: SÍ** | Se agrega `mongodb-memory-server` (con réplica, para transacciones) solo como dependencia de desarrollo |

**Regla del plan:** las decisiones "pendientes" se resuelven en la **Fase 0** con el valor propuesto como punto de partida. Ninguna fase que dependa de
una decisión pendiente arranca sin cerrarla.

### 13.2 Propuesta de fases inicial (reemplazada por el plan detallado de la sección 14)

1. **Fase 1 — M14 núcleo:** catálogos (T1–T3 sin Excel), observaciones individuales y grupales, permisos centrales + alcance por sede, auditoría de lectura, pestaña "Observador" en la ficha.
2. **Fase 2 — M15 casos:** tipificación y protocolos, casos Tipo I/II/III con estados, involucrados, seguimientos, compromisos y citaciones registradas, vínculo desde observaciones.
3. **Fase 3 — M15 comité:** composición, sesiones, actas, remisiones, PDFs, alertas calculadas.
4. **Fase 4 — Excel:** plantillas T1–T6 (primero T1–T4, luego T5, por último T6).
5. **Después (otros módulos):** M17 (descriptores, línea de comportamiento), M27/M28 (notificar sin contenido), M24, M29, M30.

### 13.3 Cambios mínimos en módulos existentes que habría que aprobar

- **M02:** **rol `COORDINADOR_CONVIVENCIA`** (D1, tabla de 5.2), conteo de vínculos al eliminar usuario, función de alcance por sede reutilizable (solo la usan M14/M15; no se "arregla" el alcance por sede de otros módulos en este trabajo).
- **M03:** reemplazar el placeholder de la pestaña "Observador y bienestar".
- **`datosSensibles.ts`:** corregir el comentario sobre SECRETARIA (D4, decidido). Verificar además qué parte de la ficha del estudiante puede ver el rol nuevo (la salud administrativa se le oculta, como al DOCENTE).
- **`auditLog.model.ts`:** nuevas acciones de auditoría (incluidas lecturas).
- **`constants/enums.ts`:** enums nuevos (tipos de situación I/II/III, estados de caso, familias de observación).
- **Frontend:** `navigation.ts`, `lib/columnasImportacion.ts`, rutas en `App.tsx` con `ProtectedRoute`.

Ningún otro módulo debería tocarse en M14/M15.

---

## 14. Plan a seguir

### 14.1 Principios de ejecución

- **Una rama y un PR por fase**, siempre desde `main` actualizado (`main` está protegida: todo entra por pull request). Esta rama (`feature/m14_m15_observaciones_convivencia`)
  sirve para la Fase 0 y 1; las siguientes salen de `main` ya fusionado: `feature/m14_observaciones_nucleo`, `feature/m15_casos_convivencia`,
  `feature/m15_comite_actas`, `feature/m14_m15_cargas_masivas`.
- **Commits por tema** dentro de cada fase (modelo → servicio → rutas → frontend → pruebas → documentación), no un commit gigante.
- **Antes de cada commit:** `tsc` del backend y del frontend, `npm test`, `oxlint`. Pruebas unitarias para toda regla pura nueva (como `cargaDocente`).
- **Alcance estricto:** ninguna fase implementa lógica de M12, M16, M17, M24, M27, M28, M29. Sus contratos se documentan; no se construyen.
- **Cada fase actualiza CLAUDE.md** con las reglas que no se ven leyendo un solo archivo (patrón de las secciones M13 y M06/M08), y `lib/columnasImportacion.ts` cuando toque una carga.
- **Cumplimiento de estilo (CLAUDE.md):** código y nombres nuevos en español; capas modelo → servicio → controlador; Joi solo en `validators/`; `ESTADO_ACTIVO` en consultas;
  TanStack Query con un hook por dominio; formularios en Drawer; componentes de `ui/` sin variantes ni colores nuevos; fechas con `lib/fechas.ts`.

### 14.2 Fase 0 — Cierre de decisiones y preparación (sin código de producto)

**Entregables**
1. Decisiones D2, D3, D6–D10 y D12 **cerradas** (13.1); D6 queda provisional hasta hablarlo con el equipo.
2. **D13 (aprobada) — pruebas con base de datos:** se agrega `mongodb-memory-server` **con réplica** (necesaria para las transacciones) como dependencia de desarrollo, solo para pruebas de integración. Se instala cuando la primera fase que lo necesite lo requiera (Fase 2).
3. **Revisión jurídica** de la lista de normas de 4.3 y de los protocolos Tipo I/II/III con quien la institución designe; el resultado se anota en el documento.
4. Definir con la institución: plazos de enmienda/anulación, plazo de alerta de remisión Tipo III, retención, y catálogo inicial (tipos, categorías, entidades externas).
5. Aprobar la versión final de este análisis.

**Criterio de salida:** tabla 13.1 sin "pendiente" (o con "diferida" explícita).

### 14.3 Fase 1 — Rol y base de permisos (transversal, cambio mínimo)

**Rama:** esta. **Tamaño:** pequeño.

| Capa | Tarea |
|---|---|
| Backend | Agregar `COORDINADOR_CONVIVENCIA` a `ROLES` y `JERARQUIA_ROLES` (70). Exigir `sedes_ids` no vacío para este rol al crear/editar usuarios. |
| Backend | Función `alcanceDeSedes(usuario)` (ADMIN = todas; resto = sus sedes) y `permisoSobreEstudiante(usuario, estudiante, accion)` en `utils/`, **pura y con pruebas** (la matriz de 5.4 hecha prueba). |
| Backend | Acciones de auditoría nuevas (escritura **y lectura**) en `auditLog.model.ts`. |
| Backend | `eliminarUsuario`: contar observaciones/casos como vínculos (queda preparado; sin datos aún). |
| Backend | Corregir el comentario de `datosSensibles.ts` y ocultar la salud administrativa también al rol nuevo. |
| Backend | **Revisión de rutas solo con `authenticate`** (sin `checkRole`): decidir una por una si el rol nuevo debe quedar fuera; anotar resultado. |
| Frontend | `types/api.ts`, `Badge.tsx` (etiqueta y tono existente), `DashboardPage.tsx`, verificar `UsersPage` y la importación de usuarios. |
| Documentación | CLAUDE.md: sección M02 (jerarquía y rol nuevo). |
| Pruebas | `puedeGestionarRol` con el rol nuevo (ADMIN sí; COORDINADOR no; DOCENTE no; él mismo no); matriz de `permisoSobreEstudiante`. |

**Criterio de salida:** un ADMIN crea un coordinador de convivencia con sede; ese usuario inicia sesión y **no puede abrir ningún módulo existente** salvo los de
lectura general acordados; `tsc`, tests y lint en verde.

### 14.4 Fase 2 — M14 núcleo: catálogo y observaciones

**Rama:** `feature/m14_observaciones_nucleo`. **Tamaño:** grande. **Depende de:** Fase 1, D3, D6, D9.

| Capa | Tarea |
|---|---|
| Modelos | `TipoObservacion` (banderas), `CategoriaDescriptor`, `Descriptor` (alcance opcional), `Observacion` (snapshot de texto, contexto de matrícula/grupo, autor y calidad, visibilidad, enmiendas, anulación). Índices por estudiante+año, grupo+periodo, autor. |
| Siembra | Catálogo mínimo idempotente la primera vez (como los 4 estados de M13): 3 tipos y categorías base. |
| Servicios | Catálogo (crear/editar/desactivar, nunca eliminar); registrar (individual y grupal con un registro por estudiante); enmendar; anular; consultar con DTO por rol y **auditoría de lectura**; periodo derivado de la fecha con las utilidades de M05 (calendario de la sede); alcance del docente con M08 (CLASE y DIRECCION_GRUPO activas). |
| Validadores | Joi estricto en `validators/`; longitud máxima del texto libre; ids ObjectId; sin campos desconocidos. |
| Rutas | `/observaciones` (catálogos, registro, consulta, enmienda, anulación), con `checkRole` grueso + permiso fino en el servicio. |
| Búsqueda | Buscador de estudiantes **propio de M14** (acotado a sede y vínculo), sin abrir `/students`. |
| Frontend | Hook `useObservaciones.ts`; página de catálogo (ADMIN/COORDINADOR); página de registro (docente: grupo → estudiante → Drawer con descriptores, comentario y vista previa); componente **Línea de tiempo** reutilizable; contenido de la pestaña "Observador" en `StudentDetailPage`; entradas en `navigation.ts` por rol; rutas con `ProtectedRoute`. |
| Pruebas | Unitarias: generación y congelado del texto, alcance del docente, derivación del periodo, enmienda/anulación; integración (si D13): registro concurrente y permisos. |
| Documentación | CLAUDE.md: sección M14. |

**Criterio de salida:** un docente registra una observación en un grupo que dicta y en uno que dirige, y **no** en uno ajeno; el coordinador la ve; el estudiante equivocado
se corrige con anulación; cada lectura de detalle queda en la auditoría.

### 14.5 Fase 3 — M14 compromisos y solicitud de caso

**Rama:** misma de la Fase 2 o `feature/m14_compromisos`. **Tamaño:** mediano.

- Compromisos con responsable, fecha límite y estado; seguimiento; vencidos calculados por fecha.
- **Solicitud de caso:** como M15 todavía no existe, una observación disciplinaria grave queda marcada `solicitud_caso` y aparece en una **bandeja de
  `COORDINADOR_CONVIVENCIA`**; al construir M15 se convierte en caso. Así no hay dependencia circular ni obligación opcional.
- Citaciones: **solo registro** (fecha, medio, quién informó, resultado); sin envío (M27/M28).
- Pruebas de estados de compromiso y de la bandeja.

### 14.6 Fase 4 — M15 casos de convivencia

**Rama:** `feature/m15_casos_convivencia`. **Tamaño:** grande. **Depende de:** Fase 2/3, D7, D8.

| Capa | Tarea |
|---|---|
| Constantes | Tipos de situación I/II/III, estados del caso y **tabla de transiciones** (patrón `TRANSICIONES_PERIODO`), resultados de cierre. |
| Modelos | `TipificacionFalta`, `MedidaConvivencia`, `ProtocoloConvivencia` (pasos con bandera de obligatorio), `EntidadExterna`, `CasoConvivencia` (involucrados, atención, medidas, pasos, seguimientos, compromisos, remisiones, citaciones, descargos, decisión). |
| Servicios | Abrir (consecutivo anual con `Counter`, en transacción); tipificar y reclasificar (solo hacia arriba, con motivo); registrar atención y notificación; avanzar pasos; seguimiento; remisión; cerrar (**bloquea si faltan pasos obligatorios o la remisión en Tipo III**); reabrir (ADMIN, motivo); anular. Vincular y convertir `solicitud_caso`. Excepción deliberada: un caso **no** se bloquea al cerrar el año. |
| Privacidad | DTO por rol: el director de grupo ve **existencia y estado**, no contenido; acudiente (futuro) y estudiante: redacción sin nombres de otros menores; conflicto de interés. |
| Frontend | Página "Casos de convivencia" (lista con filtros por tipo/estado/plazo, Drawer de caso con pestañas Hechos / Involucrados / Protocolo / Seguimiento / Remisiones), pantalla de configuración (solo ADMIN) de tipificaciones, protocolos, medidas y entidades. |
| Pruebas | Transiciones válidas e inválidas; cierre bloqueado; reclasificación; consecutivo sin huecos; redacción por rol; permisos por sede. |
| Documentación | CLAUDE.md: sección M15 (casos). |

**Criterio de salida:** un caso Tipo III no se cierra sin remisión; un Tipo I se media y se cierra con compromisos; ningún rol ve más de lo que le toca.

### 14.7 Fase 5 — M15 comité y actas

**Rama:** `feature/m15_comite_actas`. **Tamaño:** mediano.

- `MiembroComite` por año (usuarios y designaciones externas: personero, representante de padres), `SesionComite`/`ActaComite` con consecutivo anual, asistentes, quórum, recusación.
- Acta en borrador → **firmada** (inmutable; hash del PDF); PDF con `pdfkit` (patrón de `asistenciaPdf.service.ts`), descarga **solo con sesión**, evento de auditoría de generación.
- Alertas **calculadas** (plazo de remisión Tipo III, seguimientos vencidos): se muestran en pantalla; el envío es de M28.
- Pruebas: quórum, recusación, inmutabilidad, consecutivos.

### 14.8 Fase 6 — Cargas masivas (Excel y CSV)

**Rama:** `feature/m14_m15_cargas_masivas`. **Tamaño:** mediano a grande.

1. **Canal común:** lectores `.xlsx` (`exceljs`) y `.csv` (`leerCsv`) → filas normalizadas → validador por plantilla → servicio existente. Entidad `LoteImportacion` (usuario, plantilla, hash, conteos, estado) y **anulación de lote** (ADMIN, motivo).
2. **Orden de entrega:** T1–T3 (catálogo) → T4 (tipificación, ADMIN, **sin** impacto en notas) → T5 (observaciones leves, plantilla por grupo con estudiantes precargados) → T6 (migración histórica, ADMIN, solo lectura).
3. Descarga de cada plantilla `.xlsx` generada por el sistema (listas desplegables, hoja de instrucciones, hoja oculta de contexto) y plantilla `.csv` equivalente con contexto en columnas.
4. Neutralización de fórmulas al generar; límites de tamaño y filas; guía en pantalla con `GuiaColumnas` y `lib/columnasImportacion.ts` **en el mismo cambio**.
5. Pruebas con archivos generados en memoria: fila inválida = nada se guarda; duplicado idempotente; documento ajeno; familia DISCIPLINARIA rechazada en T5; anulación de lote.

### 14.9 Fase 7 — Endurecimiento y cierre

- Revisión de seguridad (checklist de la sección 10 hecha prueba: IDOR, filtros por sede, 404 uniforme, DTO por rol, descargas, auditoría de lectura) y ejecución de `/security-review` sobre el diff.
- Política de **retención** configurable y su procedimiento de anonimización (con acta), si la institución ya definió plazos.
- CLAUDE.md completo para M14/M15; cierre del documento de análisis con lo realmente implementado y lo diferido.

### 14.10 Lo que queda explícitamente fuera (con su dueño)

| Pendiente | Dueño |
|---|---|
| Descuento o valoración de convivencia en notas | Diferido (D5); si se retoma toca M12/M17 |
| Descriptores y línea de comportamiento en el boletín | M17 |
| Portal del acudiente y del estudiante, aclaraciones | M27 |
| Envío de citaciones y avisos (sin contenido) | M28 |
| Agenda general de reuniones | M24 |
| Repositorio documental de actas y evidencias | M29 |
| Rol y datos de Orientación; relación con PIAR | M16 |
| Alcance por sede en M06/M08 y demás módulos | Tarea aparte (hallazgo C2 del análisis anterior) |
| Reporte externo de convivencia | Posterior; solo exportación de datos |

### 14.11 Riesgos del plan

| Riesgo | Mitigación |
|---|---|
| Cambiar reglas de CLAUDE.md (rol nuevo) sin que otro desarrollador lo vea | Actualizar CLAUDE.md en el mismo PR de la Fase 1 |
| Reglas legales cambian o se interpretan distinto | Fase 0 con asesoría; protocolos y plazos **configurables**, no quemados |
| Fuga de datos de menores por una consulta mal filtrada | Función central de permisos con pruebas; filtro en la consulta; auditoría de lectura desde la Fase 2 |
| Concurrencia en consecutivos y estados | `runTransaction` con reintento y `Counter` (patrones existentes) |
| Alcance que crece (M17/M27/M28 "ya que estamos") | Regla de alcance estricto; contratos documentados, no código |
| Falta de pruebas con base real | Decisión D13 en la Fase 0 |

---

## 15. Registro de decisiones del usuario (2026-10-02)

| # | Decisión | Efecto en el análisis |
|---|---|---|
| 1 | `main` incluye ya el PR #5 (M06/M08); la rama de trabajo parte de `2c1498b` | Base del código analizado |
| 2 | Descuento de décimas en notas: **para después** | 7.4 marcado como diferido; sin impacto en notas en T4 ni en la configuración |
| 3 | Se **agrega el rol** de coordinador de convivencia como en la documentación | 5.2, Fase 1; cambia CLAUDE.md (M02) |
| 4 | **Secretaría sin acceso** | D4 cerrada |
| 5 | Cargas masivas **también en CSV** | 11.2 y Fase 6 |
| 6 | Estudiante ve sus observaciones: **SÍ** | 5.5, D2 cerrada |
| 7 | Pide aclarar si se implementa un Observador y si es el mismo historial | 6.5: sí se implementa; el historial de convivencia es su vista; el escolar de M03 es otra cosa |
| 8 | D3: el docente solo registra y ve lo suyo, no el Observador | 5.4, D3 |
| 9 | D6: el director ve todo lo de su grupo por ahora (a validar con su equipo) | D6 provisional |
| 10 | D8: ADMIN y coordinador de convivencia editan el manual, sin proceso extra | D8 |
| 11 | D12: la reincidencia será configurable | 16.3 |
| 12 | D9, D10: se aceptan las propuestas | 13.1 |
| 13 | Entrega imágenes de un manual de convivencia real como ejemplo | Sección 16 |

---

## 16. Hallazgos del manual de convivencia de ejemplo (I.E. Sagrados Corazones)

Fuente: capturas del manual (arts. 24–28 y cuadro de acciones pedagógicas). Sirve para validar que el modelo sea **configuración**, no código.

### 16.1 Qué trae el manual y dónde cae en el modelo

| Elemento del manual | Dónde cae |
|---|---|
| Faltas con **código** y descripción (1.x y 2.x = Tipo I; 3.x = Tipo II; 4.x = Tipo III) | Catálogo de faltas (T1): `codigo`, `descripcion`, `tipo`, `categoria` ("Compromisos académicos", "Filosofía institucional") |
| Columna **DES** (décimas): Tipo I 0,1–1,5; Tipo II 1,0–2,5; Tipo III sin valor | Campo `descuento_decimas` **solo guardado** en el catálogo (para no reimportar luego). **No se aplica** a notas (D5 diferida) |
| Tipo II: "a partir de la tercera vez se aplica el procedimiento de Tipo III" | Regla de reincidencia configurable (16.3) |
| Faltas "de manera reiterada" (3.20, 4.13) | Descripción del catálogo; sin lógica propia |
| Protocolos por tipo (diagrama): identificación, diálogo, registro en el observador, citación al acudiente, acta, negociación o mediación, compromisos, seguimiento, remisión al CEC | Pasos del protocolo configurables (7.2); el diagrama se transcribe a pasos |
| **Acciones pedagógicas correctivas** (reparar el daño, trabajo social en contrajornada, taller, embellecimiento, desescolarización de 3 a 5 días) | Catálogo configurable de acciones, con campo de duración en días; se asigna a un caso y se hace seguimiento |
| Incumplimiento de la acción pedagógica: baja la nota de convivencia 1,5 y se remite al CEC | Solo se registra el incumplimiento y la remisión; el efecto en nota queda diferido |
| Padre no asiste a la citación: se reporta al ICBF | Remisión a entidad externa (catálogo de entidades); se registra, no se notifica |
| CEC como **segunda instancia de apelación** de faltas Tipo I | Estado/figura de **apelación** del caso ante el comité |
| Desadaptación: se remite a la **Orientadora Escolar** | Remisión interna "orientación" (registro). La orientadora no es un rol del sistema (ver pregunta 16.4) |
| Excusa por desescolarización distinta de la inasistencia regular | Integración con M13: solo se informa, no se toca la planilla (ver 8) |

### 16.2 Consecuencias para el diseño

- El catálogo debe permitir **carga masiva (T1)** desde el manual: son ~70 faltas, no se digitan a mano.
- El tipo de una observación sale del **código de falta** elegido; por eso el docente "registra pero no tipifica" (D7).
- Una falta Tipo II o III registrada por un docente **no abre el caso sola**: genera un reporte que recibe el coordinador de convivencia.
- La nota de convivencia aparece en el informe académico del colegio, pero **no se toca** en esta etapa.

- **Principio rector (indicación del usuario):** el manual de ejemplo es **solo una base**. Cada colegio define su propia tipificación según la normativa, así que faltas, tipos, categorías, acciones pedagógicas, protocolos, entidades y reglas de reincidencia se **agregan, editan, desactivan y eliminan** desde la pantalla de configuración (ADMIN y coordinador de convivencia). Nada del manual de ejemplo se siembra como dato fijo en el código. Un elemento ya usado en una observación o caso no se borra (se desactiva) para no perder la trazabilidad.

### 16.3 Reincidencia configurable (D12)

Regla: `tipo_origen`, `ámbito` (mismo código o mismo tipo), `numero_ocurrencias`, `ventana` (año lectivo o N días) y `tipo_destino`. Ejemplo del manual: Tipo II, mismo tipo, 3 ocurrencias en el año lectivo → protocolo de Tipo III. El sistema **cuenta y sugiere** al coordinador (alerta en el caso); la reclasificación la confirma una persona, porque es una decisión con efectos disciplinarios sobre un menor. Si la institución no define reglas, no pasa nada.

### 16.4 Puntos a validar

1. En el manual de ejemplo, conductas como agresión física con contenido sexual (3.11, 3.19) o ingreso bajo efectos de sustancias (3.21) están como Tipo II; la normativa colombiana suele tratar algunas de esas conductas como Tipo III. **No es decisión del sistema:** el catálogo es de la institución, pero conviene que su asesor lo revise al cargarlo (Fase 0, punto 3).
2. El artículo 27 dice "comete faltas Tipo I" donde debería decir Tipo II (errata del manual, no del sistema).
3. ¿La orientadora escolar necesita acceso (rol propio) o basta con registrar la remisión? Por alcance mínimo se propone **solo registrar la remisión**.
