# Análisis M26 — Secretaría académica y certificados

Decisiones tomadas con el equipo antes de implementar. Las reglas vigentes del módulo viven en `CLAUDE.md` (sección M26); este documento
conserva el porqué.

## Qué pide el documento maestro

M26: certificados de estudio, constancias de matrícula y otras certificaciones, paz y salvos «cuando aplique», Libro de Matrícula y su trazabilidad,
plantillas oficiales configurables y registro de quién generó cada documento y cuándo. Enganche con M04: todo estudiante matriculado debe poder
generar de inmediato su constancia de estudio o certificado de matrícula. El Home público anuncia la «Validación de Certificados» por QR o número de folio.

## Alcance de la primera entrega

| Entra | Queda para una fase 2 (y por qué) |
|---|---|
| Constancia de estudio y certificado de matrícula | Expedir el certificado de estudio como oficial: falta el concepto de promoción (M19) |
| Paz y salvo con dependencias configurables y confirmadas a mano | Que las dependencias se calculen solas: no hay módulos de cartera, biblioteca ni inventario |
| Certificado de estudio con notas: construido, solo vista previa hasta M19 | PDF del Libro de Matrícula (solo huella, sin QR público: contiene a muchos menores) |
| QR + huella de integridad en todo lo expedido | Portal del acudiente (M27), plantillas (M21/M32), archivo (M29) |
| Firmas y sello con switch al expedir | Vigencia y ciudad de expedición: no hay dato fuente en el sistema |
| Verificación pública (QR o código + clave) | |
| Historial, anulación con motivo, auditoría | |

## Requisito 1 — cero redundancia

El cliente solo envía ids y opciones. Cada dato sale de su fuente: institución (M01), sede/jornada, estudiante (M03), grado/grupo/año/folio (M04),
firmantes (usuarios del sistema). Un dato que el sistema ya conoce no se pide: se agrega al snapshot.

## Requisito 2 — seguridad

Alternativas evaluadas para la huella:

| Opción | Resultado |
|---|---|
| SHA-256 simple (lo que usan M15/M16) | Descartada para M26: quien edite la base puede recalcular una huella coherente |
| **HMAC-SHA256 con secreto del servidor** | **Elegida.** Casi el mismo costo; sin la clave el documento alterado no verifica |
| Firma digital certificada (PAdES, entidad certificadora) | Fuera de alcance (costo y complejidad); no se presenta como «firma digital» |

El QR solo lleva un token opaco; los datos nunca viajan en él. La verificación pública responde lo mínimo (nombre y documento enmascarado, sin notas),
por la Ley 1581 y por tratarse de menores. Las actas de convivencia y el PIAR conservan su huella interna y **no** se exponen públicamente.

## Firmas y sellos

Estado previo: no existía gestión de firmas ni sellos. El PIAR dejaba líneas para firma física más escaneo; el acta del comité se «firmaba» como registro
del usuario ADMIN, fecha y hash, sin imagen; `Institution` solo tenía `logo_url`.

Diseño: configuración única por instalación (firmantes, imágenes, política por documento) y tres switches al expedir (Rectoría, Secretaría Académica,
sello). La secretaría puede estampar la firma de Rectoría mientras el ADMIN no revoque la delegación. Las imágenes son inmutables y versionadas por huella
para que lo emitido siempre se reimprima igual; las opciones elegidas entran en la huella.

## Decisión sobre el destinatario

El maestro pide que el destinatario o motivo **no sea un input**: es un selector que depende del documento (constancia de estudio: A quien interese, Caja de
Compensación, EPS/ADRES, visa/migración, juzgado; paz y salvo: retiro/traslado, graduación, cierre de año; certificado de estudio: traslado, educación superior,
convalidación; constancia de matrícula: A quien interese, legalización de cupo), con «Otro (especificar…)» que abre un campo de texto. Si no se escribe nada se
asume «A quien interese». La primera entrega lo dejó como texto libre (≤120 caracteres), lo que se apartaba del maestro; se corrigió con un catálogo por tipo
**en código** (`CERTIFICADOS[].destinatarios`): son opciones de redacción de un documento, no reglas del colegio, así que no ameritan una pantalla de edición.
Lo escrito en «Otro» es el único texto libre de la expedición.

## Firmas y sellos: quién las gestiona

La primera entrega dejó todo en manos del ADMIN, pero el maestro atribuye la firma y el sello a la Secretaría. Ahora la secretaría carga su firma y el sello, y la
firma de Rectoría mientras el ADMIN mantenga la delegación (la misma llave que ya permitía estamparla). Quién es el rector, la delegación, la política por documento y las
dependencias siguen siendo solo del ADMIN. La carga de imágenes no funcionaba por un desajuste de método HTTP (el cliente enviaba POST y la ruta esperaba PUT).

## Documentos que dependen de módulos aún sin construir

Un documento expedido se congela y no se corrige (solo se anula y se reexpide), así que «generar ahora y completar después» no sirve para lo ya emitido.
- **Paz y salvo**: se genera ya. El colegio define sus dependencias y se confirman a mano al expedir; cuando existan los módulos de origen, cada dependencia pasará a
  calcularse sola sin cambiar el documento.
- **Certificado de estudio con notas**: se construye completo (malla, notas por periodo ponderadas por el porcentaje de cada periodo, desempeño de la escala del año), pero la
  expedición oficial se bloquea mientras `obtenerPromocion` (M19) no devuelva el concepto. Entre tanto hay vista previa marcada. El concepto no se escribe a mano: sería
  un dato oficial sin respaldo y duplicaría lo que M19 va a registrar (regla de oro de datos).

## Plantillas configurables (corrección de alcance)

El maestro lista «Permitir plantillas oficiales configurables» dentro de M26, y la regla de la sección de configuración dice que las reglas no deben quedar quemadas en
el código. La primera entrega y este análisis las enviaron a «fase 2 (M21/M32)»: fue un error de alcance, porque el texto de los cuatro documentos estaba escrito en
`certificadoTexto.ts`. Ahora cada documento tiene una plantilla versionada en la base de datos que edita el ADMIN.

Decisiones:
- **Versión mínima dentro de M26, con el patrón de M12.** M12 ya construyó su «M21 en versión mínima» (`ConfiguracionPlanilla`: título, subtítulo, pie, logo, columnas y
  firmas, solo presentación, con vista previa de datos de muestra). M26 sigue el mismo criterio: no espera a M21; edita el texto de sus documentos, no es un constructor libre.
- **La plantilla nunca crea datos.** Usa variables de un catálogo cerrado, cada una con su módulo de origen (M01, M03, M04, M05, selector al expedir). Si falta un dato que un
  bloque visible necesita, no se expide. Una condición por bloque («solo si hay / no hay» un dato) evita huecos como «Dado en , a los…».
- **Lo mínimo legal no se puede quitar.** Al publicar se valida que sigan los bloques y datos que exige el Decreto 180 de 1981 art. 13 (compilado en el Decreto 1075 de 2015)
  para el certificado de estudio, y lo que pide el maestro para los demás. El encabezado institucional y el QR/huella los pone siempre el sistema.
- **Versionado.** Cada publicación crea una versión; el documento expedido guarda el texto ya resuelto, así editar no cambia lo expedido.
- **El destinatario también es contenido**: sus opciones y frases viven en la plantilla (esto revierte la decisión anterior de dejarlas como constante en código).

## Datos por documento y origen

El encabezado (nombre oficial, escudo, DANE, NIT, resolución, sede, jornada, año) sale de M01 en todos los documentos; la ciudad y el departamento se agregaron a M01 para
«Dado en [ciudad]». El estudiante sale de M03, grado/grupo/folio/ingreso de M01/M04, las notas de M12 (solo `DEFINITIVO`) vía M17, las semanas lectivas de M05 y la
promoción de M19 (aún no existe). No existen todavía lema (M01) ni código estudiantil (M03).

## Archivos de imágenes

Las firmas, el sello y el escudo se guardan por la huella de su contenido en `uploads/certificados/imagenes`, como el resto de archivos del sistema. Un incidente real mostró el
riesgo: las pruebas de integración borraban esa carpeta y los certificados ya expedidos dejaron de poder imprimirse («Falta el archivo de la imagen…»). Las pruebas ahora usan
una carpeta temporal, el sistema avisa cuando falta un archivo y volver a cargar la misma imagen lo restaura sin cambiar nada de lo expedido. El escudo también se congela
al expedir para que una reimpresión no cambie si el colegio cambia de logo.

## Alcance por sede

Cada certificado guarda la sede de su matrícula; la secretaria solo trabaja con las sedes que tiene asignadas (sin sedes no ve nada) y el ADMIN con todas.

## La tabla de valoraciones y la ciudad (corrección)

**Tabla de notas.** La primera versión del certificado de estudio fijaba en el código de M26 las columnas, la nota en letras, el formato de decimales y la nota final anual. Eso
contradice el maestro: cómo se presenta una tabla de notas es decisión de cada institución (M17: «constructor de plantillas por institución», «asignaturas cuando
corresponda»; M32: formatos) y la escala, los decimales y la equivalencia nacional ya los define cada institución en M05. Las «letras» salieron de una lectura del Decreto 180 de 1981 que
no se confirmó ni se sabe si aplica con la evaluación actual (Decreto 1290), y el maestro no las pide. Ahora M26 solo recibe una tabla ya armada (`TablaValoraciones`: columnas, filas de
texto y pie), la dibuja y la congela. Quien la arma (`armarTablaValoraciones`) es provisional —es el boletín final de M17— y entrega solo lo que lista el maestro: área o asignatura,
intensidad horaria semanal y anual, calificación final con los decimales de M05 y su equivalencia nacional. Solo el certificado de estudio (con notas) lleva esta tabla.

**Ciudad y departamento.** El maestro pide «Dado en [ciudad]» y «Ciudad y fecha de expedición», y ningún módulo tenía la ciudad del colegio (la sede solo tiene dirección; el municipio del
perfil del estudiante es del estudiante). Por la regla de oro se creó en M01, como campos opcionales (`ciudad`, `departamento`); sin ciudad el cierre usa «Fecha de expedición». Ninguna plantilla
de partida usa el departamento todavía: queda disponible como variable.

## Revisión de octubre de 2026: tipos configurables, ficha, solicitante y vigencia

**Los tipos de documento son datos (regla de «nada de código quemado»).** Los cuatro documentos iniciales eran una lista fija en el código (enum del modelo, validadores, `if` por nombre).
Ahora son `TipoCertificado`: Secretaría y el ADMIN los crean, editan, archivan y eliminan; los cuatro de partida se siembran una sola vez y si se eliminan no vuelven. Lo que cambia el
comportamiento de un tipo son sus **fuentes** (valoraciones y promoción; dependencias del paz y salvo), que quien configura enciende y el código sabe leer: el usuario no crea datos, la
plantilla solo los coloca. Un tipo nuevo nace en **borrador** (Secretaría lo redacta y lo prueba con la vista previa) y el ADMIN lo activa. **Eliminar solo si nunca se expidió nada**: un
documento expedido se verifica por su QR y su consecutivo no puede quedar huérfano, así que ese tipo se archiva (deja de ofrecerse; lo expedido sigue vigente y se reimprime).

**Qué se aprovechó del análisis anterior y qué no.** Ya existían la persistencia de plantillas con versiones (`PlantillaCertificado`, no se creó otro modelo), «Restablecer», el visor del PDF
en la misma pantalla (sin `window.open`) y la inmutabilidad de firmas y sellos históricos. No se aceptó que el PDF «nunca falle» omitiendo una imagen que falta: un documento reimpreso sin
su firma o sello, bajo el mismo código y con el QR diciendo «válido», sería otro documento. Un archivo ausente o dañado responde 409 con el paso para recuperarlo (volver a cargar la misma imagen
lo restaura). Tampoco se aceptó que la vista en vivo genere un PDF por pulsación: es un JSON liviano (`/plantillas/:tipo/render`) que se pide al dejar de escribir; el PDF queda para la fidelidad.

**EPS.** La opción «EPS del estudiante» lee la EPS de M03 (no de M04), solo con la autorización de datos sensibles del responsable legal (Ley 1581/2012, art. 5 y 6), solo el nombre y solo si esa
opción se elige; sin EPS o sin autorización la opción no se puede usar y se explica por qué. El régimen nunca se imprime.

**Quién solicita.** Hasta ahora cualquier secretaria podía expedir el documento de cualquier estudiante de su sede sin dejar rastro de a quién se entregaba. Ahora es obligatorio registrar al solicitante
(acudiente vinculado, el propio estudiante si es mayor de edad, un tercero con autorización escrita o una autoridad con oficio). No se imprime y se ve en el historial.

**Vigencia y anulación.** La vigencia que declara el documento («30 días a partir de su expedición») ahora la aplica la verificación pública: pasado el plazo dice «vigencia cumplida». Cambiar el
sello o una firma no anula lo ya expedido; si una imagen se compromete, el ADMIN puede anular de una vez los documentos que la llevan (con motivo y contraseña). La delegación de la firma de
Rectoría a Secretaría **nace apagada**.

**Pendiente, a propósito:** la solicitud desde el portal del acudiente y la descarga por el propio estudiante o acudiente (M27, que aún no existe); el editor de fichas no se ejercitó en un navegador real
(solo la lógica y el DOM simulado); los límites por ciudad/EPS de cada región no se catalogan: la entidad se toma de M03 o se escribe con «Otro».
