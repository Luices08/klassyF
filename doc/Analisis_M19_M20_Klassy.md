# Análisis M19 y M20 — Promoción, cierre del año y Comisión de Evaluación

**M19:** Promoción y cierre del año (motor de reglas del SIEE, cierre anual, titulación, rollover de matrícula).
**M20:** Comisión de Evaluación y Promoción (dashboard, sesiones, votos, compromisos, actas, promoción anticipada).

Documento maestro (`Idea_Klassy…v2`): M19 clasifica al cierre (promovido, reprobado, pendiente de recuperación, retirado, graduado), registra la
promoción por recuperación, la anticipada y la de reiniciantes, y **separa resultado académico, decisión de promoción y soporte documental**. M20 da
el dashboard, las alertas de riesgo, la detección de reprobación masiva, el análisis de asistencia y desempeño, y las reuniones, decisiones y actas
con su evidencia. Regla de oro (§regla de no quemar): topes de materias, % de inasistencia y condiciones de anticipada se leen de la base de datos.

## 1. Decisiones tomadas (confirmadas por el usuario)

1. **Disciplina:** las faltas de convivencia **nunca reprueban el año** (Corte Constitucional T-341/93, T-967/07). Una regla con esa condición solo
   puede ordenar «enviar a comisión» o «no renovar cupo». Lo rechaza `validarPolitica`.
2. **Firma de los miembros de la comisión:** confirmación con la contraseña de cada usuario (patrón existente). No es firma electrónica certificada (Ley 527/1999).
3. **Un solo motor de sesiones** con campo `instancia`: `COMISION_EVALUACION`, `CONSEJO_ACADEMICO`, `CONSEJO_DIRECTIVO`.
4. **Servicio social:** alerta informativa en 10°; requisito bloqueante solo para el grado/diploma de 11°. Las 80 horas son parámetro, no constante.
5. **Rollover a M04:** entra, como **fase final**: generación masiva de pre-matrículas / reserva de cupo pendientes de formalizar (la matrícula es un contrato y la firma el acudiente).
6. **Acta:** formato estándar basado en el patrón de M15, con huella SHA-256.

## 2. Principios de diseño

- **Dos dimensiones separadas.** *Resultado académico* del año (M19): `PROMOVIDO`, `PENDIENTE_RECUPERACION`, `PROMOVIDO_POR_RECUPERACION`,
  `PROMOVIDO_CON_ARRASTRE`, `NO_PROMOVIDO`, `EN_COMISION`, `RETIRO_PROPUESTO`, `INCOMPLETO`. *Situación de titulación* (11°): `APTO`,
  `APROBO_NO_GRADUADO`, `GRADUADO`, `GRADUADO_EXTEMPORANEO`, en un registro propio con historial, para graduar por ventanilla sin reescribir un año cerrado.
- **Motor de reglas con una sola forma** (como las variables de M09): regla = condiciones (todas deben cumplirse) + acción + momento (`CIERRE` /
  `TRAS_RECUPERACION`) + alcance (nivel o grado). Una condición nueva es un tipo más en `constants/promocion.ts` y su caso en `utils/promocion.ts`.
  Precedencia entre acciones: `PROPONE_RETIRO` > `NO_PROMUEVE` > `ENVIA_A_COMISION` > `PENDIENTE_RECUPERACION`. `NO_RENUEVA_CUPO` es aparte (permanencia).
- **Explicable:** cada resultado trae las reglas disparadas y los motivos en palabras (para el acta y la pantalla).
- **Función pura** `evaluarPromocion` (sin base ni reloj); el servicio arma la entrada leyendo M12, M13, M14, M16 y M18.
- **Sin duplicar:** la recuperación final, su tope (`anual.max_asignaturas_pendientes`) y su efecto sobre la nota son de **M18**; M19 los lee. La asistencia es de M13, las notas de M12 (solo `CERRADO`/`DEFINITIVO`), los pesos de área de M06.

## 3. Casos cubiertos por el motor (fase 1, ya implementada)

| Caso | Cómo se configura |
|---|---|
| Perder X asignaturas | `PERDIDAS_AL_MENOS n` → `NO_PROMUEVE` |
| Perder una obligatoria / crítica | `asignaturas_criticas_ids` + `PERDIDAS_AL_MENOS n=1 filtro=CRITICAS`; combinable con el total (2 perdidas y una crítica) |
| Perder dos materias a la vez (matemáticas y español) | `PIERDE_ASIGNATURAS modo=TODAS` |
| Unidad por área (pesos M06) | `unidad=AREA` y `area_pierde_con_asignatura_perdida` |
| Inasistencia injustificada / total, global o por asignatura | `INASISTENCIA_GLOBAL_SUPERA` / `…_ASIGNATURA_SUPERA` con `faltas` |
| Promedio general mínimo | `PROMEDIO_GENERAL_MENOR` |
| No presentó o no superó la recuperación | `RECUPERACION_NO_SUPERADA_AL_MENOS` (momento `TRAS_RECUPERACION`) |
| Deserción no formalizada | inasistencia + `SIN_NOTA_AL_MENOS` → `PROPONE_RETIRO` (una persona confirma el retiro de oficio en M04) |
| Pendiente de recuperación / promovido por recuperación | acción por defecto `sin_regla.cierre`; resultado al recalcular tras M18 |
| Promoción con arrastre | `arrastre` (admite, máximo, condición en el año siguiente, plazo, consecuencia) + asignaturas/áreas arrastrables |
| Convivencia | `FALTAS_CONVIVENCIA_AL_MENOS` solo con `ENVIA_A_COMISION` o `NO_RENUEVA_CUPO` |
| PIAR | `piar.derivar_a_comision`; la comisión ve solo el indicador de ajustes razonables y la ficha pedagógica según `permisoInclusion` (M16) |
| Estudiante sin todas las notas | `INCOMPLETO`: no se cierra |

Valores de partida conservadores (`politicaInicial`): todo lo perdido va a recuperación y, tras ella, no se promueve; sin reglas, sin arrastre.

## 4. Fases

1. **Núcleo de M19** ✔ (esta rama): política por año con herencia, motor puro, API `/promocion/politica/:año`, pruebas.
2. **Cierre y snapshot:** `EvaluacionPromocionEstudiante` (inmutable, HMAC, versionada), simulación sin efectos, recuperación final (recalcular tras M18), arrastre, retirados, traslados con notas homologadas, ajuste por reclamación (versión nueva que reemplaza, con lista de certificados afectados).
3. **Desbloqueo de M26:** `obtenerPromocion`, variables `{{promocion.*}}`, tabla de valoraciones desde el snapshot (una sola fuente), certificado de estudio oficial.
4. **Titulación en M26** — *4a y 4b hechas (requisitos, estados, reevaluación automática, título por institución/grupo, acta con libro y folio, diploma, constancia y candado en la expedición); resolución rectoral va con la fase 6:* `RegistroServicioSocial`, `RegistroSaber11`, carpeta académica (certificados externos por grado), paz y salvo de titulación persistente (unificar M04 y dependencias de M26), acta de grado (número, libro, folio), diploma, constancia de culminación, graduación extemporánea.
5. **M20** — *hecha en backend (tablero configurable, sesiones por instancia, quórum, recusación automática, votos, compromisos, firma con contraseña, acta con SHA-256 y paso de decisiones a M19); pantallas en la fase 8:* dashboard (semáforo configurable, PIAR, reprobación masiva por asignatura/docente/grupo con mínimo de estudiantes), sesiones por `instancia`, quórum, recusación, voto por caso, compromisos con responsable y fecha, firma de miembros con contraseña, acta con SHA-256.
6. **Promoción anticipada y reiniciantes** — *hecha en backend (confirmada por el usuario: tratamiento de notas configurable con `NIVELACION` de partida; `COPIAR_EQUIVALENTES` exige nivelación solo para la materia sin equivalente; `DEJAR_SIN_NOTA` reparte el porcentaje del periodo entre los restantes); pantallas en la fase 8:* ventana configurable (por norma, primer periodo), criterios, cadena consentimiento de padres → comisión → Consejo Directivo → resolución rectoral; homologación de notas del P1; movimiento de matrícula.
7. **Rollover a M04** — *hecho en backend (simulación y ejecución, solo pre-matrículas; paz y salvo como candado de la formalización; verificación de cierre de M05 y sección PROMOCION del boletín M17 conectadas a M19):* pre-matrícula masiva con candados (paz y salvo, no renovación de cupo, retirados), nunca matrícula definitiva automática.
8. **Pantallas** — *hechas (ver CLAUDE.md, «Pantallas de M19/M20»; compilan pero no se probaron en un navegador)*: (política, cierre, comisión, titulación) y pruebas de integración con base real.

## 5. Cambios en M26 (resumen)

- `obtenerPromocion` lee el último cierre definitivo vigente (nunca una simulación); ampliar `DatosEstudios.promocion` (concepto, texto, grado destino, pendientes, arrastre).
- Fuentes nuevas en `FUENTES_CERTIFICADO` (`PROMOCION`, `TITULACION`, `RESOLUCION`) con compuerta genérica «solo si el estado es X»; nada se compara por nombre de tipo.
- Servicio social, Saber 11 (solo código y constancia, sin puntajes) y carpeta académica viven en **M26**; M19 los consulta.
- Dos «paz y salvo» hoy (M04 `PazYSalvo` persistido; M26 dependencias solo al expedir): hay que unificarlos para que M19 consulte uno.
- Acta de grado con libro/folio (patrón del folio de M04), diploma, constancia de culminación y resolución rectoral como tipos con consecutivo propio.
- Graduación extemporánea: registrar el requisito faltante re-evalúa la titulación en la misma transacción, con folio y fecha nuevos, y marca `GRADUADO` en el perfil.
- Un dato nuevo en M01 (mención del título: bachiller académico o técnico) — cambio mínimo, a confirmar.
- Cambios mecánicos en M05 (`verificarCierre` consulta a M19), M04 (candados y movimiento de grado), M17 (sección `PROMOCION`), M16 (indicador para la comisión), M28 (eventos).

## 6. Pendientes a validar con la norma vigente

Decreto 1290/2009 art. 7 (promoción anticipada «durante el primer periodo»), Res. 4210/1996 (servicio social), Ley 1324/2009 (Saber 11), Decreto 1421/2017 (PIAR), formato de acta de la Secretaría de Educación. El plazo de reclamación lo define el SIEE de cada colegio (no es una norma nacional de 3 días).
