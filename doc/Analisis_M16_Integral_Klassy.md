# Análisis integral M16 — PIAR e inclusión (contraste, correcciones y diseño de referencia)

**Estado:** análisis previo a la implementación. **No contiene código de producción.**
**Rama:** `feature/m16_piar` (creada desde `origin/main`).
**Autoría de este documento:** análisis solicitado por el equipo; las decisiones marcadas **[DECISIÓN]** requieren confirmación del usuario antes de programar (regla de CLAUDE.md §3: no asumir alcance por conveniencia).

> **Estado (implementado en `feature/m16_piar`).** Se adoptaron las recomendaciones D-1 a D-10 de la sección 11. Diferencias entre este análisis y lo construido:
> (1) **secretaría no sube soportes** (v1): solo registra lo declarado y marca «aporta soporte»; el soporte clínico lo carga orientación (se evita el buzón solo-escritura);
> (2) la **directora de grupo no ve la modalidad** (PIAR/plan) aunque vea todos los ajustes de su grupo; (3) `usa_ajustes` es la señal neutral con la que la pantalla decide
> mostrar la tabla de ajustes; (4) el **plan de apoyo** también se firma (acuerdos con la familia) y se activa con su firma; (5) el cierre automático por retiro y el aviso en el
> cierre del año (M05) quedaron como pendientes documentados en CLAUDE.md. Lo normativo marcado **[VALIDAR]** sigue pendiente del formato oficial del MEN y del anexo técnico SIMAT.

## 0. Fuentes revisadas y límites del análisis

| Fuente | Qué es | Observación |
|---|---|---|
| `CLAUDE.md` | Reglas del proyecto (§2 una institución por instalación, §3 alcance por módulo, §6 UI, §7 TanStack) | Norma interna que manda sobre todo lo demás |
| `Idea_Klassy…v2.docx` | Documento maestro | M16 son 5 líneas (ver §1); M21/M26/M29/M31/M32 definen formatos, archivo y auditoría |
| `doc/m16.docx` | Propuesta del usuario (la que se analiza) | 191 párrafos: roles, dos modalidades, formularios, flujo, matrícula |
| `doc/piar.pdf` | Presentación **Secretaría de Educación de Bogotá, 2020** ("Categoría 1 – Educación inclusiva con apoyos") | **No es el formato oficial del MEN**; es una guía regional que reproduce los 4 anexos. Anexo 3 = ejemplos de ajustes, **Anexo 4 = Acta de acuerdo** |
| `doc/Analisis_M16_Klassy.md` | Análisis previo ya en `main` (commit `1d47e05`, Sahira Vargas) | Se contrasta también: tiene aciertos y varios choques con el repo (§4) |
| Código del repo | Modelos, rutas, servicios, páginas de M01–M15 | Verificado archivo por archivo (§5) |
| Web | Búsqueda sobre el Decreto 1421/2017 | Los dominios `mineducacion.gov.co` y `funcionpublica.gov.co` están **bloqueados** en este entorno: el texto íntegro del decreto y el formato oficial MEN **no pude leerlos**. Lo normativo que sigue se apoya en el PDF, en resultados de búsqueda y en conocimiento general, y está marcado **[VALIDAR]** cuando dependo de la cita exacta (coherente con Idea §12) |

> **Acción pedida al usuario:** subir a `doc/` el *Formato PIAR* oficial del MEN (Anexos 1–3 y Informe anual) y, si existe, el anexo técnico SIMAT de discapacidad vigente. Con eso se cierran todos los **[VALIDAR]**.

---

## 1. Qué dice Klassy hoy de M16 (la base)

Idea §M16: registrar PIAR y seguimiento; **relacionar ajustes con áreas, actividades y evaluación**; participación de orientación, docentes y autorizados; **evidencias y seguimiento**; **permisos estrictos**. Más:
- Idea §2 (roles): el PIAR "solo puede ser consultado por Orientación, Administrador y los docentes directamente involucrados, bloqueándolo para el resto".
- Idea §M03: la bandera discapacidad/talento "se conectará con M16"; la ficha 360° dejó el contenedor "Observador y bienestar" para M14 y M16.
- Idea §M31: PIAR es información crítica con auditoría. Idea §12: validar la versión vigente de la norma, distinguir ley / lineamiento MEN / regla del colegio.
- Idea §11: no quemar en código tipos, estados, plantillas, periodos.

CLAUDE.md ya fija: `ORIENTADOR` existe (rango 70, sede obligatoria, sin herencia), **"El PIAR (M16) no se construyó: el rol existe pero M16 sigue pendiente. Tampoco ve la salud administrativa del estudiante"**, y M14/M15 ya construyó la atención de orientación.

---

## 2. Contraste de `m16.docx`

### 2.1 Lo que está bien planteado (se conserva)
1. **Quién llena qué**: orientación abre y caracteriza; **cada docente formula los ajustes de su asignatura**; coordinación supervisa. Es el espíritu del Decreto 1421 (PIAR liderado por docentes de aula con apoyo/orientación y familia). El `.md` previo lo confirma.
2. **El docente nunca ve la historia clínica** (solo pautas pedagógicas). Alineado con Ley 1581 (minimización) y con el precedente `ocultarSaludAdministrativa`.
3. **Separar Ajustes técnicos (matriz por asignatura) del Acta con la familia**: son instrumentos distintos en la normativa.
4. **Flujo previo en matrícula**: secretaría no tiene criterio técnico → solo registra lo declarado y *traspasa* a orientación. Es exactamente el patrón ya probado `SolicitudCaso` (M14→M15).
5. **Seguimiento por periodo (M05)** y **balance de efectividad**.
6. **Acta firmada → expediente ACTIVO** y respaldo en archivo.
7. Acudiente consulta/descarga (cuando exista M27).
8. Ejemplo de banner para el docente: la idea de una **tarjeta fija de orientación** encima de sus tres campos es buena (ver correcciones de contenido en 2.2-H).

### 2.2 Qué se debe corregir

**A. Nomenclatura y roles (CLAUDE.md §1, §4)**
- "Psicólogo" **no es un rol**: es `ORIENTADOR`. `COORDINATOR/TEACHER/GUARDIAN/ADMIN` → `COORDINADOR/DOCENTE/ACUDIENTE/ADMIN`. "Rector" **no es rol**: firma el `ADMIN` (igual que el acta del comité, M15).
- Campos en inglés/camelCase (`subjectBarrier`, `methodologicalAdjustment`, `evaluativeAdjustment`): el código nuevo va en español y el contrato JSON en snake_case → `barrera_asignatura`, `ajuste_metodologico`, `ajuste_evaluativo`. Nombres de tablas del tipo `core_academic_years` no existen: son `AcademicYear`, `Enrollment`, `StudentProfile`.
- `COORDINADOR_CONVIVENCIA` **queda fuera** de M16 (CLAUDE.md: no hereda nada de otros roles).

**B. "Dos modalidades" (PIAR formal vs. Plan de apoyo/DUA) — el punto normativo más delicado**
- El Decreto 1421 y el PIAR aplican **a estudiantes con discapacidad**. TDAH, dislexia, discalculia, rezago transitorio **no son categorías de discapacidad** en el reporte SIMAT; llamarlos "PIAR" sería incorrecto, y llamar "DUA" a un plan individual también: el **DUA es planeación de aula para todos** ("el DUA es la base; el PIAR es el ajuste individual cuando el DUA no basta").
- Idea M16 pide solo PIAR. Un segundo tipo de expediente es **ampliación de alcance**.
- **[DECISIÓN D-1]** Recomendación: aceptar la modalidad B **solo como "Plan de apoyo pedagógico" (nombre neutral, sin "DUA" ni "PIAR")**, misma estructura liviana, **sin Acta oficial ni Anexos MEN**, sin categoría SIMAT, y con el mismo régimen de confidencialidad (un rótulo "TDAH" es dato de salud igual). `APOYO_SOCIOEMOCIONAL` **sale** de ese catálogo: ya es del seguimiento psicosocial de orientación (M14/M15). Si el usuario prefiere ceñirse a Idea, M16 v1 = solo PIAR y el plan de apoyo queda como pendiente documentado.
- Talento excepcional **no es PIAR** (régimen distinto, Decreto 366 de 2009 **[VALIDAR]**): queda fuera; la bandera de M03 se conserva solo informativa.

**C. Soporte clínico "PDF obligatorio" para abrir el PIAR**
- Riesgo normativo **[VALIDAR el artículo exacto]**: la política MEN es que no se condiciona el acceso/atención a un diagnóstico; el PIAR se funda en **valoración pedagógica** y el informe de salud "aporta" a la definición de ajustes (PDF: "Diagnóstico clínico para caracterizar, teniendo en cuenta que nuestra misionalidad es pedagógica"). Sí es necesario para **reportar la discapacidad en SIMAT**.
- Corrección: el soporte clínico es **recomendado, no bloqueante**. Estado del expediente "sin soporte clínico" con alerta; `categoria_simat` puede quedar "POR_CONFIRMAR" mientras tanto. Nunca impedir la atención pedagógica por falta del papel.

**D. Categorías SIMAT (lista del doc)**
- Mezcla **Sistémica + Múltiple** en una sola (son categorías distintas), omite **Discapacidad psicosocial** y otras que SIMAT maneja; las "7 grandes" del doc no coinciden con la lista del `.md`. La lista es de **fuente externa (MEN)** y cambia: debe quedar versionada en una constante (`CATEGORIAS_DISCAPACIDAD` con `codigo`, `nombre`, `version_simat`) y validada con el anexo técnico vigente **[VALIDAR]**. No es catálogo libre del colegio (es contrato de reporte), pero sí debe poder actualizarse sin tocar lógica.

**E. Numeración de anexos**
- `m16.docx` (Anexo 2 = PIAR técnico, Anexo 4 = Acta) coincide con **el PDF de Bogotá**; el `.md` previo dice Anexo 3 = Acta. La numeración **varía por fuente** (en el formato MEN el acta no lleva el número 4 **[VALIDAR]**). **Regla:** el sistema identifica cada documento por **nombre y clave interna** (`ANEXO_INFO_GENERAL`, `PIAR_AJUSTES`, `ACTA_ACUERDO_FAMILIA`, `INFORME_ANUAL`), y el número de anexo es un **texto configurable por versión de formato**, nunca el identificador.

**F. "Un único documento maestro" (Acta oficial PIAR)**
- El usuario lo pide así y se respeta, pero **construido como paquete** de documentos independientes: el PIAR **cambia durante el año ("progresivo")** y el acta firmada **no puede mutar**; si todo fuera un solo PDF, cada ajuste tardío invalidaría la firma. Además, el paquete que viaja a la carpeta física **no debe cargar los datos clínicos** salvo en la versión confidencial. Detalle en §7.

**G. Flujo de matrícula**
- *Primer contacto real*: es la **preinscripción pública (`AdmissionRequest`)** y luego la matrícula. La pregunta de apoyo debe estar en **ambos** (el aspirante la declara en el formulario público; secretaría la confirma al matricular). Hoy **ninguno** tiene esos campos (verificado).
- "Secretaría sube soporte médico escaneado": **contradice el propio RBAC del doc** (secretaría sin acceso a lo clínico). Corrección: la carga es **solo-escritura** hacia M16 (sube, no puede listar ni abrir). No se usa el checklist de M04 (`TIPOS_DOCUMENTO_MATRICULA` solo tiene identidad, certificado, foto, carné EPS, vacunas, y lo ve secretaría).
- "El sistema levanta un evento": no existe bus de eventos ni M28. Se resuelve **síncronamente**, creando la solicitud **en la misma transacción** (`runTransaction`), como `SolicitudCaso`.
- Tocar `enrollment.service`/`admissionRequest` es **cambio en M04**: debe ser el mínimo mecánico (una sección opcional "Información de apoyo" + crear la solicitud). **[DECISIÓN D-2]** confirmar que esa mínima intervención en M04 está autorizada (el flujo viene del propio documento m16, por lo que se asume que sí).

**H. Banner del docente**
- Muestra **"MODALIDAD: PIAR Formal (Visual)"** y **"ALERTA MÉDICA"** a *todos* los docentes del estudiante: revela la categoría de discapacidad y datos de salud a 8–12 personas y a cualquier pantalla/PDF que lo reproduzca. Corrección: orientación redacta una **"ficha pedagógica de acceso"** (barreras, estilo de aprendizaje, recomendaciones, pautas evaluativas) **sin la categoría**; y un único campo opcional **"alerta de seguridad en aula"** (precedente directo: `alergias_condiciones` sí lo ve el docente por seguridad). El rótulo "Formal/DUA/visual" lo ve solo orientación/admin/coordinación.
- Los tres campos del docente son pocos frente a lo que exige el Anexo 2 (ver §6): faltan **objetivos/propósitos**, **seguimiento/evaluación del ajuste** y **recursos**.

**I. Flujo "no contemplado" (docente detecta una condición) — quedó incompleto en el doc.** Se define en §8.2.

### 2.3 Qué no se está contemplando (síntesis; detalle en §6 y §9)
Consentimiento informado específico (Ley 1581 / 1098); Anexo 1 completo (hogar, trayectoria, salud estructurada); objetivos alineados a DBA/EBC; evaluación periódica del ajuste (≥3/año); Plan de Mejoramiento Institucional; dimensiones transversales (socialización, participación, autonomía, autocontrol); recursos, proyectos y actividades de receso; **Informe anual de proceso pedagógico/competencias**; historia escolar y entrega pedagógica entre grados; continuidad año a año; traslado con PIAR previo; reasignación de grupo y reemplazo de docente a mitad de año; estudiante mayor de edad; versionado e inmutabilidad; retención; consecutivo; auditoría de lectura; almacenamiento seguro de archivos; indicador para M12/M17/M19.

### 2.4 Vulnerabilidades de la propuesta
| # | Riesgo | Efecto | Mitigación |
|---|---|---|---|
| V1 | Autorización de datos sensibles genérica | Tratamiento ilícito de datos de salud de menores (Ley 1581 art. 5-7) | Autorización **propia de M16** (finalidad, quién accede, versión de la política, firma del acudiente), no reutilizar `autorizacion_datos_sensibles` de M03 (su comentario dice que cubre solo eps/rh/régimen/alergias) |
| V2 | Fuga de categoría/diagnóstico al docente (banner) | Discriminación / estigma | Ficha pedagógica de acceso sanitizada (2.2-H) |
| V3 | Secretaría con acceso a soporte clínico | Contradice minimización | Carga solo-escritura (2.2-G) |
| V4 | Buscador "autocompleta M03" | IDOR: un orientador de otra sede ve estudiantes ajenos; abre `/students` | Buscador propio acotado a sedes (patrón `GET /observaciones/estudiantes`) |
| V5 | Archivos clínicos "en M29" (no existe) | Archivos por URL pública o en Mongo | `uploads/piar/<expediente>/…`, descarga solo con sesión, validación por firma de bytes (patrón M13), ruta nunca enviada al cliente, hash SHA-256 |
| V6 | PDF de acta "firmado" subido sin vínculo con la versión generada | Documento sustituido | Código del documento + huella corta impresos en cada hoja; el escaneo se asocia a una **versión emitida** (hash de la emisión) |
| V7 | Firma "digital autorizada" ambigua | Validez jurídica incierta (Ley 527/1999) | v1: firma **física + escaneo** con trazabilidad; firma electrónica certificada queda para después **[DECISIÓN D-3]** |
| V8 | Sin inmutabilidad | Se altera lo acordado | Documento emitido = **snapshot congelado** + hash recalculable (como `hashDeActa` M15); cambios posteriores = nueva versión |
| V9 | Sin auditoría de lectura | Incumple Idea M31 y principio de rendición | `PIAR_*_CONSULTADO` auditado siempre; `detalle` **nunca con contenido** (regla de M14) |
| V10 | Un `teacher_id` fijo por ajuste (del `.md`) | Si el docente se reemplaza, el ajuste queda huérfano | Ajuste ligado a (expediente, asignatura); autoría por versión; quien edita lo decide la `TeacherAssignment` vigente |
| V11 | Diagnóstico en texto libre sin límite | Datos innecesarios | Campos acotados, validación Joi por endpoint (`stripUnknown`), longitudes máximas |
| V12 | Sin retención ni derecho de rectificación | Incumple habeas data | `ConfiguracionInclusion` con `retencion_anios_*` (solo reporta, no borra, igual que `GET /convivencia/retencion`) y rectificación vía enmienda |
| V13 | Año cerrado sin regla | Se editan PIAR históricos | `CERRADO` = solo lectura (patrón M05/M14) |
| V14 | Estudiante/acudiente consultan "todo" | Un menor lee su diagnóstico sin acompañamiento | v1: sin acceso de estudiante; acudiente solo cuando exista M27, con la versión de familia |

---

## 3. Lógica real del sistema (cómo debe funcionar M16)

### 3.1 Qué es M16 en Klassy (alcance propuesto)
**Dentro:**
1. **Solicitud de apoyo** (bandeja de entrada única; orígenes: matrícula/preinscripción, docente, convivencia M15, familia/directo).
2. **Expediente PIAR** anual por estudiante (con discapacidad), con: Anexo 1, matriz de ajustes por asignatura (Anexo 2), PMI, seguimientos, Acta de acuerdo, Informe anual.
3. **Generación de los documentos** (§7) con encabezado institucional.
4. **(Opcional D-1) Plan de apoyo pedagógico** liviano.
5. Tableros de cumplimiento (completitud, plazos) para coordinación/orientación.

**Fuera (ya existe o es de otro módulo):**
- Atención/seguimiento psicosocial y remisiones de convivencia → **ya existe** (M14 `Observacion` contexto `ORIENTACION`; M15 `RemisionOrientacion`, `/orientacion/remisiones`, `OrientacionPage`). **No se reconstruye** `OrientacionAtencion` ni `/orientacion/atenciones` (el `.md` previo lo hacía: duplicidad).
- Calificar con escala distinta, advertir en la planilla de notas, ajustar fórmulas → **M12** (solo se le *expone* un indicador por API).
- Promoción/boletín final → M17/M19/M20 (consumen el indicador y el Informe anual; M16 no los toca).
- Portal acudiente/estudiante → M27. Notificaciones → M28. Archivo/versiones generales → M29. Reportes SIMAT → M30. Constructor de formatos → M21/M32.
- Talento excepcional, certificados de estudio.

### 3.2 Roles y permisos (lista de permitidos, sin herencia — como `permisosConvivencia`)
Se implementa como función pura `permisoPiar(usuario, contexto, accion)` con tests, hermana de `permisoSobreEstudiante`, y **el servidor decide** (404 = no existe = no autorizado).

| Acción | ADMIN | ORIENTADOR (sus sedes) | COORDINADOR (sus sedes) | DOCENTE de clase | DOCENTE director de grupo | SECRETARIA | ACUDIENTE/ESTUDIANTE |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Ver bandeja de solicitudes | ✔ | ✔ | ✔ (solo estado, no contenido clínico) | — | — | — | — |
| Crear solicitud (docente / matrícula) | ✔ | ✔ | ✔ | ✔ (sus estudiantes) | ✔ | ✔ (**solo** al matricular) | — |
| Abrir/editar expediente y Anexo 1 | ✔ | ✔ | — | — | — | — | — |
| Ver datos clínicos / diagnóstico / soporte | ✔ (auditoría) | ✔ | — | — | — | — | — |
| Ver ficha pedagógica de acceso | ✔ | ✔ | ✔ | ✔ | ✔ | — | — |
| Editar ajustes **de su asignatura** | — | ✔ (como apoyo, queda registrado) | — | ✔ | — | — | — |
| Ver ajustes de **todas** las asignaturas | ✔ | ✔ | ✔ | — (solo la suya) | ✔ (su grupo) | — | — |
| Seguimiento por periodo (su asignatura) | — | ✔ | — | ✔ | — | — | — |
| Aprobar para emitir actas | ✔ | — | ✔ | — | — | — | — |
| **Firmar institucionalmente el Acta** | ✔ (rector) | — | — | — | — | — | — |
| Emitir Informe anual | ✔ | ✔ | — | ✔ (borrador, con su asignatura) | ✔ | — | — |
| Descargar paquete / PDF | ✔ | ✔ | ✔ (sin Anexo 1 clínico) | su ajuste | su grupo | — | acudiente: Acta (M27) |

Notas: (1) `COORDINADOR` abre expedientes según el doc; **en esta propuesta solo aprueba y supervisa**; si el usuario insiste en que también pueda abrir, no rompe nada, pero ver Anexo 1 clínico sigue vedado **[DECISIÓN D-4]**. (2) Orientación **no** hereda la visibilidad de salud administrativa (CLAUDE.md): ver §5.3 (conflicto EPS/régimen). (3) Rango: ORIENTADOR=COORDINADOR=70; solo ADMIN gestiona usuarios de ese rango (ya vigente).

### 3.3 Estados
**Solicitud de apoyo:** `PENDIENTE → EN_VALORACION → CONVERTIDA | DESCARTADA` (con motivo; "convertida" apunta al expediente), igual que `SolicitudCaso`.
**Expediente PIAR:** `BORRADOR → EN_CONSTRUCCION (docentes diligencian) → LISTO_PARA_ACUERDO (aprobado por coordinación/ADMIN) → ACTIVO (Acta firmada y respaldada) → CERRADO` (año cerrado o retiro). Nunca se elimina. Flujo por tabla de transiciones (como `TRANSICIONES_CASO`), no `if` sueltos.
**Documento emitido:** `BORRADOR → EMITIDO → FIRMADO | SUSTITUIDO` (cuando hay nueva versión).

### 3.4 Reglas de negocio
- **RN-16-01 Una vigencia, un expediente**: único por (estudiante, año lectivo) vía índice. La clave es **estudiante+año**, no el grupo: el estudiante puede cambiar de grupo en el año (M04 `reasignación`) y el expediente lo sigue; el grupo vigente se calcula desde su `Enrollment` activo. (El `.md` previo guardaba `group_id` fijo.)
- **RN-16-02 Matrícula activa en año EN_CURSO** (`ESTADOS_MATRICULA_ACTIVOS`; **no existe** el estado `ACTIVA` que citaba el `.md`). Año `CERRADO` = histórico de solo lectura.
- **RN-16-03 Plazo de elaboración parametrizado**: la norma habla del **primer trimestre del año escolar**; Klassy tiene 2–4 periodos (M05), así que "trimestre" no es un periodo. Parámetro `plazo_elaboracion_dias` en `ConfiguracionInclusion` (default definido por el colegio), contado desde el inicio del año o desde la matrícula si es posterior. **No se quema** "30 días" (cifra del `.md`, no verificada **[VALIDAR]**). Vencer **alerta**, no bloquea.
- **RN-16-04 Seguimiento mínimo**: el formato exige seguimiento "3 veces al año como mínimo, de acuerdo con la periodicidad del SIEE". Se ancla a los **periodos de M05** y el mínimo es parámetro; con 2 periodos se exigen seguimientos adicionales. Se registra por ajuste y periodo (`efectividad` + observaciones + nueva acción). Los periodos `CERRADO` no admiten seguimiento, salvo ADMIN con motivo (patrón M05).
- **RN-16-05 Aislamiento por asignatura**: un docente solo toca el ajuste de la asignatura que dicta (`TeacherAssignment` CLASE activa, mismo grupo, año vigente). El director de grupo solo consulta y es responsable de las **dimensiones transversales**.
- **RN-16-06 Los objetivos salen del banco curricular, no se tipean**: el Anexo 2 dice "objetivos/propósitos, para todo el grado, de acuerdo con los EBC y DBA". El docente **selecciona** DBA del grado y área desde `ReferenteCurricular` (M07, referencia por `_id`, regla "el docente nunca escribe un DBA") y describe el **objetivo flexibilizado** en texto propio.
- **RN-16-07 Regla de oro de datos**: nombre, documento, fecha de nacimiento, acudientes, grupo, sede, jornada se **consumen por llave foránea** (M02/M03/M04/M01); el expediente **no los copia** salvo en el *snapshot* del documento emitido (necesario para que un documento firmado siga siendo idéntico).
- **RN-16-08 Filas esperadas = plan de estudios**: las asignaturas del Anexo 2 salen del plan efectivo del grupo (M06, base del grado o grupo personalizado) y el docente de cada una de `TeacherAssignment` (M08). Asignatura sin docente asignado → alerta a coordinación, no se inventa fila.
- **RN-16-09 Continuidad anual**: "se actualiza anualmente y facilita la entrega pedagógica entre grados". Al crear el expediente del año N+1, se ofrece **copiar** el del año anterior como borrador (características, ajustes aún vigentes), sin matrículas ni firmas heredadas; el anterior queda `CERRADO`.
- **RN-16-10 Traslado**: si `tipo_ingreso = TRASLADO` y viene con PIAR previo, se registra como **antecedente** (institución de origen, fecha, si recibió informe) en el Anexo 1 y se abre el propio.
- **RN-16-11 Mayor de edad**: el Acta la firma el estudiante (el sistema ya conoce `fecha_nacimiento`); un menor lleva acudiente y, según madurez, el estudiante participa.
- **RN-16-12 Versionado**: añadir ajustes tras la firma es legítimo (PIAR progresivo); crea **nueva versión**, informa a la familia y requiere nueva constancia, sin alterar el snapshot firmado.
- **RN-16-13 Retiro**: la matrícula pasa a `RETIRADO` → expediente `CERRADO` conservando todo (historia escolar).
- **RN-16-14 Consentimiento**: no se registra clínica ni se emite Anexo 1 sin autorización vigente del responsable legal; revocarla bloquea el uso nuevo y se audita.
- **RN-16-15 Audit trail** de crear, editar, aprobar, emitir, firmar, **consultar** y descargar.

---

## 4. Contraste con el análisis previo (`Analisis_M16_Klassy.md`)

**Aciertos que se adoptan:** principio de autoría (el PIAR no lo hace solo orientación); minimización de datos; estados de ciclo de vida; auditoría de consulta; informe anual (que `m16.docx` olvidó); ajustes ligados a asignatura; fase de PDF al final; pruebas con `mongodb-memory-server`.

**Choques con el repo / CLAUDE.md (verificados):**

| # | El `.md` previo propone | Realidad del repo | Corrección |
|---|---|---|---|
| 1 | `institucion_id` en todos los modelos y "parámetros globales de inclusión" por institución | CLAUDE.md §2: **una institución por instalación**; `convivenciaCatalogo.service` dice "el catálogo nunca recibe `institucion_id` del cliente" | Quitar `institucion_id`; usar singleton `ConfiguracionInclusion` (patrón `ConfiguracionConvivencia`) |
| 2 | `Enrollment` estado `ACTIVA` | Estados reales: `PREINSCRITO`, `MATRICULADO_CONDICIONAL`, `MATRICULADO_DEFINITIVO`, `RETIRADO`, `ANULADO`; activos = `ESTADOS_MATRICULA_ACTIVOS` | Usar la constante existente |
| 3 | `OrientacionAtencion`, `/orientacion/atenciones`, `/orientacion/estudiante/:id`, "Componente B" | Ya existen `RemisionOrientacion` (con `atenciones[]` confidenciales), `/orientacion/remisiones`, `OrientacionPage`, `useOrientacion`, auditoría `ORIENTACION_*`; y M14 ya registra seguimiento psicosocial (`Observacion` contexto `ORIENTACION`) | **No duplicar.** M16 solo se *enlaza* con orientación |
| 4 | `ORIENTADOR` ve "salud sensible" y diagnóstico | `ocultarSaludAdministrativa` oculta eps/rh/régimen al `ORIENTADOR`; CLAUDE.md lo reitera | Ver §5.3 |
| 5 | `group_id` fijo en `Piar` | Idea M04: la relación estudiante-grupo vive en la matrícula, no se fija | Clave estudiante+año; grupo desde el `Enrollment` activo |
| 6 | `teacher_id` en el ajuste | Docentes se reemplazan (M08) | Ligar a asignatura; autoría por versión |
| 7 | `documento_firmado_url` | El repo guarda `archivo_path` interno y descarga con sesión; nunca URL | `archivo_path` + descarga autenticada |
| 8 | Enum SIMAT con `TALENTO_EXCEPCIONAL`, `TRASTORNO_ESPECIFICO_APRENDIZAJE`, `OTRA` dentro de `categoria_simat` obligatoria del PIAR | No son discapacidad (§2.2-B) | Separar; ver D-1 |
| 9 | Acta = "Anexo 3" | El PDF aportado: Anexo 4 | Identificar por clave, no por número (§2.2-E) |
| 10 | RN-16-06: advertir al docente **al calificar en M12** | Modifica M12 (fuera de alcance, CLAUDE.md §3) | Solo exponer indicador por API; la advertencia se pide aparte **[DECISIÓN D-5]** |
| 11 | `ACUDIENTE`/`ESTUDIANTE` consultan | M27 no existe | API lista, sin UI de portal; estudiante sin acceso en v1 |
| 12 | "Plazo de 30 días" (matrícula extemporánea) | No verificado | Parámetro configurable |
| 13 | Informe anual lo emite el director de grupo/orientación | Decreto: lo elabora el **docente de aula con el docente de apoyo y demás docentes** (anexo al boletín final) **[VALIDAR]** | Ver §7.4 |
| 14 | Usa `acta_acuerdo` como subdocumento mutable dentro de `Piar` | Un acta firmada debe ser inmutable (como `SesionComite` + hook `pre('save')`) | Documentos emitidos en colección propia con snapshot y hash |
| 15 | Sin modelo de solicitud ni de entrada desde matrícula/docente | Es el flujo central del propio `m16.docx` | Añadir `SolicitudApoyo` (§8) |

---

## 5. Revisión de módulos existentes y dependencias (qué se reutiliza, qué se toca)

### 5.1 Reutilizar sin modificar
| Módulo | Qué se consume | Cómo |
|---|---|---|
| **M01** `Group`, `Campus`, `JornadaOperativa` | sede, jornada, `director_grupo_id` | FK; el director de grupo sale de `Group.director_grupo_id` |
| **M02** `User`, `ROLES`, `JERARQUIA_ROLES`, `ROLES_CON_SEDE_OBLIGATORIA` | Roles y alcance por sede (`alcanceDeSedes`, `enAlcanceDeSede` de `permisosConvivencia`) | Reutilizar esas utilidades (o extraerlas a un util común **sin cambiar su comportamiento**) |
| **M03** `StudentProfile`, `Guardian`, `StudentGuardian` | Datos personales, banderas, acudiente principal | Solo lectura. `descripcion_inclusion` ("notas para el futuro M16; no es el PIAR") queda como está |
| **M04** `Enrollment` | Matrícula activa, grupo vigente, `tipo_ingreso`, `folio_matricula` | FK `enrollment_id`/`student_id` |
| **M05** `AcademicYear`, periodos | Año `EN_CURSO`/`CERRADO`, periodos, calendario por sede | `asegurarAnioNoCerrado`; ventana de seguimiento = periodo |
| **M06** `StudyPlan`, `Subject`, `Area` | Asignaturas esperadas del grupo; el **área** agrupa las filas en el documento | Solo lectura |
| **M07** `ReferenteCurricular` | DBA/EBC del grado y área | Selección por `_id`, igual que `Activity.dba_id` |
| **M08** `TeacherAssignment` | Quién puede editar qué | `docenteDictaClase` ya existe como concepto en convivencia |
| **M14/M15** `Observacion`, `RemisionOrientacion`, `SolicitudCaso` | Patrón de traspaso, confidencialidad, "404=no autorizado" | Solo patrón. Vínculo: una solicitud de apoyo puede nacer de una remisión de orientación |
| **M31 mínimo** `AuditLog` + `registrarEvento` | Auditoría | Agregar acciones nuevas al enum `ACCIONES_AUDITORIA` (cambio **aditivo**) |

### 5.2 Cambios mínimos necesarios en otros módulos (cada uno requiere visto bueno)
1. **M04 / preinscripción pública**: sección opcional "Información de apoyo / enfoque diferencial" (declarado por la familia: sí/no, motivo, ¿aporta soporte?, observación de secretaría) **y** crear la `SolicitudApoyo` en la misma transacción. No cambia estados ni folios. → **D-2**.
2. **M03 ficha 360°** (`StudentDetailPage`): la pestaña `bienestar` hoy renderiza solo `HistorialObservaciones` y dice "no disponible para secretaría". Agregar la sub-sección de inclusión para roles autorizados (aditivo; el resto sigue igual).
3. **Navegación** (`navigation.ts`) y rutas (`App.tsx`): entradas nuevas, patrón existente.
4. **`auditLog.model.ts`**: nuevas acciones (aditivo).
5. **M05 verificación de cierre** (opcional): listar PIAR activos sin informe anual como *aviso no bloqueante* (hoy ya hay pendientes análogos, p. ej. comisiones M20). → **D-6** (o dejarlo como pendiente documentado).
6. **M12/M17/M19**: **ningún cambio**; M16 publica solo `GET` de "estudiantes con PIAR vigente" y "ajustes evaluativos de un estudiante" para su consumo futuro.

### 5.3 Conflicto a resolver: salud administrativa vs. Anexo 1 **[DECISIÓN D-7]**
El Anexo 1 pide EPS, régimen, afiliación y lugar de atención de emergencia, y CLAUDE.md dice que el orientador **no** ve la salud administrativa (eps/rh/régimen). Y la regla de oro prohíbe copiar esos datos. Opciones:
- **(a, recomendada)** El Anexo 1 del PIAR **lee** `eps`/`regimen_salud` de `StudentProfile` en el servidor **solo para el orientador/ADMIN, dentro de un expediente abierto y con la autorización de M16 vigente**, y los muestra ya dentro de ese contexto (y en el PDF confidencial). No se duplican ni se amplía la visibilidad fuera de M16.
- (b) Capturarlos de nuevo en el expediente: viola la regla de oro (dos fuentes que se desfasan).
- (c) Dejar al orientador sin EPS: el Anexo 1 queda incompleto.
Lo demás de salud (diagnóstico, terapias, medicamentos, productos de apoyo, tratamiento) **no existe en M03**, así que nace en M16 sin duplicar nada.

### 5.4 Lo que **no** existe y condiciona el diseño
- **No hay M29** (archivo): los soportes van a `uploads/` con el patrón de M13; M29 los absorbería después por clave.
- **No hay M21/M32** (constructor de formatos) ni M26: no se construye aquí un constructor de plantillas.
- **Los 4 servicios PDF actuales** (`actaCompromiso`, `actaComitePdf`, `asistenciaPdf`, `comprobantePreinscripcion`) arman su encabezado cada uno por su cuenta y **ninguno usa `Institution.logo_url`** (verificado). M16 sería el quinto: conviene **un solo helper de encabezado institucional** (§7.5), sin reescribir los PDFs existentes.
- **No hay bus de eventos / M28**: las notificaciones (docente recibe "tienes ajustes pendientes") quedan como **pendiente**; la bandeja "pendientes para mí" se resuelve con consulta, no con avisos.
- **No existe el rol "docente de apoyo pedagógico"** que cita el Decreto (lo nombra la secretaría de educación). En Klassy lo asume el `ORIENTADOR`. **[DECISIÓN D-8]**: confirmar que no se agregará un rol nuevo (CLAUDE.md prohíbe nuevos roles sin petición explícita) y que, si el colegio tiene un docente de apoyo, se le crea como `ORIENTADOR`.

---

## 6. Qué lleva exactamente el PIAR oficial (y qué le faltaba a la propuesta)

> Fuente: `piar.pdf` (SED Bogotá 2020, que reproduce los anexos del Decreto 1421) + Decreto 1421/2017 **[VALIDAR contra el formato MEN oficial]**.

### 6.1 Contenido legal del PIAR (diapositiva "¿Qué debe contener el PIAR?")
1. Descripción del **contexto general del estudiante** dentro y fuera del establecimiento (hogar, aula, espacios escolares, otros entornos sociales).
2. **Valoración pedagógica** (currículo – grado – niveles de lenguaje): fortalezas y aspectos a apoyar.
3. **Informes de profesionales de la salud** que aportan a definir los ajustes.
4. **Objetivos y metas de aprendizaje** que se pretenden reforzar.
5. **Ajustes** curriculares, didácticos, evaluativos y metodológicos del año lectivo.
6. **Recursos** físicos, tecnológicos y didácticos; barreras comunicativas, actitudinales, sociales, de infraestructura.
7. **Proyectos específicos** a realizar en la institución, distintos de los programados, que incluyan a todos (DUA).
8. **Otra información relevante** de aprendizaje y participación.
9. **Actividades en casa** que den continuidad en los **recesos escolares**.
Además: se elabora en el **primer trimestre**, se **actualiza anualmente**, **seguimiento periódico** según SIEE, ajustes **individuales y progresivos**, **hace parte de la historia escolar**, insumo para el **PMI** y la autoevaluación institucional.

### 6.2 Anexo 1 — Información general del estudiante (se diligencia con la familia; va a la historia escolar)
- **Datos generales** (de M03/M04, por FK).
- **Entorno salud**: afiliación (sí/no, EPS, contributivo/subsidiado) · lugar de atención en emergencia · atendido por el sector salud (frecuencia) · diagnóstico médico (sí/no, cuál) · terapias (cuál/frecuencia, hasta 3) · tratamiento médico por enfermedad (ej. epilepsia, oxígeno, insulina) · medicamentos (frecuencia, horario, si se toman en clase) · productos de apoyo (silla de ruedas, bastones, tableros de comunicación, audífonos…).
- **Entorno hogar**: madre y padre (nombre, ocupación, nivel educativo) · cuidador (nombre, parentesco, nivel educativo, teléfono, correo) · número de hermanos y lugar que ocupa · con quién vive · quién apoya la crianza · bajo protección (sí/no) · subsidios de entidades (Prosperidad Social, ICBF, fundaciones, ONG).
- **Entorno educativo**: vinculación previa a otra institución/modalidad (por qué/cuáles) · último grado cursado, aprobó, observaciones/motivos del cambio · informe pedagógico cualitativo o PIAR previo recibido (de dónde) · programas complementarios (deportes, danzas, música…) · institución y sede donde se matricula · medio de transporte · distancia/tiempo hogar–colegio.

### 6.3 Anexo 2 — PIAR
- **Encabezado**: fecha de elaboración (DD/MM/AA), institución, sede, jornada, **docentes que elaboran y cargo**.
- **Datos del estudiante**: nombre, documento, edad, grado.
- **1. Características del estudiante**: descripción general (gustos e intereses, lo que le desagrada, expectativas del estudiante y de la familia) · qué hace, qué puede hacer y qué requiere apoyo · habilidades, competencias, cualidades y aprendizajes para el grado en que se matricula.
- **2. Tabla de ajustes** por *área/aprendizaje*: **Objetivos/propósitos** (del grado, según EBC y DBA; primer trimestre) · **Barreras** evidenciadas en el contexto · **Ajustes razonables** (apoyos/estrategias) · **Evaluación de los ajustes** (espacio de observaciones; seguimiento **mínimo 3 veces al año** conforme al SIEE). Filas "otras": **socialización, participación, autonomía, autocontrol**.
- **3. Plan de Mejoramiento Institucional (PMI)**: matriz **actores × acciones × estrategias** — familia/cuidadores, docentes, directivos, administrativos, pares.
- (**Anexo 3, ejemplos de ajustes**: no es un formulario; es un **catálogo de apoyo** — actividades, materiales, espacios, apoyos de comunicación, apoyos humanos, ayudas tecnológicas.)

### 6.4 Acta de acuerdo con la familia (Anexo 4 en el PDF de Bogotá)
- Dos declaraciones: *el establecimiento educativo realizó la valoración y definió los ajustes* · *la familia se compromete a cumplir y firmar los compromisos del PIAR y de las actas, y a apoyar en casa con las siguientes actividades*.
- Cuadro de **compromisos específicos para el aula** que requieran ampliación.
- Tabla de compromisos de la familia: **nombre de la actividad · descripción de la estrategia · frecuencia (D diaria / S semanal / P permanente)**.
- **Firmas**: la lámina no detalla firmantes; en la práctica acudiente/estudiante, docente(s), orientación y directivo **[VALIDAR]**.

### 6.5 Informe anual de proceso pedagógico (preescolar) / de competencias (básica y media)
Decreto 1421, art. 2.3.3.5.2.3.7 **[VALIDAR numeral]**: para los estudiantes con ajustes en la evaluación, al **finalizar cada año** se anexa al boletín final; lo elabora el **docente de aula con el docente de apoyo y demás docentes** y hace parte de la **historia escolar**. La historia escolar incluye proceso de inclusión, diagnóstico, PIAR anuales, informes de seguimiento, informes anuales, acuerdos firmados, avances médicos/terapéuticos.

### 6.6 Matriz de brechas del `m16.docx`
| Elemento oficial | ¿Está en m16.docx? | Acción |
|---|---|---|
| Datos generales, EPS/régimen | Parcial (EPS y régimen) | Consumir de M03 (§5.3) |
| Afiliación, emergencia, atención por sector salud, tratamiento médico | ❌ | Agregar (M16) |
| Diagnóstico, terapias, medicamentos, productos de apoyo | ✔ | Estructurar (terapias con frecuencia; medicamento con horario y "en clase") |
| Entorno hogar completo (padres, cuidador, hermanos, protección, subsidios) | ❌ (solo quién apoya la crianza) | Agregar; los datos de acudientes salen de M03 por FK, solo lo que falta se captura |
| Trayectoria educativa y transporte | ❌ | Agregar (parte desde M04: `institucion_procedencia`, `tipo_ingreso`) |
| Gustos, intereses, expectativas **del estudiante y familia** | ✔ (familia) | Añadir estudiante y "lo que le desagrada" |
| Valoración pedagógica (niveles de lenguaje), habilidades, qué requiere apoyo | ❌ | Agregar |
| Barreras (por tipo) | ✔ (texto) | Tipificar con la taxonomía (actitudinal, comunicativa, física, pedagógica, social/contexto) |
| **Objetivos/propósitos (DBA/EBC)** | ❌ | RN-16-06 |
| Ajustes por asignatura | ✔ (2 campos) | Mantener; categorizar con Anexo 3 |
| **Evaluación del ajuste (≥3 seguimientos)** | Mención sin campos | RN-16-04 |
| Dimensiones transversales (socialización…) | ❌ | Director de grupo + orientación |
| **PMI (actores × acciones)** | ❌ | Sección propia (coordinación) |
| Recursos, proyectos específicos, otra información, actividades en receso | ❌ | Agregar |
| Docentes que elaboran y cargo, fecha, jornada | ❌ | Se derivan de la autoría y de M01/M08 |
| Acta: declaraciones, compromisos de aula, tabla D/S/P | Parcial (compromisos) | Añadir frecuencia D/S/P y compromisos de aula |
| **Informe anual** | ❌ | Documento 4 (§7.4) |
| **Consentimiento informado** | ❌ | RN-16-14 |

---

## 7. Documentos que el sistema debe generar (flujo de trabajo)

### 7.1 Principio
M16 genera, **por ahora con un diseño neutro y fijo**, los siguientes documentos (cada uno con clave, versión de formato, firmantes y snapshot), de modo que la personalización institucional posterior sea **solo de presentación**:

| # | Clave | Documento | Quién lo genera | Contenido (resumen) | Confidencialidad |
|---|---|---|---|---|---|
| D1 | `ANEXO_INFO_GENERAL` | Información general del estudiante (Anexo 1) | ORIENTADOR / ADMIN | §6.2 completo | **Alta**: incluye salud; versión "carpeta" omite diagnóstico y medicación |
| D2 | `PIAR_AJUSTES` | PIAR – Plan individual de ajustes razonables (Anexo 2) | ORIENTADOR / COORD. / ADMIN | §6.3: encabezado, características, tabla por área→asignatura (objetivos, barreras, ajustes, evaluación con seguimientos), transversales, PMI, recursos, proyectos, receso | Media: sin categoría ni diagnóstico |
| D3 | `ACTA_ACUERDO_FAMILIA` | Acta de acuerdo con la familia | ORIENTADOR; **firma ADMIN** + familia | §6.4; **referencia a D2 por versión y hash**, resumen de ajustes esenciales y compromisos institucionales, tabla D/S/P | Media |
| D4 | `INFORME_ANUAL` | Informe anual de proceso pedagógico / de competencias | docente(s) + orientación; aprueba ADMIN/COORD. | §6.5: logros, dificultades, eficacia de ajustes, recomendaciones para el grado siguiente | Media |
| D5 | `ACTA_OFICIAL_PIAR` | **Acta oficial PIAR (paquete)**, lo que pide el usuario | ORIENTADOR / ADMIN | Portada + D1 (versión carpeta) + D2 + D3, con índice y huella de cada parte | Media (nunca clínico) |
| D6 | `PLAN_APOYO_PEDAGOGICO` | (solo si D-1 se aprueba) plan liviano | ORIENTADOR | Dificultad (categoría pedagógica), pautas de aula, evaluación, acuerdos de casa | Media |

Sobre la pregunta del usuario ("Acta oficial PIAR = PIAR técnico + Acta de acuerdo"): se respeta como **D5**, pero D1–D4 existen y se firman/versionan por separado.

### 7.2 Ciclo
1. Concertación inicial con la familia → consentimiento + Anexo 1 (borrador).
2. Docentes diligencian su asignatura (los tres campos del doc **más** DBA/objetivo, recursos y seguimientos).
3. **Agregación automática** del sistema en D2 (consulta, no copia): filas por asignatura esperadas, % de completitud por docente.
4. Orientación completa transversales, PMI, y los compromisos de la familia (frecuencia D/S/P).
5. Coordinación/ADMIN **aprueba**: estado `LISTO_PARA_ACUERDO`.
6. **Emisión**: se crea un registro de documento con **snapshot congelado, versión, consecutivo y hash**; el PDF se genera desde el snapshot.
7. Firma física → **escaneo** subido y **asociado a esa versión**; expediente `ACTIVO`.
8. Seguimientos periódicos (RN-16-04) y, al cierre, D4. Cambios a mitad de año → nueva versión (RN-16-12).

### 7.3 Datos de cada documento y fuente (regla de oro)
| Dato | Fuente | ¿Se copia? |
|---|---|---|
| Nombre, documento, edad, grado, grupo, sede, jornada | M02/M03/M04/M01 | Solo al snapshot emitido |
| Acudientes/cuidador | M03 (`Guardian`/`StudentGuardian`) | Solo al snapshot |
| Plan de estudios, asignatura, área | M06 | No (referencia); nombre al snapshot |
| Docente de cada asignatura | M08 | Al snapshot (nombre y cargo) |
| DBA/EBC | M07 | No (id); texto al snapshot |
| EPS, régimen | M03 (§5.3) | Solo snapshot del D1 confidencial |
| Salud específica, ajustes, PMI, compromisos | M16 | Propio |
| Datos de la institución | `Institution` (§7.5) | Al snapshot |

### 7.4 Informe anual: precisión
Es un documento distinto del acta y del PIAR, con vida propia al **cierre del año**; lo consume M17 (anexo al boletín final) y M19/M20 (promoción) a futuro. M16 lo **genera y guarda**, no lo inserta en el boletín.

### 7.5 ¿En qué módulo se definen los documentos que genera el sistema?
Según Idea:
- **M21 – Planillas y formatos institucionales**: constructor configurable de **encabezados, campos, tablas, firmas** y exportación a PDF/Excel para formatos de seguimiento, reuniones, informes.
- **M32 – Configuración de reglas y parámetros**: "centralizar escalas, criterios, **formatos**, estados y reglas" para adaptar el software a distintas instituciones.
- **M26** – plantillas oficiales configurables para **certificados** (no aplica al PIAR).
- **M17** – constructor de plantillas de **boletines** (el D4 se anexará a su salida, no se define allí).
- **M29** – repositorio, **versiones y permisos por tipo de documento** (archivo, no definición).
- **M31** – auditoría.

**Conclusión de diseño:**
1. **Qué debe contener cada documento (campos, firmantes, estructura)** lo define **M16**: son formatos **normativos** (MEN), no formularios libres del colegio.
2. **Cómo se ve** (logo, nombre, encabezado, pie, tipografía, ubicación de firmas, textos legales) lo definirá **M21 + M32** más adelante.
3. **Dónde se archivan/versionan en el repositorio general** lo hará **M29**.
4. **Ahora**: M16 genera con `pdfkit` (como los 4 servicios actuales) y un **registro de tipos de documento** en una constante (`clave`, nombre, `version_formato`, `numero_anexo` como texto, firmantes, `confidencial`). Ese registro es el **punto de enganche** para M21/M32. **No se construye un constructor de plantillas en M16** (YAGNI + §3).
5. **Encabezado institucional**: un solo helper que arma {nombre, código DANE, NIT, resolución de aprobación, logo (`logo_url` data URI, hoy sin uso en PDFs), sede, jornada} desde `Institution`/`Campus`/`JornadaOperativa`. Si falta un dato (p. ej. sin logo), el documento sale igual con texto. Cuando llegue M21/M32 se reemplaza solo ese helper.
6. **Confidencialidad en el PDF**: marca de "CONFIDENCIAL" y código `PIAR-<año>-0001` + huella corta en cada hoja; borrador marcado como tal (patrón del acta de comité).
7. Cada generación y descarga se audita (`PIAR_DOCUMENTO_EMITIDO`, `…_DESCARGADO`), como `ACTA_COMITE_PDF_GENERADO`.

---

## 8. Entidades, entrada de casos y flujo del docente

### 8.1 Entidades propuestas (diseño de referencia; no se escribe código aún)
Nombres y campos en español (CLAUDE.md §1), enums en `constants/inclusion.ts` (fuente única, reusada por Mongoose y Joi), un servicio por operación, controlador solo HTTP, Joi en `validators/`.

1. **`SolicitudApoyo`** — bandeja única. `origen` (`MATRICULA` | `PREINSCRIPCION` | `DOCENTE` | `CONVIVENCIA` | `DIRECTO`), `student_id`, `sede_id`, `academic_year_id`, `motivo_declarado`, `aporta_soporte` (bool; el archivo, si lo hay, va en M16 solo-escritura), `observacion`, `solicitada_por`, `estado`, `resolucion` (con motivo), `expediente_id`. Copia del patrón `SolicitudCaso`.
2. **`ExpedienteInclusion`** — por (estudiante, año). `tipo` (`PIAR` | `PLAN_APOYO` si D-1), `estado`, `categoria_discapacidad` (constante versionada, `POR_CONFIRMAR` permitido), `consentimiento` (otorgado por quién, fecha, versión de política), `anexo_info_general` (subdocumento), `caracteristicas`, `transversales`, `pmi`, `compromisos_familia`, `fecha_limite_elaboracion` (calculada con el parámetro), `version`, `aprobado_por`.
3. **`AjusteAsignatura`** — (expediente, `subject_id`): `dba_ids` (M07), `objetivo_flexibilizado`, `barrera_asignatura` + `tipo_barrera`, `ajuste_metodologico`, `ajuste_evaluativo`, `categoria_ajuste` (Anexo 3), `recursos`, `seguimientos[]` (periodo, efectividad, observación, nueva acción, autor, fecha), historial de versiones/autoría.
4. **`DocumentoPiar`** — emitidos: `clave`, `version`, `consecutivo`, `snapshot`, `hash`, `estado`, `firmas[]`, `soporte_firmado` (`archivo_path`), `emitido_por`. Inmutable salvo adjuntar el escaneo.
5. **`SoporteClinico`** — archivo(s) del expediente: `archivo_path` interno, `hash`, tipo, quién y cuándo lo subió, `es_solo_escritura_para_secretaria`.
6. **`ConfiguracionInclusion`** (singleton) — `plazo_elaboracion_dias`, `seguimientos_minimos_anio`, `retencion_anios`, textos de las dos declaraciones del acta, catálogos del colegio (tipos de barrera, categorías de ajuste del Anexo 3, opciones de ayudas técnicas) con desactivación, no borrado.
7. Consecutivos con `Counter` dentro de la transacción (`PIAR-<año>-0001`), sin huecos, como `CC-` y `AC-`.

### 8.2 El flujo "no contemplado": el docente cree que hay una condición
1. El docente (de clase o director de grupo) crea una **solicitud de apoyo** con **observaciones pedagógicas concretas** (qué observa, desde cuándo, qué ha probado), **sin diagnosticar ni rotular** al estudiante.
2. El servidor valida que el docente tenga relación con el estudiante (`TeacherAssignment` / `director_grupo_id`) y la matrícula activa; límite de texto; no hay datos clínicos.
3. Orientación recibe la solicitud (bandeja) → `EN_VALORACION`: entrevista a la familia, solicita **consentimiento**, valoración pedagógica.
4. Resultados posibles, todos con motivo: **abrir PIAR** (hay discapacidad o indicios documentados), **plan de apoyo** (si D-1), **seguimiento psicosocial** (ya existe en M14/M15), **ruta de salud** (orientar a la familia a la EPS; se registra la orientación, no se diagnostica), **descartar**.
5. La **familia debe ser informada** antes de abrir cualquier expediente con datos sensibles.
6. Se audita cada paso; el docente solo ve que su solicitud existe y su estado, no el contenido del expediente.

### 8.3 Orígenes de solicitud y quién puede crearla
`MATRICULA`/`PREINSCRIPCION` (secretaría o el propio aspirante en el formulario público, dato declarado), `DOCENTE`, `CONVIVENCIA` (orientación puede abrir desde una `RemisionOrientacion`), `DIRECTO` (orientación). Sin duplicar: una solicitud abierta por estudiante+año y origen similar → 409 con enlace.

---

## 9. Reglas de seguridad y datos (síntesis operativa)

1. **Autorización explícita y específica** (RN-16-14), diferente a la de M03.
2. **Minimización por diseño**: la API del docente devuelve solo la ficha pedagógica y su ajuste; nunca el documento crudo (`vista…`, como `vistaObservacion`).
3. **Permiso en servidor** con función pura testeable; "no existe" = "no autorizado" = 404.
4. **Auditoría de lectura** y descarga; `detalle` sin contenido.
5. **Archivos**: `multer.memoryStorage` + validación por firma de bytes, PDF/JPG/PNG, tamaño máximo, guardado en `uploads/piar/…`, descarga solo con sesión y permiso, `archivo_path` nunca en la respuesta.
6. **Inmutabilidad y hash** en documentos emitidos; endpoint de integridad (como `GET …/integridad` del comité).
7. **Validación Joi** por endpoint con campos desconocidos rechazados (anti mass-assignment).
8. **Búsqueda acotada** a sedes del usuario; no se abre `/students` a orientación.
9. **Retención** parametrizada, solo informa; nunca borrado automático.
10. **Pruebas**: unitarias de funciones puras (permisos, transiciones, completitud, plazos) y de integración con `mongodb-memory-server` (como `observaciones.int.test.ts`), incluyendo pruebas de **seguridad** (docente ajeno, sede ajena, secretaría).

---

## 10. Frontend (resumen; sujeto a CLAUDE.md §6–§7)
- Reusar `components/ui/` (`Tabs`, `Stepper` para el expediente largo, `Drawer`, `Table`, `Chip`, `GuiaColumnas` si hubiera carga). **Sin tokens ni variantes nuevas**; solo si falta un chip de estado de PIAR, crearlo siguiendo el patrón `EstadoXBadge` y registrarlo en CLAUDE.md.
- Hooks `useSolicitudesApoyo.ts`, `useExpedientesInclusion.ts`, `useAjustesAsignatura.ts` (TanStack Query v5, `queryKey` por recurso en plural, invalidación en `onSuccess`).
- Puntos de entrada: (1) bandeja y expediente para `ORIENTADOR`/`ADMIN`/`COORDINADOR` (`/inclusion/...`); (2) para el docente, una vista "Mis estudiantes con ajustes" y un acceso desde su contexto de clase, sin tocar la planilla de M12; (3) sub-sección en la pestaña "Observador y bienestar" de la ficha 360°; (4) sección "Información de apoyo" en matrícula y preinscripción (D-2).
- Fechas con `lib/fechas.ts`; nada guardado en el navegador.

---

## 11. Decisiones pendientes del usuario

| ID | Decisión | Recomendación |
|---|---|---|
| **D-1** | ¿Incluir "Plan de apoyo pedagógico" (TDAH, dislexia…) en M16 v1? | Sí, liviano, sin Acta MEN, sin llamarlo PIAR/DUA, sin `APOYO_SOCIOEMOCIONAL`; o dejarlo pendiente |
| **D-2** | Autorizar el cambio mínimo en M04/preinscripción (sección de apoyo + crear solicitud) | Sí |
| **D-3** | Firma: ¿física + escaneo en v1? | Sí; firma electrónica certificada después |
| **D-4** | ¿COORDINADOR puede abrir expedientes además de aprobar? | Solo aprobar/supervisar; sin Anexo 1 clínico |
| **D-5** | Aviso en planilla de notas (M12) para estudiantes con PIAR | Fuera de M16; pedir como tarea de M12 |
| **D-6** | Aviso en verificación de cierre de año (M05) de informes anuales pendientes | Sí, no bloqueante, o pendiente documentado |
| **D-7** | EPS/régimen en el Anexo 1: leer de M03 solo en contexto M16 | Opción (a) |
| **D-8** | Docente de apoyo = `ORIENTADOR` (sin rol nuevo) | Sí |
| **D-9** | ¿Se emite D5 (paquete) como único PDF visible para la carpeta, o también los documentos sueltos? | Ambos; D5 nunca con clínica |
| **D-10** | Parámetros por defecto: plazo de elaboración (días) y seguimientos mínimos | Los fija el colegio; sugerido 90 días y 3 |

---

## 12. Orden de implementación sugerido (cuando se autorice)
1. **Constantes y modelos** (`inclusion.ts`, entidades de §8.1, índices, auditoría) + función pura de permisos + tests.
2. **Solicitudes de apoyo** (docente, orientación, directo) y bandeja.
3. **Expediente + Anexo 1 + consentimiento + archivos**.
4. **Ajustes por asignatura** (docente), completitud y plazos.
5. **Seguimientos y transversales/PMI**.
6. **Documentos emitidos** (snapshot, hash, consecutivo, PDF, encabezado institucional, D1–D5).
7. **Informe anual**.
8. **Integración M04/preinscripción y ficha 360°** (D-2).
9. **Frontend** por pantallas; luego pruebas de seguridad e integración.
10. Actualizar `CLAUDE.md` con la sección M16 (estado, reglas que no se ven leyendo un solo archivo, pendientes a propósito: M27, M28, M29, M21/M32, M12/M17/M19, SIMAT/M30).

## 13. Pendientes a propósito (fuera de M16 por regla de alcance)
Portal de acudiente/estudiante (M27) · notificaciones (M28) · archivo general y versiones (M29) · constructor de formatos y personalización de logo/encabezado/textos (M21/M32) · advertencia en notas y ajuste evaluativo en cálculo (M12) · anexo al boletín y promoción (M17/M19/M20) · reporte SIMAT/estadísticos (M30) · firma electrónica certificada · talento excepcional · notificar a docentes por correo.
