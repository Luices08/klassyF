# Análisis: importación masiva de matrículas desde SIMAT (M04 ← SIMAT)

Fecha: 2026-10-26 · Estado: **análisis, sin código**. Archivo estudiado: `doc/4 Archivo plano Simat corte 20 de abril de 2026.xlsx`
(ETC Yumbo). Caso de prueba: **IE JUAN XXIII** (DANE `176892000108`).

---

## 1. Resumen ejecutivo

La idea es correcta y de alto valor: SIMAT es el registro oficial de la matrícula; digitarla de nuevo en Klassy es trabajo
duplicado y fuente de errores. Pero el archivo de ejemplo y el modelo actual de Klassy dejan siete problemas que hay que
resolver **antes** de escribir código. Los más importantes:

1. **El archivo no trae acudiente.** Ni nombre, ni documento, ni parentesco. Sin acudiente no se abre el portal (M27), no se
   citan familias (M24), no hay quién autorice los datos de salud (Ley 1581) y el checklist de matrícula lo pide. Es el mayor
   vacío del proceso y hoy nadie lo cubre.
2. **No trae dirección de residencia**, solo `BARRIO` (texto sucio: «PUERTO ISAAC», «PUERTO ISAACS», «PUERTO ISACS»). La
   actualización silenciosa de «dirección» que se espera **no es posible** con este archivo; solo barrio.
3. **Klassy no puede representar el 3,4 % de los matriculados de Juan XXIII** (45 de 1.306): grados `23/24/25` (ciclos de
   jóvenes y adultos, jornada nocturna) y `99` (Aceleración del aprendizaje). `Grade.numero` solo admite −2…11. Es una decisión
   de modelo de negocio, no un detalle.
4. **Klassy se niega a guardar EPS y tipo de sangre sin la autorización del acudiente** (pre-validación de `StudentProfile`).
   El archivo trae EPS para 920 y RH para 1.134 de los 1.306 matriculados. Hay que decidir cómo se registra esa autorización
   en una carga masiva.
5. **El «grupo» de SIMAT (`601`, `1101`, `JRD`, `-101`) no es la nomenclatura de Klassy**, y los grupos pueden no existir aún en
   Klassy. Hay que definir si la importación los crea, y con qué cupo (el archivo no trae capacidad).
6. **El archivo mezcla 46 instituciones** (el consolidado de la ETC). Un colegio nunca debería tenerlo, y menos subirlo a su
   instalación. El importador debe tomar solo las filas de su DANE y **no guardar ni registrar** las demás.
7. **Riesgo de privacidad inmediato:** el `.xlsx` (23.599 menores con documento, nombre, discapacidad, EPS) está en `doc/` como
   archivo **sin trackear y sin ignorar**: un `git add .` lo subiría al repositorio. Recomiendo agregarlo a `.gitignore`
   ahora y no usarlo como fixture de pruebas (ver §10).

Lo que **sí** encaja bien: el nombre ya viene en cuatro partes (calza con el modelo de M03), el documento es único por
estudiante (llave de cruce), el tipo de documento y el género se mapean casi 1 a 1, y la discapacidad usa las categorías
SIMAT que M16 ya tiene sembradas como catálogo.

**Incógnita mayor:** este es el *archivo plano de la ETC* (54 columnas). El Excel/CSV/TXT que cada colegio exporta de SIMAT
puede tener otras columnas o nombres. Necesito una **muestra real exportada por un colegio** (idealmente en los tres
formatos) antes de congelar el layout. El importador debe leer por **nombre de columna normalizado**, no por posición.

---

## 2. Qué contiene el archivo

| Hoja | Contenido | Uso |
|---|---|---|
| `Hoja1` | 23.599 matrículas × 54 columnas, año 2026, ETC Yumbo | Datos a importar |
| `Hoja2` | Tabla dinámica (matriculados por institución/sede/grado) | Control de totales; se ignora al importar |
| `Hoja 1` | Convenciones: códigos de discapacidad, apoyo académico especial, trastornos y talentos | Catálogo de referencia (ver §5) |

Alcance: 46 instituciones (45 con DANE + 17 filas sin institución: estados `NUEVO`/`INSCRITO`, aún no asignados), 75 sedes.
Sin documentos repetidos ni personas duplicadas por nombre + fecha de nacimiento en todo el archivo.

**Estados SIMAT en el archivo completo:** MATRICULADO 22.471 · RETIRADO 784 · SIN CONTINUIDAD 282 · ASIGNADO POR CONTINUIDAD 33 ·
NUEVO 16 · REPROBADO 6 · GRADUADO 5 · ASIGNADO 1 · INSCRITO 1.

### Juan XXIII

| Dato | Valor |
|---|---|
| Filas | 1.360 (MATRICULADO 1.306 · RETIRADO 54) |
| Sedes | 2: `176892000108` JUAN XXIII (902 filas) y `276892000242` MANUEL MARIA SANCHEZ (458) |
| Jornadas | TARDE 632 · ÚNICA 627 · MAÑANA 67 · NOCTURNA 34 |
| Grupos distintos (sede·jornada·grado·grupo) entre matriculados | 46, de 3 a 43 estudiantes |
| Tipos de documento (matriculados) | TI 765 · RC 426 · PPT 86 · NES 20 · CE 5 · CC 4 |
| Matrícula registrada en SIMAT en diciembre de 2025 | 748 de 1.360 (55 %) |

> Ojo: la sede 2 tiene un código DANE que **no empieza igual** que el de la institución (`2768…` vs `1768…`). No se puede
> validar una sede por prefijo; hay que cruzarla contra las sedes registradas en Klassy.

---

## 3. Mapa campo por campo (SIMAT → Klassy)

Leyenda: **Existe** = hay campo equivalente · **Transforma** = existe pero el valor necesita limpieza/traducción ·
**No existe** = Klassy no lo contempla · **Ignorar** = no se importa.

### 3.1 Ubicación y matrícula

| Columna SIMAT | Ejemplo | Destino en Klassy | Estado |
|---|---|---|---|
| `ANO` | 2026 | `AcademicYear.year` (el año debe existir y no estar CERRADO) | Existe; validar |
| `DANE` | 176892000108 | `Institution.codigo_dane` (12 dígitos) | Existe; **validación bloqueante** |
| `CODIGO_DANE_SEDE` | 276892000242 | `Campus.codigo_dane_sede` | Existe; **validación bloqueante** |
| `CONSECUTIVO` | 17689200010802 | = DANE institución (12) + 2 dígitos de sede | Solo control de coherencia |
| `SEDE`, `INSTITUCION` | texto | Nombre (informativo; el cruce es por código) | Existe |
| `JORNADA` | MAÑANA, ÚNICA, TARDE, NOCTURNA, **COMPLETA**, **FIN DE SEMANA** | `JornadaOperativa.nombre` (MANANA/TARDE/UNICA/NOCTURNA/SABATINA) | Transforma; **COMPLETA no existe** (4.798 filas en el archivo, no en Juan) |
| `GRADO_COD` | −2…11, **21–26, 99** | `Grade.numero` (−2…11) | Transforma; **21–26 y 99 no existen** |
| `GRUPO` | 601, 1101, −101, 1, `JRD`, `PJR3` | `Group.nomenclatura` | **Transforma + decisión** (§5.3) |
| `RENOMBRE` | 502 (53 valores, 59 % vacío) | — | Ignorar (en Juan es idéntico a `GRUPO` cuando viene) |
| `MODELO` | EDUCACIÓN TRADICIONAL, ESCUELA NUEVA, ACELERACIÓN…, PROGRAMA PARA JÓVENES… | — | **No existe** (atributo de grupo) |
| `ESTADO` | MATRICULADO, RETIRADO… | Decide la acción (§6.2) | Regla de negocio |
| `MOTIVO` | NO CONTINUÓ EN EL ESTABLECIMIENTO EDUCATIVO | Texto de retiro (informativo) | Solo informativo |
| `FECHAINI` | 45860.5085 (serial Excel) | `Enrollment.fecha_matricula` | Existe; **hoy `createEnrollment` fija `new Date()`** |
| `FECHAFIN` | vacío en el 100 % | Fecha efectiva de la salida | **Siempre vacío**: no sirve para retirar |
| `ZONA_SEDE`, `CALENDARIO`, `SECTOR` | URBANA, A/B, OFICIAL | — | No existe; ignorar en v1 (útil luego para C-600, que hoy deja «sector» en blanco) |

### 3.2 Persona

| Columna | Destino | Estado |
|---|---|---|
| `DOC` | `User.numero_documento` (único) | Transforma: Excel lo entrega como **número** o texto (`N48324894972` en NES). Siempre a texto, sin `.0` |
| `TIPODOC` | `User.tipo_documento` | Transforma: `TI:TARJETA…` → `TI`. Mapear por el prefijo antes de `:`. PPT llega **corrupto** (`PROTECCIÃ¿N`, 895 filas) |
| `APELLIDO1/2`, `NOMBRE1/2` | `primer_apellido`, `segundo_apellido`, `primer_nombre`, `segundo_nombre` | Existe (las cuatro partes; `resolverNombre` arma nombre y apellido) |
| `GENERO` | `genero` (M/F/OTRO) | Transforma (MASCULINO/FEMENINO) |
| `FECHA_NACIMIENTO` | `fecha_nacimiento` | Transforma: serial de Excel → fecha UTC |
| `NUI` (ej. `SAMABO1778704895`), `PER_ID` | — | **No existe**; recomendado guardarlos (§5.5): son la llave estable de SIMAT |

### 3.3 Condición socioeconómica y población

| Columna | Destino | Estado |
|---|---|---|
| `ESTRATO` | `estrato` (1–6) | Transforma: «ESTRATO 2» → 2. **«ESTRATO 0» (25 en Juan) y «NO APLICA» (71) no caben** (`min: 1`): quedan vacíos con aviso, no error |
| `SISBEN IV` | — | **No existe.** Valores A1…D21 y «NO APLICA». El usuario pidió explícitamente sincronizarlo |
| `BARRIO` | `barrio_vereda` | Existe (texto sucio, sin normalizar) |
| (no viene) | `direccion_residencia`, `municipio`, `lugar_expedicion` | **Ausentes en el archivo** |
| `ETNIA` | `grupo_etnico` (NINGUNO/INDIGENA/AFRODESCENDIENTE/ROM/RAIZAL/PALENQUERO) | Transforma: 26 valores. NEGRITUDES (33 en Juan) → AFRODESCENDIENTE con pérdida; los pueblos (PAEZ, PASTOS, COCONUCO…) → INDIGENA **perdiendo el pueblo**; «PALANQUERO» (typo) → PALENQUERO |
| `PAIS_ORIGEN`, `PAIS_NACIMIENTO`, `PAIS_NACIONALIDAD2` | — | **No existen.** Relevante: 1.890 venezolanos en el archivo, 126 en Juan; PPT/NES/CE dependen de esto |
| `CAMPESINO` | — | No existe; `S/N`, 88 % vacío |

### 3.4 Salud e inclusión (datos sensibles)

| Columna | Destino | Estado |
|---|---|---|
| `EPS` | `eps` (texto libre) | Existe; 66 nombres con variantes. **Exige autorización registrada** |
| `TIPO DE SANGRE` | `rh` (`O+`) | Transforma: viene `O +` (con espacio) |
| `DISCAPACIDAD` | `tiene_discapacidad` + solicitud de apoyo M16 (`CondicionApoyo`) | Transforma: 10 valores SIMAT que calzan con las condiciones PIAR sembradas (ver §5.6) |
| `TRA_ESP_APR_ESCOLAR` | Solicitud de plan de apoyo M16 | Transforma: TDAH / trastornos de aprendizaje → condiciones `PLAN_APOYO` (imprecisas) |
| `APOYO_ACADEMICO_ESPECIAL` | — | No existe (aula hospitalaria, atención domiciliaria, etc.) |
| `LIST_CAP_EXCEPCIONALES` | `tiene_talento_excepcional` | Transforma (≠ «NO APLICA» → true). M16 dejó talento fuera de alcance |
| `HA_ESTADO_VINCULADO_SRPA`, `ESTA_ACTIVO_SRPA` | — | **No importar jamás** (Sistema de Responsabilidad Penal para Adolescentes: dato reservado) |

### 3.5 Contacto

| Columna | Destino | Estado |
|---|---|---|
| `TELEFONO` | `User.telefono` | Transforma: 152 de 1.360 en Juan son texto con **varios números** (`3156716162/3217341666`, `3195652098-3127979749`); 147 vacíos; hay valores `0` |
| `CORREO` | — | **No usar como `User.email`:** es único y 40 estudiantes de Juan comparten 19 correos (hermanos; incluso un correo institucional de un colegio de Cali). No hay campo de «correo de contacto» |

### 3.6 Administrativas / sin uso

`MATRICULACONTRATADA` (todo «N»), `FUENTE_RECURSOS` (SGP), `INTERNADO` (todo «NINGUNO»), `NUM_CONTRATO` (vacío),
`CATEGORIA_AULA`, `CONTADOR` (todo 1), `JERARQUIA`, `ETC`: ignorar. No son necesarias para matricular y varias son
financieras de la Secretaría de Educación.

---

## 4. Qué variables no contempla hoy Klassy

Ordenadas por si **bloquean** o solo **empobrecen** la importación.

**Bloquean (sin decisión no se puede importar a esos estudiantes):**

| # | Falta | Afecta |
|---|---|---|
| B1 | Grados 21–26 (ciclos de jóvenes y adultos) y 99 (Aceleración) y su nivel educativo | 45 de 1.306 en Juan; 1.411 filas en todo el archivo |
| B2 | Jornada `COMPLETA` (y jornadas sin horario: `JornadaOperativa` exige `hora_inicio`/`hora_fin`) | Colegios privados del archivo, no Juan |
| B3 | Tipos de documento `VISA` (41), `NUIP` (1), `NIP` (1) | Pocos, pero hoy fallarían |
| B4 | Acudiente (no viene en el archivo) | Portal, citaciones, autorización de datos sensibles |
| B5 | Capacidad (cupo) del grupo | Un grupo nuevo exige `max_capacity ≥ 1` |

**Empobrecen (se pueden importar sin ellos, pero se pierde información que SIMAT sí tiene):**

| # | Campo nuevo sugerido | Dónde |
|---|---|---|
| E1 | `simat_per_id`, `simat_nui` | `StudentProfile` — llave estable de cruce y de retorno a SIMAT |
| E2 | `sisben_grupo` (A1…D21; «NO APLICA» = vacío) | `StudentProfile` |
| E3 | `pais_origen`, `pais_nacimiento`, `nacionalidad_2` | `StudentProfile` |
| E4 | `etnia_detalle` (valor SIMAT literal: pueblo, Negritudes) | `StudentProfile`, junto al `grupo_etnico` normalizado |
| E5 | `correo_contacto` (no único) | `StudentProfile` |
| E6 | `codigo_simat` del grupo, `modelo_educativo` | `Group` |
| E7 | Origen de la matrícula (`IMPORTACION_SIMAT`) y `lote_id`; fecha de matrícula en SIMAT | `Enrollment` |
| E8 | `apoyo_academico_especial` | `StudentProfile` (o dentro de M16) |

Principio YAGNI (CLAUDE.md §5): proponer solo E1, E2, E4, E5, E6 y E7 en la primera entrega. E3 y E8 cuando un reporte los
pida; sin embargo E3 conviene por el volumen de población migrante.

---

## 5. Validaciones y reglas de normalización

### 5.1 Del archivo (antes de leer una sola fila)

- **Formato:** solo `.xlsx`, `.csv`, `.txt`. Validar extensión en el navegador y **firma de bytes en el servidor**: `.xlsx` =
  ZIP (`PK\x03\x04`); `.xls` antiguo (firma OLE `D0CF11E0`) → mensaje «guárdalo como .xlsx»; CSV/TXT sin bytes nulos y
  decodificables (UTF-8 → Windows-1252, como ya hace `decodificarCsv`).
- **TXT:** `leerCsv` solo detecta `,` y `;`. SIMAT exporta TXT con un delimitador que **no he podido verificar** (¿`|`?,
  ¿tabulador?). Hay que ampliar la detección una vez se tenga la muestra.
- **Tamaño:** el estándar actual es 2 MB / 1.000 filas y carga el libro completo en memoria. Este archivo pesa 9,3 MB y tiene
  23.599 filas (lo leí en streaming sin problema). Un colegio grande puede pasar de 1.000 filas. Propongo **lectura en
  streaming**, tope por filas y por bytes propios de este proceso, y ajustar `nginx.conf` y multer a ese tope.
- **Encabezados:** por nombre normalizado (`normalizarEncabezado`), con alias; obligatorias mínimas: `DANE`,
  `CODIGO_DANE_SEDE`, `ANO`, `ESTADO`, `JORNADA`, `GRADO_COD`, `GRUPO`, `DOC`, `TIPODOC`, `APELLIDO1`, `NOMBRE1`,
  `FECHA_NACIMIENTO`. Las demás son opcionales: si faltan, se avisa qué no se podrá sincronizar.
- **Fórmulas** rechazadas (convención del proyecto). **Hoja:** usar `Hoja1`; si no existe, la que tenga las columnas.
- **Idempotencia:** guardar solo la huella SHA-256 (`LoteImportacion`). Subir el mismo archivo otra vez se avisa, no se
  bloquea (SIMAT se re-exporta durante el año con cambios).

### 5.2 Institución, sede y año (los códigos DANE que pidió)

| Regla | Severidad |
|---|---|
| `DANE` de al menos una fila = `Institution.codigo_dane` (12 dígitos numéricos) | **Bloqueante** si ninguna fila coincide |
| Filas de otro DANE: descartar sin guardar ni registrar sus datos; informar solo el conteo | Informativo |
| `CODIGO_DANE_SEDE` (12 dígitos) existe en `Campus` de la institución | **Bloqueante por sede**: listar las que faltan (código, nombre y cuántos estudiantes) |
| Sede inactiva en Klassy | Bloqueante por sede |
| `CONSECUTIVO[0..12]` = `DANE` institución | Aviso (coherencia interna del archivo) |
| Posiciones 2–6 del DANE = código DIVIPOLA del municipio (Yumbo `76892`) y coherentes con `ETC` | Aviso |
| `ANO` = año de un `AcademicYear` no CERRADO | **Bloqueante** |
| Secretaría solo importa filas de **sus** sedes (`sedes_ids`); el resto se descarta con aviso | Regla de alcance |

Las sedes **no se crean solas**: `Campus.direccion` es obligatoria y el archivo no la trae. La pantalla debe decir «crea la sede
X en Sedes y jornadas y vuelve a simular».

### 5.3 Jornada, grado y grupo

- **Jornada:** `MAÑANA→MANANA`, `ÚNICA→UNICA`, `TARDE`, `NOCTURNA`, `FIN DE SEMANA→SABATINA` (y revisar el domingo).
  Debe existir `JornadaOperativa` de esa sede. No se crea sola (exige horas). `COMPLETA` → decisión (¿equivale a ÚNICA?).
- **Grado:** `−2…11` → `Grade.numero`. Debe estar **activo** en el catálogo. `21–26` y `99` → fuera de alcance v1 (B1).
- **Coherencia grado ↔ grupo:** en Juan, para todos los matriculados de grado < 21, el prefijo del grupo coincide con el grado.
  En el archivo completo hay 166 incoherentes (p. ej. grado 6 en grupo `502`): aviso por fila, no se matricula en silencio.
- **Grupo:** el código SIMAT es numérico (`602`) o textual (`JRD`, `PJR3`, `J01`). Klassy usa `nomenclatura` libre en mayúsculas,
  única por año+sede+jornada+grado. La **identidad del grupo** en la importación es
  `(sede, jornada, grado, código SIMAT)`, no el nombre que el colegio use. Por eso proponemos guardar `codigo_simat` en
  el grupo (E6): si el colegio lo renombra a «6-A», la próxima importación lo sigue encontrando. Dos sedes de Juan repiten
  códigos (`601` existe en ambas): la sede es parte de la llave.
- **Si el grupo no existe en Klassy:** la simulación lista los grupos a crear, con cupo propuesto = `max(estudiantes del
  archivo, cupo por defecto configurable)`; se crean solo al confirmar. En Juan serían hasta 46. Un grupo existente **nunca**
  se modifica (cupo, aula, director).
- **Cupo:** SIMAT es la verdad oficial. Si el grupo existente se llena, es 409 «sin cupo» por fila (solo ADMIN puede forzar
  sobrecupo, ya existe esa regla en `createEnrollment`).

### 5.4 Persona

- **Documento:** texto, solo dígitos salvo NES (`N…`), sin ceros perdidos (hay un caso con cero inicial). Sin espacios ni `.0`.
  Largo razonable por tipo (PPT de 7 dígitos es normal; RC/TI de 10 también).
- **Nombres:** cuatro partes, mayúsculas, quitar espacios sobrantes (27 filas de Juan los traen), conservar tildes. El
  nombre completo **no** se parte por adivinación (regla M03/SIMAT).
- **Fecha de nacimiento:** serial de Excel o texto `AAAA-MM-DD`/`DD/MM/AAAA`; no futura; edad plausible para el grado (avisar,
  no bloquear: 9 matriculados de Juan tienen 19+ años en grados regulares, probablemente legítimo).
- **Estrato, SISBEN, EPS, RH, etnia:** normalizar a valores de Klassy con una tabla de equivalencias (§3) y **avisar** los
  valores desconocidos en vez de descartarlos en silencio.
- **Teléfono:** extraer los números válidos (celular de 10 dígitos que empieza por 3, o fijo de 7 o 10), guardar el primero
  como `telefono`; los demás no tienen dónde ir (ver B4). Descartar `0`.
- **Duplicados dentro del archivo:** mismo `DOC`, mismo `PER_ID`/`NUI`, o mismo nombre+nacimiento con distinto documento
  → error de fila (en el archivo completo hay 0, pero un export de colegio puede traerlos).

### 5.5 Cruce con lo que ya existe en Klassy (quién es antiguo y quién nuevo)

Orden de búsqueda propuesto:

1. `simat_per_id` / `simat_nui` (cuando ya se haya importado antes).
2. `numero_documento` (único por `User`).
3. **Solo para advertir**, nunca para fusionar: mismo nombre completo + fecha de nacimiento con distinto documento.

Casos que el diseño debe resolver y que no son obvios:

- **Cambio de tipo de documento** (RC→TI, TI→CC). A veces el número cambia; si solo se cruza por número se crea un
  **estudiante duplicado** con historial roto. Es la razón de guardar `PER_ID`/`NUI` y de la advertencia por nombre+fecha.
- **El documento ya existe pero como otro rol** (docente, acudiente): `User.numero_documento` es único y `ESTUDIANTE` no se
  combina con otros roles → error de fila con mensaje claro.
- **El documento ya existe como estudiante `RETIRADO`/`INACTIVO`/`GRADUADO`:** hoy el reingreso es una decisión explícita
  (`reingreso: true`, auditada). Una carga masiva no debería reincorporar a nadie en silencio.
- **Correo ya registrado** por otro usuario: por eso no se escribe `User.email` desde SIMAT.

### 5.6 Discapacidad y apoyos (M16)

Los 10 valores de `DISCAPACIDAD` calzan con las condiciones PIAR ya sembradas en `CondicionApoyo`:

| SIMAT | Código SIMAT | Condición Klassy |
|---|---|---|
| VISUAL – BAJA VISIÓN IRREVERSIBLE | 3 | `VISUAL_BAJA_VISION` |
| VISUAL – CEGUERA | 4 | `VISUAL_CEGUERA` |
| TRASTORNO DEL ESPECTRO AUTISTA | 7 | `TEA` |
| DISCAPACIDAD INTELECTUAL | 8 | `INTELECTUAL` |
| DISCAPACIDAD MÚLTIPLE | 10 | `MULTIPLE` |
| AUDITIVA – LENGUA DE SEÑAS | 12 | `AUDITIVA_SORDERA` |
| AUDITIVA – CASTELLANO | 13 | `AUDITIVA_HIPOACUSIA` |
| SORDOCEGUERA | 14 | `SORDOCEGUERA` |
| DISCAPACIDAD FÍSICA | 15 | `FISICA` |
| DISCAPACIDAD PSICOSOCIAL | 18 | `PSICOSOCIAL` |

(Los nombres deben contrastarse con el anexo técnico vigente del MEN, como ya advierte M16.) Para `TRA_ESP_APR_ESCOLAR`
(TDAH, trastornos de aprendizaje) el calce es impreciso (Klassy distingue inatento/hiperactivo/mixto): usar `OTRA` y que
orientación valore.

**Regla M16 que se debe respetar:** lo declarado se **transcribe**, no se diagnostica. La importación crea la
`SolicitudApoyo` con origen `MATRICULA` (el mecanismo ya existe: `apoyo_declarado` / `apoyoRegistradoEnPerfil`) y marca
`tiene_discapacidad`; **no** abre expediente PIAR ni guarda la categoría en la hoja de vida. Solo si ese año el estudiante no
tiene ya una solicitud ni un expediente.

### 5.7 Datos sensibles (Ley 1581 de 2012, arts. 5–7; Ley 1098)

- **SRPA:** no se lee, no se guarda, no se registra.
- **EPS/RH:** el modelo exige `autorizacion_datos_sensibles.otorgada` (que lo otorga el acudiente). La carga masiva no tiene
  acudiente. Opciones en §9, decisión D5.
- **Auditoría sin contenido:** el `detalle` nunca lleva valores de salud, solo nombres de campo y conteos.
- **Retención del archivo:** el archivo subido se procesa en memoria/disco temporal y se borra; se conserva solo la huella.
  Las filas de otras instituciones no se escriben en ningún sitio, ni en el informe.

---

## 6. Algoritmo de conciliación

### 6.1 Por estudiante (clasificación)

```
fila de MI institución
 ├─ estado SIMAT ≠ MATRICULADO ........................ ver 6.2
 ├─ grado/jornada/sede/grupo no resolubles ............ OMITIDA (motivo) 
 ├─ documento no existe en Klassy ..................... NUEVO
 │     crear User + StudentProfile (+ solicitud M16) → crear matrícula (CONDICIONAL, checklist pendiente)
 └─ documento existe
       ├─ rol distinto de ESTUDIANTE .................. ERROR de fila
       ├─ perfil RETIRADO/INACTIVO/GRADUADO ........... REINGRESO → requiere confirmación (D6)
       └─ estudiante activo ........................... ANTIGUO
             1) datos: comparar campos sincronizables; si algo difiere → actualizar; si nada → no tocar
             2) matrícula del año:
                  · no tiene ......................... crear (ANTIGUO / REPITENTE según M19)
                  · PREINSCRITO ....................... formalizar (misma lógica que formalizarMatriculaPreinscrita)
                  · viva en el mismo grupo ............ CONFIRMADA, no hace nada
                  · viva en OTRO grupo ................ CONFLICTO (D7)
                  · RETIRADA este año ................. CONFLICTO
```

### 6.2 Estado SIMAT → acción

| Estado | En Juan | Propuesta |
|---|---|---|
| MATRICULADO | 1.306 | Procesar (6.1) |
| RETIRADO | 54 | **No crear nada.** Si Klassy tiene matrícula viva de ese estudiante → conflicto informado. No se retira solo: `FECHAFIN` viene siempre vacía y una salida exige fecha efectiva |
| SIN CONTINUIDAD | 0 | Informativo (posible deserción; útil para el panel de rectoría) |
| ASIGNADO POR CONTINUIDAD / ASIGNADO | 0 | Omitir y reportar (cupo asignado, no matrícula confirmada). Opcional: PREINSCRITO |
| NUEVO / INSCRITO | 0 | Omitir (sin institución) |
| REPROBADO / GRADUADO | 0 | Informativo |

### 6.3 «Actualización silenciosa»

«Silenciosa» = sin pedir confirmación fila por fila, **no** sin dejar rastro. Reglas propuestas:

1. **Solo campos de una lista blanca:** `telefono`, `barrio_vereda`, `eps`, `rh`, `estrato`, `sisben_grupo`, `grupo_etnico` /
   `etnia_detalle`, `pais_*`, `correo_contacto`, `simat_per_id/nui`, `tiene_discapacidad`.
2. **Un valor vacío o «NO APLICA» de SIMAT nunca borra** un dato que Klassy ya tiene.
3. **Identidad (nombres, apellidos, fecha de nacimiento, género, tipo y número de documento) no se sobrescribe sola.** Una
   diferencia ahí puede ser corrección o error, y afecta diplomas y certificados: va a la lista «Diferencias de identidad»
   para que Secretaría decida con un clic. (Esto matiza lo pedido; recomiendo mantenerlo.)
4. **Comparar normalizado** (mayúsculas, espacios, tildes) y **no llamar `save()` si no cambia nada**, para no mover
   `updatedAt` ni ensuciar la auditoría.
5. **Rastro:** el informe del lote lista, por estudiante, qué *campos* cambiaron (sin valores de salud); la auditoría guarda un
   evento del lote (`IMPORTACION_SIMAT_APLICADA`) con conteos.
6. El **grado nunca se sincroniza** («no debería diferir»): si difiere de lo que M19 decidió para ese estudiante es una
   discrepancia que se informa (D7), no un dato que se pisa.

### 6.4 Matrícula y folio

- Se reutiliza `createEnrollment` / `formalizarMatriculaPreinscrita` (cupo atómico, folio sin huecos, checklist, trayectoria,
  portal del acudiente, solicitud M16). **No se escribe `Enrollment` a mano.**
- **El Libro de Matrícula es el riesgo:** importar 1.300 estudiantes consume 1.300 folios de golpe. Antes de aplicar, la
  foliatura debe estar **confirmada** (hoy nace `confirmada: false` con valores de partida): si no, el resultado puede ser un
  libro que no coincide con el físico. Bloquear la aplicación (no la simulación) mientras no se confirme.
- **Orden de los folios:** el de `FECHAINI` de SIMAT (así el libro respeta el orden real de matrícula) y, a igual fecha,
  por grado, grupo y apellido. Es determinista para poder reintentar.
- **Fecha de matrícula:** hoy `createEnrollment` usa `new Date()`. Se necesita un parámetro opcional aditivo
  `fecha_matricula` (D8): ¿la de SIMAT (dic-2025) o la del día de la importación? Con la de SIMAT el folio queda fuera de orden
  cronológico respecto a otras matrículas ya asentadas.
- **Estado inicial:** estudiante nuevo → `MATRICULADO_CONDICIONAL` con plazo de compromiso configurable (el script
  `matricular:estudiantes` ya usa `--dias-compromiso=30`). Antiguo con paz y salvo confirmado → definitiva sin acta (regla
  que M04 ya aplica). «Secretaría solo añade documentos» se cumple: el checklist queda pendiente de archivos.
- **Tipo de ingreso:** NUEVO si no existía; ANTIGUO si existía y estudió aquí el año previo; REPITENTE si el cierre M19 del
  año previo fue NO_PROMOVIDO en ese grado. TRASLADO no se puede inferir del archivo.
- **Estudiante nuevo = dos transacciones** (`crearEstudianteCompleto` y luego `createEnrollment`). Si la segunda falla queda un
  estudiante sin matrícula. Es aceptable porque la reejecución es idempotente y se reporta como «estudiante creado,
  matrícula pendiente»; unificarlas exige que ambos servicios acepten una sesión externa.
- **Credenciales:** los estudiantes nuevos nacen con contraseña = documento y cambio obligatorio (patrón existente). Con
  cientos de cuentas de menores creadas de golpe conviene decidirlo conscientemente (D10).

### 6.5 Ejecución

Es un trabajo largo (miles de transacciones, y cada `User` nuevo hace un `bcrypt` con 12 rondas). No debe vivir en una
petición HTTP (nginx y el navegador cortan). Propongo **simular → confirmar → ejecutar en segundo plano** con progreso, como
la cola de entrenamiento del módulo predictivo y la cola de correo (reclamo atómico, reanudable). El informe final se baja
como Excel con una fila por registro del archivo: resultado, motivo, campos actualizados.

**Todo o nada no sirve aquí.** El patrón de las faltas del manual («una fila con error y no se guarda nada») es inviable con
1.300 filas de datos sucios. Propongo dos niveles: los errores **estructurales** (institución, sede, año, columnas, libro sin
confirmar) bloquean todo el lote; los errores **de fila** excluyen esa fila y se informan, y Secretaría confirma «importar las N
válidas». La reejecución con el mismo archivo es idempotente y recoge lo que quedó pendiente.

---

## 7. Procesos que probablemente no está contemplando

1. **Acudiente.** (B4) Hace falta un camino para completarlo: bandeja «Estudiantes sin acudiente» y/o carga complementaria
   (CSV `documento_estudiante, datos del acudiente`), apoyada en que el teléfono de SIMAT probablemente es del acudiente.
   Sin esto el portal M27 queda vacío para todos los importados.
2. **Autorización de datos sensibles.** (D5) Decidir cómo consta.
3. **Conciliación en las dos direcciones.** Hoy solo se pensó SIMAT → Klassy. Falta el reporte inverso: estudiantes que
   Klassy tiene matriculados y **no están** en SIMAT (admitidos directamente en Klassy). Un estudiante que estudia y no está
   en SIMAT no cuenta para el giro de recursos. Es el control más valioso para el rector.
4. **Re-importaciones durante el año.** SIMAT cambia (nuevos, retiros, traslados). La importación debe ser repetible: ya
   existe (idempotente) pero falta decidir qué hace con los **retiros** (sin fecha efectiva en el archivo) y con los cambios de
   grupo (`cambiarGrupo` conserva folio y checklist; nunca se crea otra matrícula, regla de M04).
5. **Grados y modelos educativos no tradicionales** (ciclos nocturnos, Aceleración, Escuela Nueva, Extraedad). Toca M06
   (planes de estudio), M19 (promoción al «grado siguiente»), M33 (códigos SIMAT de salida) y `ubicacionEstudiante`. Es un
   cambio de modelo de negocio: confirmar antes de tocarlo.
6. **Plan de estudios y carga docente de los grupos nuevos.** Un grupo creado por la importación no tiene plan efectivo
   garantizado, ni docentes (M08), ni horario (M09). La importación no los crea; el informe debe listar «grupos creados sin
   carga académica».
7. **Año lectivo en PLANIFICACIÓN vs EN_CURSO.** Importar matrículas en un año todavía no activado es el caso normal de
   diciembre/enero; verificar que M05 lo permite y que la ventana de prematrícula/rematrícula no choca (si ya hay
   `PREINSCRITO` por rollover M19, se formaliza, no se duplica).
8. **Cierre de promoción previo.** Para decidir ANTIGUO vs REPITENTE y detectar discrepancias de grado, M19 del año anterior
   debe estar cerrado. Si no lo está, solo se puede avisar.
9. **Desfase del corte.** El archivo es del 20-abr-2026 y hoy es 26-oct-2026: cualquier importación con un archivo viejo puede
   resucitar retirados. Mostrar la `FECHAINI` más reciente del archivo y exigir confirmación si es muy anterior.
10. **Deshacer.** Una matrícula con folio no se borra (asiento del Libro). El «deshacer lote» real es anular con motivo, no
    eliminar. Por eso la simulación y el informe previo son el control principal.
11. **Permisos y alcance por sede.** ADMIN y SECRETARIA (esta solo de sus sedes); COORDINADOR solo consulta resultados.
12. **Proceso inverso (Klassy → SIMAT).** Ya existe «Cierre para SIMAT» (M33) pero solo exporta 8 columnas de
    cierre. Si el colegio empieza a depender de SIMAT como fuente, tarde o temprano pedirá lo contrario para matrículas
    nuevas. No es parte de este trabajo, pero conviene saberlo.
13. **Calidad del barrio / EPS.** El mismo barrio aparece escrito de tres maneras; no hay catálogo. Fuera de alcance, pero
    explica por qué la «sincronización» de barrio genera ruido: una diferencia de ortografía contará como cambio.

---

## 8. Hallazgos de calidad medidos en Juan XXIII

| Hallazgo | Cantidad (de 1.306 matriculados, salvo indicación) |
|---|---|
| Grados sin catálogo en Klassy (23, 24, 25, 99) | 45 |
| Estrato «0» / «NO APLICA» | 25 / 71 |
| Etnia que pierde detalle (NEGRITUDES 33 + 7 de pueblos indígenas) | 40 |
| Con EPS / con tipo de sangre | 920 / 1.134 |
| Con discapacidad / trastorno de aprendizaje / apoyo especial | 28 / 24 / 2 |
| Sin teléfono | 147 |
| Teléfono con varios números en el mismo campo (sobre 1.360 filas) | 152 |
| Estudiantes que comparten correo con otro | 40 (19 correos) |
| Filas con espacios sobrantes en textos | 27 (de 1.360) |
| Mayores de 19 años en grados regulares | 9 |
| `PPT` con codificación dañada (en todo el archivo) | 895 filas |
| Grado ≠ prefijo del grupo (en todo el archivo, grado < 21) | 166 |
| Grupos distintos que habría que mapear o crear | 46 (3–43 estudiantes) |

Con las reglas propuestas, Juan XXIII quedaría aproximadamente: **~1.261 importables** (1.306 − 45 de grados no soportados),
54 retirados informados, y avisos de datos. Esas cifras son una estimación de la lógica, no el resultado de una ejecución.

---

## 9. Decisiones que necesito de usted

Con mi recomendación por defecto.

| # | Decisión | Recomendación |
|---|---|---|
| D1 | **Grados 21–26 y 99** (ciclos nocturnos, Aceleración). ¿Se soportan ya? | v1: **no**; esas filas quedan «omitidas: grado no soportado». v2: modelo propio (afecta M06, M19, M33) |
| D2 | **Grupos inexistentes:** ¿la importación los crea? | Sí, **solo al confirmar**, con cupo propuesto editable; nunca modifica uno existente |
| D3 | **Nomenclatura:** usar el código SIMAT tal cual (`601`) o convertirlo (`A`, `B`) | Guardar `codigo_simat` en el grupo y usar el código SIMAT como nomenclatura inicial; el colegio puede renombrar sin romper el cruce |
| D4 | **Acudiente:** ¿carga complementaria y/o bandeja de pendientes? | Ambas, en la fase 5 |
| D5 | **EPS/RH sin autorización del acudiente** | Casilla obligatoria por lote «el colegio cuenta con la autorización de las familias» que queda auditada y fija `autorizacion_datos_sensibles` con origen `IMPORTACION_SIMAT`. Validar con la política de datos del colegio. Alternativa más conservadora: no importar EPS/RH hasta tener acudiente |
| D6 | **Reingreso de retirados** que SIMAT muestra matriculados | No automático: lista de confirmación con una opción de «reincorporar todos» auditada |
| D7 | **Discrepancia de grupo/grado** (Klassy dice 8-A, SIMAT 9-A) | No matricular a ciegas: lista de decisión con «aceptar SIMAT» (usa `cambiarGrupo` o `motivo_grado` automático) |
| D8 | **Fecha de matrícula y orden de folios** | `FECHAINI` de SIMAT para ordenar; `fecha_matricula` = fecha de SIMAT, y se guarda además la fecha de importación |
| D9 | **Rechazo por fila vs todo o nada** | Errores estructurales bloquean; los de fila se excluyen y se informan |
| D10 | **Contraseña inicial de cuentas nuevas de menores** | Mantener el patrón (documento + cambio obligatorio) salvo que prefiera otro mecanismo |
| D11 | **Identidad (nombre, fecha de nacimiento)** | Nunca sobrescribir sola; lista de diferencias |
| D12 | **Estados ASIGNADO/NUEVO/INSCRITO** | Omitir y reportar en v1 |

---

## 10. Diseño propuesto

### Backend (código nuevo en español, CLAUDE.md §1)

- `backend/src/constants/importacionSimat.ts`: columnas esperadas con alias, equivalencias (jornada, tipo de documento,
  discapacidad, etnia), límites.
- `backend/src/utils/importacionSimat.ts` — **funciones puras con pruebas**: normalizadores (documento, teléfono, fecha serial,
  estrato, sangre, etnia), `clasificarFila`, `diferenciasDePerfil`, `ordenarParaFolio`.
- `backend/src/services/importacionSimat.service.ts`: lectura en streaming, `simular(archivo, año, usuario)` (devuelve el
  plan sin escribir), `aplicar(loteId, contraseña)`; reutiliza `crearEstudianteCompleto`, `createEnrollment`,
  `formalizarMatriculaPreinscrita`, `cambiarGrupo`, `crearDesdeMatricula`.
- Modelo `ImportacionSimat` (lote: estado SIMULADO→APLICANDO→APLICADO/CON_PENDIENTES, conteos, progreso, plan resumido,
  huella). Se puede extender `LoteImportacion` (`proceso: 'simat'`) en vez de crear otra colección.
- Rutas bajo `/enrollments/importacion-simat` (ADMIN, SECRETARIA): `POST /simular` (multipart), `POST /:id/aplicar`
  (con contraseña del usuario, como el rollover), `GET /:id` (progreso), `GET /:id/informe` (Excel).
- Cambios mínimos en otros módulos, todos **aditivos**: `StudentProfile` (E1, E2, E4, E5), `Group.codigo_simat` (E6),
  `Enrollment.origen` y `lote_id` (E7), parámetro opcional `fecha_matricula` en `createEnrollment`, y un catálogo de
  equivalencias (no tocar `TIPOS_DOCUMENTO` hasta decidir B3).
- Auditoría: `IMPORTACION_SIMAT_SIMULADA`, `IMPORTACION_SIMAT_APLICADA`, `ESTUDIANTE_ACTUALIZADO_POR_SIMAT` (por lote),
  sin contenido sensible.

### Frontend

Pestaña «Importar desde SIMAT» en `EnrollmentsPage` (`/admin/enrollments?pestana=simat`) con `Stepper`: 1) año y archivo
(`Dropzone`: `.xlsx/.csv/.txt`), 2) informe de simulación (tarjetas: nuevos, antiguos con cambios, sin cambios, para
matricular, omitidos, conflictos, errores; filtros con `FiltrosRapidos`; tabla paginada; botón «Descargar informe»), 3)
confirmación (contraseña, casilla de autorización D5), 4) progreso y resultado. Hook `useImportacionSimat.ts` con TanStack
Query. Sin tokens ni variantes nuevas. Se agrega a `PALABRAS_CLAVE_POR_RUTA` del asistente.

### Pruebas

Funciones puras con casos sintéticos; integración con base real (patrón `tests/integracion/`). **No usar el archivo real como
fixture:** contiene documentos y datos de salud de menores de 46 colegios; se generará un archivo sintético con los mismos
defectos (documento numérico/texto, PPT corrupto, teléfonos múltiples, estrato 0, grado 99, jornada COMPLETA, DANE ajeno,
sede sin registrar).

---

## 11. Plan por fases

| Fase | Entrega | Depende de |
|---|---|---|
| 0 | Decisiones D1–D12 y **muestra real** del export de un colegio (xlsx, csv y txt) | Usted |
| 1 | Lector en streaming, normalizadores y validaciones (§5) + **simulación** con informe descargable. No escribe nada | Fase 0 |
| 2 | Campos nuevos (E1–E7) y sincronización silenciosa de antiguos; diferencias de identidad | Fase 1 |
| 3 | Grupos (mapeo y creación propuesta) y matrícula con folios ordenados | Fase 2; foliatura confirmada |
| 4 | Ejecución en segundo plano, progreso, reanudación, auditoría | Fase 3 |
| 5 | Bandejas: sin acudiente, conflictos, «en Klassy y no en SIMAT» | Fase 4 |
| 6 (opcional) | Ciclos nocturnos y Aceleración | D1 |

La simulación (fase 1) ya entrega valor por sí sola: le dice al rector qué hay antes de tocar nada.

---

## 12. Riesgos

| Riesgo | Mitigación |
|---|---|
| Export real de un colegio distinto del archivo de la ETC | Leer por nombre de columna con alias; pedir muestra (fase 0) |
| Duplicar estudiantes por cambio de tipo de documento | `PER_ID`/`NUI` + advertencia nombre+nacimiento |
| Folios fuera de orden / consumo del Libro | Foliatura confirmada, orden por `FECHAINI`, simulación obligatoria |
| Resucitar retirados con un archivo viejo | Mostrar fecha del corte; reingreso con confirmación |
| Datos de salud sin autorización | D5, auditoría, nunca registrar valores |
| Fuga de datos de menores | No guardar filas ajenas; no versionar el archivo; huella en vez de archivo |
| Lote parcial por fallo a mitad | Idempotencia y reanudación; matrícula por transacción propia |
| `bcrypt` con miles de cuentas bloquea el servidor | Ejecución en segundo plano, lotes pequeños |
| Cambio de modelo (grados/ciclos) arrastra otros módulos | Fuera de v1, confirmar (D1) |

---

## 13. Acciones inmediatas sugeridas (independientes del desarrollo)

1. Agregar el archivo a `.gitignore` (p. ej. `doc/*Simat*`) o sacarlo de `doc/`. Está sin trackear y sin ignorar.
2. Conseguir un export real de **un colegio** en `.xlsx`, `.csv` y `.txt`.
3. Resolver D1–D12, en especial D1, D4 y D5.
4. Confirmar la foliatura del colegio piloto antes de la primera importación real.
