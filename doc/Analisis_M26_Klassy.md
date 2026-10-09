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
| Constancia de estudio y certificado de matrícula | Certificado de estudios con notas: no existe la nota definitiva anual (M17 final, M19) |
| QR + huella de integridad en todo lo expedido | Paz y salvo: no hay módulos de cartera ni biblioteca de los que leer deudas |
| Firmas y sello con switch al expedir | PDF del Libro de Matrícula (solo huella, sin QR público: contiene a muchos menores) |
| Verificación pública (QR o código + clave) | Portal del acudiente (M27), plantillas (M21/M32), archivo (M29) |
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

Se incluye un destinatario o propósito opcional (≤120 caracteres). Es el único texto libre de la expedición; si se omite, el documento dice
«a solicitud del interesado».
