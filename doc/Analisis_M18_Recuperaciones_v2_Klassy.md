# M18 Recuperaciones v2 — diagnóstico, análisis y plan de implementación

Rama de trabajo: `test/escenario-recuperaciones-6a` (solo local). Fecha del análisis: 22/10/2026.
Alcance: M18 (recuperaciones) y los cambios mecánicos mínimos en M12 (Mis notas / planilla), M17 (boletín), M27 (portal), M28 (notificaciones) y M05 (calendario).

## 1. Diagnóstico: qué pasa hoy con una recuperación registrada

### 1.1 Lo que se verificó en la base real (22/10/2026)

- Hay **15 recuperaciones de periodo 2 registradas**. Todas guardaron bien su `nota_resultante`, estado y efecto
  (p. ej. Julián Cardona, Ciencias Naturales: original 2.06 → intento 3.2 → resultante 3.2, SUPERADA, efecto REEMPLAZA).
- La planilla (M12) de ese estudiante **sigue en 2.06 DEFINITIVO**. Es lo previsto: la nota cerrada nunca se modifica y la recuperación
  vive aparte (`Recuperacion`).
- **Boletín (M17): sí la aplica.** Se generó el boletín del periodo 2 de Julián: Ciencias Naturales 3.2 (← recuperación 2.06 → 3.2),
  Ciencias Sociales 3.0, Matemáticas 2.0, Lengua 2.8. Un estudiante sin recuperaciones (Juan) no cambia.
- **«Mis notas» y el portal del acudiente: NO la leen.** `notasEstudiante.service.ts` no contiene ninguna referencia a recuperaciones, y el
  portal reutiliza la misma tarjeta (`TarjetaNotasAsignatura`, `PortalNotas`). Tampoco la lee la planilla del docente (`obtenerPlanilla`).
  Por eso en las capturas se ve 2.06 «Nota final» aunque la recuperación está registrada.

### 1.2 Respuesta a «¿se actualiza cuando termina la ventana?»

No. La nota se guarda **en el momento de registrarla** y el boletín la ve de inmediato. No hay ningún proceso que espere al fin de la
ventana. El problema es que las pantallas de «Mis notas», portal y planilla **no consultan** la recuperación (es una omisión, no un tema de fechas).

### 1.3 Quién lee la recuperación y quién no

| Lector | ¿Aplica la recuperación? |
|---|---|
| M18 (listado, definitiva anual) | Sí |
| M17 Boletín (periodo y PDF) | Sí (`cuenta_en_boletin`) |
| M19 Promoción / M33 Sábana / M26 certificado de estudio (vía boletín o `cargarContextoNotas`) | Sí |
| M12 «Mis notas» (estudiante) | **No** |
| M27 Portal del acudiente (notas) | **No** (hereda lo de Mis notas) |
| M12 Planilla del docente | **No** |
| M30 Dashboards y M20 tablero de riesgo | **A revisar**: calculan con notas cerradas, sin recuperación |

La fuente única correcta ya existe: `cargarContextoNotas(...).notas[...].efectivas` (`recuperacion.service.ts`) da la nota de cada periodo
**ya con la recuperación aplicada**. El boletín repite esa lógica en línea (`reportCard.service.ts`), por eso hay dos copias.

### 1.4 Otros hallazgos

1. **Notificaciones.** Solo existe el recordatorio diario `RECORDATORIO_CALENDARIO` (M28), para eventos que empiezan en 0–3 días.
   No avisa al crear/configurar las fechas, no avisa el día antes de que termine la ventana, y si el evento se crea o edita cuando ya empezó
   (el evento del periodo 2 hoy va del 21/10 al 22/10, con resultados hasta el 23/10) **no avisa nada**. No existe aviso al estudiante ni
   al acudiente, ni número rojo en «Recuperaciones».
2. **Efecto «reemplaza» (corregido: NO es un bug).** Con efecto `REEMPLAZA` en el modo `NOTA_FINAL`, una recuperación más baja que la original deja la
   nota más baja. Es por diseño: en ese modo manda el efecto elegido (los interruptores «solo si mejora» y «limitar a aprobatoria» están ocultos en la pantalla
   de política y solo existen en los otros modos). Quien no quiera que la nota baje usa el efecto «La mayor». *(En una primera versión de este análisis lo
   marqué como error; al leer la pantalla de política vi que es decisión del colegio.)*
3. **Ventana actual.** El evento de recuperación del periodo 2 termina hoy (resultados hasta el 23/10): conviene ampliarla si se sigue probando.

## 2. Lo que se pidió frente a lo que ya existe

| Petición | Estado |
|---|---|
| «Ventana excepcional»: el docente solo puede asentar la recuperación sin reabrir la planilla | **Ya es así**: `registrarIntento` nunca toca casillas ni la planilla cerrada; solo escribe en `Recuperacion` y solo dentro de la ventana del calendario. No hay que reabrir nada. |
| Campos `nota_recuperacion` y `nota_definitiva_periodo` en la planilla | **No recomendado.** Duplica un dato y rompería la inmutabilidad del cierre. La nota definitiva del periodo se **deriva** con un solo resolver (nota efectiva). |
| «Habilitar automáticamente al terminar el periodo/cerrar planillas» | Ya se habilita por el calendario (evento + momento de la política); además exige nota cerrada. Falta **mostrarlo en la planilla** (columna de recuperación de solo lectura + acceso directo). |
| Recuperación como una «actividad» (asignación, entrega, nota) | **Nuevo** (sección 4). |
| Notificaciones (docentes, estudiantes, acudientes), número rojo | **Nuevo** (sección 5). |
| Mostrar nota anterior y actual | **Nuevo** (sección 3). |

## 3. Nota efectiva: una sola regla para todos

Crear `notaEfectivaDePeriodo` (servicio puro + carga por lotes) que devuelva, por estudiante, asignatura y periodo:
`{ nota_original, nota_efectiva, recuperacion: { estado, nota_resultante, cuenta, detalle, fecha } | null, bloques? }`.

- Respeta **todas** las opciones de la política: efecto (`REEMPLAZA`, `LIMITA_A_APROBATORIA`, `PROMEDIA`, `LA_MAYOR`), modo de integración
  (`NOTA_FINAL`, `REEMPLAZA_NOTA_MAS_BAJA`, `REEMPLAZA_BLOQUE`, `CASILLA_ADICIONAL`) y `cuenta_en_boletin` (apagado: la recuperación se
  anota pero no cambia la nota mostrada).
- La usan: Mis notas, portal, planilla del docente, boletín (se refactoriza para dejar de duplicar), y se revisan dashboards y tablero de riesgo.
- «Mis notas»: la tarjeta de la asignatura muestra **nota actual** con un chip «Recuperada» y «Nota anterior 2.06» (y el desglose por bloque si la
  integración lo cambió). El acudiente ve lo mismo.

## 4. Recuperación como actividad (Asignación de recuperación)

### 4.1 Por qué NO reutilizar `Activity`
`Activity` está ligada a la planilla (bloques Saber/Hacer/Ser, cupos de casillas, pesos, compuerta del plan de aula, calendario del periodo). Una
recuperación ocurre con la planilla **cerrada** y no debe ocupar casillas. Se reutilizan las **piezas** (adjuntos por contenido, firma de bytes, saneado
de HTML, patrón de entrega, avisos agrupados), no el modelo.

### 4.2 Modelo
- `AsignacionRecuperacion` (nueva): año, clase (`teacher_assignment_id`), grupo, asignatura, `tipo` (PERIODO/ANUAL), `periodo_numero`,
  `intento_numero`, `estrategia` (`TALLER_GUIA` | `SUSTENTACION_ORAL` | `EXAMEN_PRESENCIAL` | `TRABAJO_PRACTICO`), título, instrucciones (texto
  enriquecido saneado), adjuntos (guías/talleres: PDF, Word, imagen), `modalidad` (`DIGITAL` | `PRESENCIAL`), fecha y hora de entrega o citación (y lugar si es
  presencial), destinatarios (lista de estudiantes copiada al crear), `publicacion_id` (copias en otros grupos), estado (`ACTIVA` | `CERRADA` | `ANULADA`).
- `EntregaRecuperacion` (nueva): una por asignación y estudiante: texto o archivo (misma validación que M11), fecha, si llegó dentro del plazo.
  Solo existe para `DIGITAL`; en `PRESENCIAL` **nunca se muestra «no entregó»**: el docente simplemente registra la nota.
- `Recuperacion` (existente): cada intento puede referenciar su `asignacion_id` (opcional). Registrar la nota **sin** asignación sigue funcionando.

### 4.3 Destinatarios sin hacerlo uno por uno
`POST /recuperaciones/asignaciones` con `destinatarios`:
- `TODOS_LOS_QUE_DEBEN` (por defecto): todos los de esa clase que hoy deben recuperar (el servidor los calcula con `listarCandidatos`).
- `SELECCION`: una lista de estudiantes.
- `grupos_adicionales`: otras clases **del mismo docente, misma asignatura y mismo grado** (patrón de M11): crea una copia por grupo con el mismo `publicacion_id`.
El servidor ignora a quien aprobó o ya superó la recuperación y avisa a cuántos omitió.

### 4.4 Flujo
1. **Asignación (docente):** ventana abierta → «Asignar recuperación» (estrategia, instrucciones, adjuntos, fecha, modalidad, destinatarios).
2. **Estudiante:** recibe aviso con número rojo; su asignatura aparece **en rojo («Recuperación pendiente»)** en lugar de «todo al día»; nueva
   vista **«Recuperación»** dentro de la asignatura con instrucciones, adjuntos, fecha, modalidad y, si es digital, el botón de entregar
   (solo dentro del plazo).
3. **Entrega:** el docente recibe un aviso agrupado por asignación («N entregas de recuperación»).
4. **Resultado (docente):** el panel actual de Recuperaciones suma el estado de entrega por estudiante; el docente revisa y registra la nota y las
   observaciones (`registrarIntento`, mismas reglas: intentos, escala, efecto, ventana).
5. **Estudiante y acudiente** ven la nota nueva y la anterior en «Mis notas» y en la actividad de recuperación.

### 4.5 Validaciones (para no romper reglas existentes)
- Año `EN_CURSO`; solo el docente titular; no Preescolar; la política debe tener recuperación para ese periodo.
- La asignación solo se crea con la **ventana del calendario abierta** (decisión a confirmar) y su fecha de entrega/citación debe caer **dentro de la
  ventana** (si no, el docente no podría registrar el resultado).
- Solo destinatarios que **hoy deben recuperar**; se respeta el máximo de intentos y, en la anual, el tope de asignaturas pendientes.
- Entrega digital: matrícula activa, dentro del plazo (sin entrega tardía), una sola entrega, firma de bytes, 10 MB; no se admite si ya fue calificada.
- Una asignación `PRESENCIAL` no acepta entregas digitales.
- No toca la planilla ordinaria, ni el cierre, ni la promoción: la nota sigue entrando por `registrarIntento`.
- Acceso: «no existe» = «no es tuyo» = 404 para el estudiante y el acudiente (vínculo comprobado en el servidor).

## 5. Notificaciones y números rojos

Eventos nuevos en M28 (el texto se arma al leer, como el resto):

| Evento | Destinatarios | Cuándo |
|---|---|---|
| `RECUPERACION_CONFIGURADA` | Docentes con estudiantes que deben recuperar | Al crear o cambiar el evento de recuperación en Año lectivo (incluye fechas) |
| `RECUPERACION_INICIA` | Esos docentes | Día de inicio de la ventana (aviso diario) |
| `RECUPERACION_TERMINA_MANANA` | Esos docentes | El día antes del cierre (usa `fecha_limite_resultados` si existe) |
| `RECUPERACION_ASIGNADA` | Estudiante y acudiente (con portal) | Al crear la asignación |
| `RECUPERACION_ENTREGADA` | Docente | Una alerta agrupada por asignación |
| `RECUPERACION_CALIFICADA` | Estudiante y acudiente | Al registrar la nota |

Números rojos (M28 `Insignia`):
- **Docente:** en «Recuperaciones» con sus estudiantes pendientes.
- **ADMIN y COORDINADOR:** solo el número (sin campanita por cada recuperación), con el total de estudiantes que deben recuperar.
- **Estudiante:** en la asignatura (`recuperacion-<asignatura>`) y en «Mis actividades». **Acudiente:** en la pestaña del hijo (`…-<hijo>`).
- Se agrega «Recuperaciones» a la navegación del estudiante y del acudiente donde corresponda.

## 6. El acudiente: qué debe ver (recomendación)

Recomiendo que vea **todo lo que ve su hijo, en solo lectura**: estrategia, instrucciones, guías adjuntas, fecha y modalidad, estado (entregada / pendiente / presencial), nota
y observación del docente, más la nota anterior y la actual. Razones: la recuperación involucra solo a su hijo (no hay datos de terceros, a diferencia de convivencia),
el apoyo en casa depende de conocer qué debe reforzar y cuándo, y la norma obliga al colegio a informar a los padres. Dos límites: no puede entregar a nombre del estudiante
y **no descarga el archivo que entregó el estudiante** (solo ve que se entregó y cuándo), igual que en las actividades de hoy (sin enlaces).

## 7. Plan de implementación (por fases, cada una entregable)

| Fase | Contenido | Tamaño |
|---|---|---|
| 1. Nota efectiva y visibilidad | Resolver `notaEfectivaDePeriodo`; Mis notas, portal y planilla del docente; boletín usa el resolver; pruebas unitarias y de integración | M |
| 2. Avisos del calendario y números rojos | Eventos de M28; ganchos en crear/editar/eliminar evento (M05); aviso diario con inicio y «mañana termina»; `Insignia` de `/recuperaciones` (docente, ADMIN, COORDINADOR) | M |
| 3. Asignación de recuperación (backend) | Modelos, servicios, rutas, validadores, adjuntos, destinatarios masivos, entregas, avisos al estudiante y al acudiente | L |
| 4. Pantallas | Docente: asignar y revisar entregas; estudiante: vista «Recuperación» y asignatura en rojo; acudiente: tarjeta y drawer; «nota anterior / actual» | L |
| 5. Revisión transversal y documentación | Dashboards M30 y tablero M20 con nota efectiva (a confirmar); `CLAUDE.md`; recorrido completo con el escenario de 6-A | S–M |

Las fases 1 y 2 resuelven lo urgente y se pueden entregar sin esperar a la 3 y la 4.

## 8. Decisiones por confirmar

1. **Acudiente:** nivel de visibilidad de la sección 6 (recomendado) o solo título, fecha y nota.
2. **Crear la asignación:** solo con la ventana abierta (recomendado) o también antes.
3. **Número rojo de ADMIN/COORDINADOR:** como los demás (se apaga al entrar) o un contador fijo con el total pendiente.
4. **Aviso de configuración:** a todos los docentes o solo a los que tienen estudiantes por recuperar (recomendado).
5. **Estadísticas (M30) y tablero de riesgo (M20):** que usen la nota con recuperación (recomendado después de cerrar la ventana) o se queden como están.
