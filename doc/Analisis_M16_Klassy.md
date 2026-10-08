# Análisis M16: PIAR, Orientación Escolar y Apoyo a la Inclusión Educativa

**Estado:** Análisis previo a la programación y especificación técnica integral.  
**Módulo:** M16 — PIAR (Plan Individual de Ajustes Razonables), Orientación y Apoyo.  
**Sistema:** Klassy — Gestor Académico y Administrativo Institucional.  
**Fuentes y antecedentes revisados:**
- `CLAUDE.md` (reglas transversales del proyecto, jerarquía de roles, alcance estricto por módulo, regla de oro de datos).
- `doc/Idea_Klassy_Gestor_Academico_Administrativo_v2.docx` (especificación de requerimientos de Klassy).
- `doc/Analisis_M14_M15_Klassy.md` (precedente de arquitectura, convivencia, remisiones a orientación y trazabilidad).
- Código fuente existente: `StudentProfile`, `User`, `AcademicYear`, `RemisionOrientacion`, `TeacherAssignment`, `Subject`, `StudyPlan`, `ReferenteCurricular`, `AuditLog`.

---

## 0. Resumen Ejecutivo

1. **Definición de M16 en Klassy:**  
   El Módulo 16 es el núcleo del sistema para la **educación inclusiva y el bienestar psicosocial**. Consta de dos componentes complementarios pero con niveles de confidencialidad y ciclos de vida bien diferenciados:
   - **Componente A — Gestión Integral del PIAR (Decreto 1421 de 2017 / Decreto 1075 de 2015):** Caracterización pedagógica y de entorno (Anexo 1 MEN), Ajustes Razonables por área/asignatura bajo enfoque DUA (Anexo 2 MEN), Acta de Acuerdo y Corresponsabilidad con familias (Anexo 3 MEN), y el Informe Anual de Proceso Pedagógico.
   - **Componente B — Orientación Escolar y Acompañamiento Psicosocial:** Gestión confidencial de remisiones (originadas en convivencia M15 o abiertas directamente en orientación), registro de atenciones psicosociales individuales, canalización externa y articulación de redes de apoyo.

2. **Principio fundamental de autoría (El PIAR no lo hace solo Orientación):**  
   Una creencia errónea común en el software educativo es pensar que el Orientador llena todo el PIAR. El Decreto 1421 de 2017 establece de forma taxativa que el PIAR es una **herramienta de planeación pedagógica construida por los docentes de aula**, liderada y articulada con el **docente de apoyo pedagógico / orientador escolar**, el directivo docente y la familia. En Klassy, cada docente de asignatura formula y hace seguimiento a los ajustes curriculares de su materia, mientras que Orientación lidera la caracterización general, asesora el DUA y coordina las firmas y seguimientos.

3. **Confidencialidad y Privacidad Estricta (Ley 1581 de 2012 / Ley 1098 de 2006):**  
   Los diagnósticos clínicos, historias médicas, valoraciones psiquiátricas y circunstancias de extrema vulnerabilidad son **datos sensibles de menores de edad**. Klassy debe aplicar el **principio de minimización de datos**:
   - Los **Docentes de Aula** tienen acceso a la caracterización pedagógica (estilos de aprendizaje, barreras, fortalezas, ajustes metodológicos y evaluativos necesarios), pero **no acceden al expediente médico ni a las notas confidenciales de sesiones de psicología**.
   - El **Orientador** y el **Admin** gestionan el expediente integral con trazabilidad de accesos (auditoría obligatoria de lectura y modificación).
   - **Secretaría no tiene acceso** a expedientes PIAR ni notas de orientación (mantiene únicamente las banderas censales requeridas por el SIMAT).

4. **Articulación Orgánica con el Ecosistema Klassy:**  
   - **M03 (Estudiantes):** Consume las banderas de caracterización censal de `StudentProfile` (`tiene_discapacidad`, `tiene_talento_excepcional`, categorías SIMAT) y alimenta la pestaña "Observador y Bienestar".
   - **M05 (Año Lectivo y Periodos):** Los PIAR son anuales y se evalúan periódicamente según el calendario académico institucional. Un año cerrado deja los PIAR en modo histórico de solo lectura.
   - **M06 y M07 (Plan de Estudios y Referentes Curriculares):** Los ajustes razonables se asocian a las asignaturas del plan de estudios y pueden vincularse a los Derechos Básicos de Aprendizaje (DBA) y estándares para definir flexibilizaciones curriculares formales.
   - **M08 (Asignación Docente):** Un docente solo puede crear, editar y valorar ajustes en los grupos y asignaturas que tiene asignados formalmente en `TeacherAssignment`.
   - **M12 (Evaluación y SIEE):** Los ajustes evaluativos del PIAR proporcionan los criterios de evaluación formativa diferenciada para evitar la reprobación por barreras no atendidas.
   - **M15 (Convivencia Escolar):** Conexión con la colección `RemisionOrientacion`, permitiendo que Orientación atienda situaciones derivadas de comités y casos de convivencia en un entorno aislado y seguro.

---

## 1. Marco Normativo Colombiano y Documentos Oficiales

El desarrollo del Módulo 16 está estrictamente reglado por el marco legal de la República de Colombia y las directrices técnicas del Ministerio de Educación Nacional (MEN). No es un módulo de diseño arbitrario; cada campo y flujo responde a mandatos de ley.

### 1.1 Normativa Legal Vigente

| Norma | Jerarquía | Disposiciones Clave aplicables al Módulo 16 |
|---|---|---|
| **Constitución Política de Colombia (1991)** | Norma de normas | **Art. 13:** Igualdad real y efectiva; medidas afirmativas para personas en debilidad manifiesta.<br>**Art. 44:** Derechos fundamentales de los niños con carácter prevalente.<br>**Art. 47:** Obligación estatal de proveer atención especializada, rehabilitación e integración social.<br>**Art. 67:** La educación como derecho fundamental y servicio público. |
| **Ley Estatutaria 1618 de 2013** | Ley Estatutaria | **Art. 11 (Derecho a la educación inclusiva):** Prohíbe la exclusión de personas con discapacidad del sistema educativo regular. Obliga a garantizar ajustes razonables, docentes de apoyo pedagógico, accesibilidad física y tecnológica, y diseño de materiales pedagógicos accesibles. |
| **Ley 115 de 1994** (Ley General de Educación) | Ley Ordinaria | **Título III, Cap. 1 (Arts. 46 a 49):** La educación de personas con limitaciones físicas, sensoriales, psíquicas o capacidades excepcionales es parte integral del servicio educativo. Dispone la integración en aulas regulares y apoyos especializados. |
| **Decreto 1421 de 2017** (Compilado en el **Decreto 1075 de 2015**, Título 3, Cap. 5, Secc. 2) | Decreto Reglamentario Único | **La norma central de inclusión en Colombia.**<br>- Art. 2.3.3.5.1.4: Define *Educación Inclusiva*, *DUA*, *Ajustes Razonables*, *PIAR*, *Informe Anual de Competencias* y *Acta de Acuerdo*.<br>- Art. 2.3.3.5.2.3: Responsabilidades de las Instituciones Educativas.<br>- Plazos: Elaboración durante el **primer trimestre del año escolar** (o 30 días posteriores a matrícula extemporánea). Actualización periódica y balance anual.<br>- Prohíbe pruebas de admisión excluyentes y cobros adicionales. |
| **Decreto 1290 de 2009** (Compilado en DUR 1075/2015) | Decreto Reglamentario | Regula la evaluación y promoción de los estudiantes en educación básica y media. Exige articulación del SIEE con los ajustes razonables del PIAR, evaluando avances individuales y prohibiendo la reprobación fundada en la falta de ajustes del colegio. |
| **Ley 1098 de 2006** (Código de la Infancia y la Adolescencia) | Ley Especial | Art. 36 (Derechos de los niños con discapacidad); Art. 18 (Protección a la integridad); Principio del Interés Superior del Niño. Prioridad absoluta en la atención y protección frente a discriminación o negligencia. |
| **Ley 1581 de 2012 y Decreto 1377 de 2013** | Protección de Datos Personales | **Tratamiento de Datos Sensibles (Salud) y de Menores de Edad.** Los diagnósticos clínicos, discapacidades y registros psicosociales son de reserva legal. Exigen autorización informada y explícita del acudiente y circulación hiper-restringida. |

### 1.2 Documentos Técnicos y Guías Oficiales del MEN

1. **Guía y Orientaciones del MEN para la Implementación del Decreto 1421 de 2017:**
   Documento rector publicado por el MEN que desglosa la ruta metodológica de atención inclusiva en 3 momentos:
   - *Momento 1:* Bienvenida y conocimiento del estudiante (caracterización del estudiante, valoración pedagógica y del contexto).
   - *Momento 2:* Planeación y diseño de apoyos (construcción de ajustes razonables curriculares y firma del acta de acuerdo).
   - *Momento 3:* Implementación, seguimiento y evaluación (retroalimentación continua e informe de proceso pedagógico).

2. **Formatos Oficiales del MEN (Estructura de Anexos del PIAR):**
   - **Anexo 1: Información General del Estudiante y su Entorno.**  
     Ficha de identificación, red de salud, ayudas técnicas, entorno familiar/hogar, redes de apoyo comunitarias, gustos, motivaciones y expectativas de vida.
   - **Anexo 2: Plan Individual de Ajustes Razonables (PIAR).**  
     Matriz pedagógica por áreas/asignaturas:
     * *Objetivos / Propósitos de Aprendizaje* (para el periodo o grado).
     * *Barreras identificadas* (actitudinales, metodológicas, organizativas, de infraestructura, evaluativas).
     * *Ajustes Razonables* propuestos bajo los 3 principios del DUA (Diseño Universal para el Aprendizaje).
     * *Evaluación de efectividad del ajuste* (indicadores de logro alcanzado y replanteamiento de ajustes).
   - **Anexo 3: Acta de Acuerdo y Corresponsabilidad.**  
     Documento legal de compromisos vinculantes entre:
     * La Institución Educativa (directivos y docentes).
     * La Familia / Acudientes (apoyos en casa, continuidad terapéutica, acompañamiento).
     * El Estudiante (según edad y nivel de autonomía).

3. **Clasificación Oficial del SIMAT (Sistema de Matrícula Estudiantil del MEN):**  
   Para la interoperabilidad y coherencia censal, Klassy debe contemplar los códigos estandarizados de discapacidad y talentos excepcionales que exige el MEN:
   - *Discapacidad Auditiva:* Usuario de Lengua de Señas Colombiana (LSC) / Usuario de Lengua Castellana (Oral).
   - *Discapacidad Visual:* Ceguera total / Baja visión irreversible.
   - *Sordoceguera.*
   - *Discapacidad Intelectual* (Cognitiva).
   - *Discapacidad Psicosocial / Mental.*
   - *Discapacidad Física / Motora.*
   - *Discapacidad Sistémica* (enfermedades crónicas graves y degenerativas).
   - *Trastorno del Espectro Autista (TEA).*
   - *Discapacidad Múltiple.*
   - *Trastornos específicos del aprendizaje o del comportamiento* (categorías de atención pedagógica).
   - *Capacidades y Talentos Excepcionales:* Talento general, ciencias naturales, ciencias sociales, artes, deportes, tecnología, liderazgo.

---

## 2. Conceptos Clave y Filosofía Pedagógica del Módulo

Para que el desarrollo técnico sea coherente con la realidad pedagógica, el equipo de desarrollo debe comprender los siguientes axiomas del Decreto 1421:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ARQUITECTURA DE INCLUSIÓN DUA-PIAR                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │               DISEÑO UNIVERSAL PARA EL APRENDIZAJE (DUA)            │   │
│   │           (A nivel de aula regular, para todos los estudiantes)     │   │
│   │  • Múltiples formas de motivación y compromiso                      │   │
│   │  • Múltiples formas de representación de la información             │   │
│   │  • Múltiples formas de acción y expresión                           │   │
│   └──────────────────────────────────┬──────────────────────────────────┘   │
│                                      │ Cuando el DUA no es suficiente       │
│                                      ▼                                      │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │             PLAN INDIVIDUAL DE AJUSTES RAZONABLES (PIAR)            │   │
│   │      (Ajuste individualizado, específico y focalizado por área)     │   │
│   │  • Identificación de barreras específicas en la asignatura          │   │
│   │  • Ajustes en tiempos, materiales, metodologías y evaluación        │   │
│   │  • Metas de aprendizaje flexibilizadas y alcanzables                │   │
│   └──────────────────────────────────┬──────────────────────────────────┘   │
│                                      │ Compromiso y seguimiento             │
│                                      ▼                                      │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                 ACTA DE CORRESPONSABILIDAD Y SEGUIMIENTO            │   │
│   │  • Familia: Compromisos en casa y terapias de salud                 │   │
│   │  • Colegio: Ajustes curriculares y apoyos pedagógicos               │   │
│   │  • Balance Anual: Informe final de proceso para el siguiente año    │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

1. **El PIAR no es un currículo paralelo ni una lista de contenidos rebajados:**  
   Es una adaptación razonable del plan de estudios oficial para que el estudiante acceda a las mismas competencias básicas con los andamiajes necesarios.
2. **Las barreras no residen en el estudiante, sino en el entorno:**  
   El Decreto 1421 adopta el modelo social de la discapacidad. La discapacidad surge cuando las limitaciones de la persona interactúan con barreras físicas, actitudinales o comunicativas del colegio. El PIAR identifica la barrera para eliminarla o mitigarla.
3. **El DUA es la base; el PIAR es el ajuste particular:**  
   Primero el docente planea para la diversidad con DUA. Si un estudiante con discapacidad aún encuentra barreras, entra a operar el PIAR.
4. **Informe Anual de Competencias vs. Boletín Ordinario:**  
   El estudiante recibe su boletín de calificaciones de periodo (M17), pero además, al cierre del año, el sistema genera el **Informe Anual de Proceso Pedagógico del PIAR**, que sintetiza sus logros, el impacto de los ajustes y las recomendaciones para los docentes del siguiente grado escolar.

---

## 3. Especificación Funcional de M16

### 3.1 Propósito del Módulo
Dotar a la institución educativa de un ecosistema digital, seguro y riguroso para:
1. Diseñar, diligenciar, coordinar, aprobar y hacer seguimiento al **Plan Individual de Ajustes Razonables (PIAR)** en conformidad con el Decreto 1421 de 2017.
2. Gestionar la atención de **Orientación Escolar y Apoyo Psicosocial**, asegurando la confidencialidad de las intervenciones, la recepción de remisiones de convivencia (M15) y el enlace con redes de apoyo externas.

### 3.2 Alcance del Módulo

**Dentro del alcance de M16:**
- Registro y actualización del Anexo 1 (Caracterización del entorno, salud no administrativa y perfil del estudiante).
- Gestión del Anexo 2 (Matriz de ajustes razonables por asignatura/área, metas de aprendizaje y seguimiento por periodo).
- Formalización del Anexo 3 (Acta de acuerdo de corresponsabilidad con registro de firmas y compromisos familiares/institucionales).
- Emisión del Informe Anual de Proceso Pedagógico (balance final).
- Bandeja de gestión para el Docente Orientador: administración de casos de inclusión, registro de sesiones y atenciones confidenciales, y gestión de remisiones escolares.
- Interfaz colaborativa: Orientación inicia y estructura el PIAR; cada Docente asignado a la carga académica del grupo (M08) completa los ajustes de su asignatura; Coordinación supervisa.
- Descarga de reportes en PDF oficiales para la carpeta física del estudiante (exigencia de las Secretarías de Educación durante auditorías de inspección y vigilancia).

**Fuera del alcance de M16 (por regla de alcance estricto de Klassy):**
- Modificación directa de fórmulas de calificación en M12 (las notas se ingresan en M12 respetando los criterios del PIAR).
- Emisión de boletines periódicos masivos (pertenece a M17; M17 consumirá un indicador de "Estudiante con PIAR" y anexará el informe cuando corresponda).
- Matrícula institucional y gestión de acudientes (M03 / M04).
- Creación de asignaturas o áreas (M06).
- Gestión de faltas y medidas disciplinarias (M14 / M15).

---

## 4. Actores, Roles y Matriz de Permisos (RBAC y ABAC)

Siguiendo la arquitectura de seguridad de Klassy (sección 5 de `CLAUDE.md` y `backend/src/constants/roles.ts`), el Módulo 16 involucra a los siguientes actores:

```
  Jerarquía de roles en Klassy:
  ADMIN (100) > COORDINADOR (70) = ORIENTADOR (70) = COORD_CONVIVENCIA (70) > SECRETARIA (40) = DOCENTE (40) > ESTUDIANTE (10) = ACUDIENTE (10)
```

### 4.1 Definición de Responsabilidades por Rol en M16

1. **`ORIENTADOR` (Psicología / Apoyo Pedagógico):**  
   - Líder funcional de M16.
   - Crea el expediente PIAR del estudiante a partir de las alertas de matrícula o remisiones.
   - Diligencia y mantiene el Anexo 1 (Caracterización y Entorno).
   - Asesora a los docentes de aula en estrategias DUA y ajustes razonables.
   - Convoca y registra el Anexo 3 (Acta de Acuerdo con familia).
   - Gestiona la bandeja de remisiones de orientación y registra atenciones confidenciales.
   - Genera el informe consolidado anual.
   - *Restricción de sede:* Opera únicamente sobre las sedes asignadas en su perfil (`ROLES_CON_SEDE_OBLIGATORIA`).

2. **`DOCENTE` (Docente de Aula):**  
   - Accede **únicamente** a los PIAR de estudiantes matriculados en grupos donde tiene asignación académica activa (`TeacherAssignment` tipo `CLASE`).
   - El director de grupo (`DIRECCION_GRUPO`) puede consultar los ajustes de todas las asignaturas de su grupo para hacer seguimiento integral.
   - Diligencia los ajustes razonables de su propia asignatura (metas, barreras, estrategias DUA y evaluación diferenciada) en el Anexo 2.
   - Califica la efectividad de los ajustes al finalizar cada periodo académico.
   - **No tiene acceso** a las notas de sesión confidenciales de orientación ni a datos médicos reservados (principio de minimización de datos).

3. **`COORDINADOR` (Coordinación Académica):**  
   - Supervisa el estado de avance de los PIAR de su sede.
   - Verifica que los docentes de aula hayan formulado los ajustes en los tiempos de ley (primer trimestre).
   - Consulta el historial y estadísticas de inclusión de la sede.

4. **`ADMIN` (Rectoría / Administrador del Sistema):**  
   - Acceso institucional total.
   - Configura parámetros globales de inclusión (catálogo de barreras tipo, tipos de apoyos técnicos, opciones de formato).
   - Acceso a registros de auditoría técnica y forense.

5. **`ACUDIENTE`:**  
   - Consulta el estado del PIAR de su acudido a través de su vista autorizada.
   - Visualiza los compromisos adquiridos en el Anexo 3 (corresponsabilidad familiar).
   - Visualiza el Informe Anual de Proceso Pedagógico.

6. **`ESTUDIANTE`:**  
   - Consulta sus metas de aprendizaje y compromisos en modo lectura amigable (cuando su edad y condición lo permitan).

7. **`SECRETARIA`:**  
   - **Acceso denegado a M16:** No tiene acceso al expediente pedagógico, clínico ni actas del PIAR. Solo visualiza y gestiona las casillas de caracterización censal en M03 (`tiene_discapacidad`, `tiene_talento_excepcional`, categoría SIMAT) para reportes oficiales ante el MEN.

### 4.2 Matriz Detallada de Permisos (RBAC + ABAC)

| Recurso / Acción | ADMIN | COORD | ORIENTADOR | DOCENTE (su clase) | DOCENTE (director grupo) | SECRETARIA | ACUDIENTE / ESTUDIANTE |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Crear expediente PIAR** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Editar Anexo 1 (Entorno/Caracterización)** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Ver Anexo 1 (Caracterización Pedagógica)** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ (solo acudido) |
| **Ver Anexo 1 (Historia Clínica/Salud sensible)** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Editar Anexo 2 (Ajustes de su asignatura)** | ✅ | ❌ | ✅ (como apoyo) | ✅ (su materia) | ❌ | ❌ | ❌ |
| **Ver Anexo 2 (Ajustes de todas las materias)** | ✅ | ✅ | ✅ | ❌ (solo su materia) | ✅ (su grupo) | ❌ | ✅ (solo acudido) |
| **Crear/Editar Anexo 3 (Acta de acuerdo)** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Ver Anexo 3 (Acta de acuerdo)** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ (solo acudido) |
| **Registrar seguimiento por periodo** | ✅ | ❌ | ✅ | ✅ (su materia) | ❌ | ❌ | ❌ |
| **Generar Informe Anual Consolidado** | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ (descarga) |
| **Bandeja de Remisiones Orientación** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Registrar Atención Psicosocial confidencial**| ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Ver Atenciones confidenciales registradas** | ✅ (auditoría)| ❌ | ✅ (solo las suyas)| ❌ | ❌ | ❌ | ❌ |

---

## 5. Arquitectura del Modelo de Datos para M16

Siguiendo las convenciones de Klassy (TypeScript, Mongoose, colecciones en español, esquemas desacoplados y llaves foráneas con validación relacional), el módulo se estructura en las siguientes entidades:

```
  ┌───────────────────────────┐         1:N         ┌──────────────────────────────┐
  │     StudentProfile        │────────────────────▶│             Piar             │
  │ (M03: banderas y salud)   │                     │ (Expediente anual del alumno)│
  └───────────────────────────┘                     └──────────────┬───────────────┘
                                                                   │ 1:N
                                                                   ▼
                                                    ┌──────────────────────────────┐
                                                    │       AjusteRazonable        │
                                                    │  (Por asignatura y docente)  │
                                                    └──────────────┬───────────────┘
                                                                   │ 1:N
                                                                   ▼
                                                    ┌──────────────────────────────┐
                                                    │      SeguimientoPeriodo      │
                                                    │ (Evaluación de efectividad)  │
                                                    └──────────────────────────────┘
```

### 5.1 Enumeraciones y Constantes (`backend/src/constants/piar.ts`)

```typescript
// Categorías oficiales de Discapacidad y Talentos según SIMAT / MEN
export const CATEGORIAS_DISCAPACIDAD_SIMAT = [
  'FISICA_MOTORA',
  'VISUAL_CEGUERA',
  'VISUAL_BAJA_VISION',
  'AUDITIVA_LSC',
  'AUDITIVA_CASTELLANO',
  'SORDOCEGUERA',
  'INTELECTUAL_COGNITIVA',
  'PSICOSOCIAL_MENTAL',
  'TRASTORNO_ESPECTRO_AUTISTA',
  'SISTEMICA_CRONICA',
  'MULTIPLE',
  'TRASTORNO_ESPECIFICO_APRENDIZAJE',
  'TALENTO_EXCEPCIONAL',
  'OTRA'
] as const;
export type CategoriaDiscapacidadSimat = (typeof CATEGORIAS_DISCAPACIDAD_SIMAT)[number];

export const ESTADOS_PIAR = [
  'BORRADOR',            // En elaboración inicial
  'EN_REVISION',          // Docentes completando ajustes
  'ACORDADO',             // Acta firmada con la familia (Activo)
  'CERRADO_SUPERADO',     // Objetivos alcanzados / no requiere más apoyos
  'CERRADO_HISTORICO'     // Año lectivo finalizado
] as const;
export type EstadoPiar = (typeof ESTADOS_PIAR)[number];

export const TIPOS_BARRERA = [
  'ACTITUDINAL',          // Prejuicios, bajas expectativas, sobreprotección
  'PEDAGOGICA_DIDACTICA', // Metodologías rígidas, material homogéneo
  'COMUNICATIVA',         // Falta de LSC, braille, subtítulos, lenguaje claro
  'ORGANIZATIVA_TIEMPO',  // Tiempos inflexibles de examen o clase
  'FISICA_ESPACIAL',      // Accesibilidad en aula, rampas, iluminación
  'EVALUATIVA'            // Pruebas estandarizadas sin formatos alternos
] as const;
export type TipoBarrera = (typeof TIPOS_BARRERA)[number];

export const PRINCIPIOS_DUA = [
  'MOTIVACION_COMPROMISO', // El porqué del aprendizaje
  'REPRESENTACION',        // El qué del aprendizaje
  'ACCION_EXPRESION'       // El cómo del aprendizaje
] as const;
export type PrincipioDua = (typeof PRINCIPIOS_DUA)[number];

export const EFECTIVIDAD_AJUSTE = [
  'MUY_EFECTIVO',
  'PARCIALMENTE_EFECTIVO',
  'NO_EFECTIVO',
  'NO_APLICADO'
] as const;
export type EfectividadAjuste = (typeof EFECTIVIDAD_AJUSTE)[number];
```

### 5.2 Modelo de Expediente PIAR (`backend/src/models/piar.model.ts`)

```typescript
import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  CATEGORIAS_DISCAPACIDAD_SIMAT,
  CategoriaDiscapacidadSimat,
  ESTADOS_PIAR,
  EstadoPiar,
} from '../constants/piar';

export interface IAnexo1Caracterizacion {
  // Datos del entorno y salud pedagógica (no la historia clínica pura)
  diagnostico_medico_descripcion?: string; // Ej: "Diagnóstico neurológico de TEA Grado 1 (CIE-10 F84.0)"
  profesionales_externos?: string[];       // Ej: ["Fonoaudiología", "Terapia Ocupacional"]
  medicamentos_relevantes?: string;        // Relevante por somnolencia o efectos en el aula
  productos_apoyo_ayudas_tecnicas?: string[]; // Ej: ["Silla de ruedas", "Monocular", "Software lector"]
  
  // Perfil de aprendizaje y fortalezas (Momento 1 MEN)
  gustos_intereses: string;               // Lo que apasiona al estudiante
  expectativas_estudiante: string;        // Qué sueña o espera lograr
  expectativas_familia: string;           // Qué espera la familia del colegio
  habilidades_fortalezas: string;         // En qué destaca
  canales_comunicacion_preferidos: string;// Oral, gestual, pictogramas, texto
  dinamica_hogar_red_apoyo: string;       // Quién apoya tareas, quién asiste a citaciones
}

export interface IActaAcuerdoCorresponsabilidad {
  fecha_acuerdo: Date;
  compromisos_institucion: string[];
  compromisos_familia: string[];
  compromisos_estudiante?: string[];
  acudiente_firmante_nombre: string;
  acudiente_firmante_documento: string;
  acudiente_parentesco: string;
  orientador_firmante_id: Types.ObjectId;
  directivo_firmante_id?: Types.ObjectId;
  documento_firmado_url?: string;         // Soporte de acta escaneada si se firma en físico
  observaciones_adicionales?: string;
}

export interface IPiar {
  institucion_id: Types.ObjectId;
  sede_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;       // Año lectivo (M05)
  student_id: Types.ObjectId;             // Estudiante (User M02 / StudentProfile M03)
  group_id: Types.ObjectId;               // Grupo en el año (Group M01)
  
  categoria_simat: CategoriaDiscapacidadSimat;
  estado: EstadoPiar;
  
  // Anexo 1: Caracterización y entorno
  anexo1: IAnexo1Caracterizacion;
  
  // Anexo 3: Formalización del acuerdo
  acta_acuerdo?: IActaAcuerdoCorresponsabilidad;
  
  // Informe Anual de Cierre (Balance Final del proceso pedagógico)
  informe_anual_proceso?: {
    fecha_emision: Date;
    logros_destacados: string;
    dificultades_persistentes: string;
    recomendaciones_grado_siguiente: string;
    ajustes_a_mantener: string[];
    emitido_por_id: Types.ObjectId;
  };

  creado_por_id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type PiarDocument = HydratedDocument<IPiar>;
```

### 5.3 Modelo de Ajustes por Asignatura (`backend/src/models/ajusteRazonable.model.ts`)

Representa el **Anexo 2 oficial del MEN**. Cada registro vincula al estudiante con una asignatura específica y el docente que la dicta.

```typescript
import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  EFECTIVIDAD_AJUSTE,
  EfectividadAjuste,
  PRINCIPIOS_DUA,
  PrincipioDua,
  TIPOS_BARRERA,
  TipoBarrera,
} from '../constants/piar';

export interface ISeguimientoPeriodo {
  periodo_numero: number;                 // 1, 2, 3 o 4 (M05)
  fecha_seguimiento: Date;
  efectividad: EfectividadAjuste;
  observaciones_avance: string;
  nuevas_acciones_propuestas?: string;
  registrado_por_id: Types.ObjectId;
}

export interface IAjusteRazonable {
  piar_id: Types.ObjectId;                // Llave foránea al PIAR maestro
  academic_year_id: Types.ObjectId;
  subject_id: Types.ObjectId;             // Asignatura (M06)
  teacher_id: Types.ObjectId;             // Docente titular de la materia (M08)
  
  // Formulación Pedagógica (Anexo 2 MEN)
  objetivos_metas_flexibilizadas: string; // Objetivos adaptados a partir de DBA/Estándares
  barreras_detectadas: Array<{
    tipo: TipoBarrera;
    descripcion: string;
  }>;
  ajustes_propuestos: Array<{
    principio_dua: PrincipioDua;
    descripcion: string;                 // Ej: "Guías con macrotipo y apoyos gráficos"
    apoyos_materiales?: string;          // Ej: "Ábaco, audiolibro"
  }>;
  estrategias_evaluativas: string;        // Cómo se evaluará el aprendizaje (Decreto 1290)
  
  // Seguimientos trimestrales/periódicos
  seguimientos: Types.DocumentArray<ISeguimientoPeriodo>;

  createdAt: Date;
  updatedAt: Date;
}

export type AjusteRazonableDocument = HydratedDocument<IAjusteRazonable>;
```

### 5.4 Modelo de Orientación y Apoyo Psicosocial (`backend/src/models/orientacionAtencion.model.ts`)

Mantiene la confidencialidad absoluta de las sesiones y la atención de estudiantes remitidos desde convivencia o por demanda espontánea.

```typescript
import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';

export const MOTIVOS_ATENCION_ORIENTACION = [
  'REMISION_CONVIVENCIA_M15',
  'APOYO_INCLUSION_PIAR',
  'BAJO_RENDIMIENTO_ACADEMICO',
  'CRISIS_EMOCIONAL_ANSIEDAD',
  'PRESUNTA_VULNERACION_DERECHOS',
  'DUELO_SITUACION_FAMILIAR',
  'ORIENTACION_VOCACIONAL',
  'OTRO'
] as const;
export type MotivoAtencionOrientacion = (typeof MOTIVOS_ATENCION_ORIENTACION)[number];

export interface IOrientacionAtencion {
  institucion_id: Types.ObjectId;
  sede_id: Types.ObjectId;
  student_id: Types.ObjectId;
  remision_id?: Types.ObjectId;           // Si proviene de RemisionOrientacion (M15)
  piar_id?: Types.ObjectId;               // Si se relaciona con seguimiento del PIAR
  
  fecha: Date;
  motivo: MotivoAtencionOrientacion;
  motivo_detalle: string;
  
  // Contenido confidencial: SOLO Orientador autor y Admin (para auditoría)
  descripcion_sesion: string;
  acuerdos_tareas: string;
  
  // Remisiones a entidades externas (Ley 1098 / Decreto 1421)
  remision_externa?: {
    entidad: string;                      // Ej: "ICBF", "Comisaría de Familia", "EPS", "Sector Salud"
    motivo_remision: string;
    fecha_oficio: Date;
    numero_radicado?: string;
  };

  asistentes_sesion: string[];            // Ej: ["Estudiante", "Madre de familia"]
  atendido_por_id: Types.ObjectId;       // Usuario con rol ORIENTADOR
  createdAt: Date;
  updatedAt: Date;
}

export type OrientacionAtencionDocument = HydratedDocument<IOrientacionAtencion>;
```

---

## 6. Procesos y Flujos de Trabajo (Ciclo de Vida del PIAR)

```
        ┌──────────────────────────────────────────────────────────────────┐
        │                 FASE 1: IDENTIFICACIÓN Y APERTURA                │
        │  • Matrícula censal en M03 / Alerta de Docente / Remisión M15    │
        │  • Orientador crea el expediente PIAR y diligencia Anexo 1       │
        └─────────────────────────────────┬────────────────────────────────┘
                                          │
                                          ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │             FASE 2: CONSTRUCCIÓN CURRICULAR (ANEXO 2)            │
        │  • Docentes de asignatura reciben notificación de inclusión      │
        │  • Cada docente formula barreras, metas flexibilizadas y DUA     │
        │  • Orientador y Coordinación revisan la coherencia pedagógica    │
        └─────────────────────────────────┬────────────────────────────────┘
                                          │
                                          ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │         FASE 3: FORMALIZACIÓN Y CORRESPONSABILIDAD (ANEXO 3)     │
        │  • Reunión de concertación con Acudientes y Estudiante           │
        │  • Firma digital / radicación de compromisos institucionales     │
        │  • Estado pasa a: "ACORDADO"                                     │
        └─────────────────────────────────┬────────────────────────────────┘
                                          │
                                          ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │           FASE 4: SEGUIMIENTO PERIÓDICO Y EVALUACIÓN SIEE        │
        │  • Al cierre de cada periodo (M05), docentes evalúan efectividad │
        │  • Ajustes en tiempo real si el estudiante no avanza             │
        └─────────────────────────────────┬────────────────────────────────┘
                                          │
                                          ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │        FASE 5: BALANCE ANUAL Y TRANSICIÓN DE GRADO               │
        │  • Orientación y directores emiten Informe Anual Pedagógico      │
        │  • Insumo directo para la Comisión de Evaluación y Promoción     │
        │  • Cierre del año lectivo: Inmutabilidad histórica               │
        └──────────────────────────────────────────────────────────────────┘
```

### 6.1 Reglas de Negocio Específicas de M16

- **RN-16-01 (Plazo de Ley de Elaboración):** El PIAR debe iniciarse y formalizarse durante el primer trimestre del año escolar, conforme al Decreto 1421. Si el estudiante se matricula extemporáneamente, el sistema marca un límite de 30 días calendario.
- **RN-16-02 (Aislamiento por Asignatura):** Un docente no puede editar ni borrar los ajustes planteados por otro docente para otra asignatura. Solo puede editar su propia materia.
- **RN-16-03 (Snapshot e Inmutabilidad en Cierre):** Al cerrar el año lectivo en M05 (`asegurarAnioNoCerrado`), los expedientes PIAR y sus ajustes pasan automáticamente a solo lectura (`CERRADO_HISTORICO`). Ninguna acción posterior puede alterar lo acordado y ejecutado en ese año.
- **RN-16-04 (Coherencia con Matrícula):** Para crear un PIAR, el estudiante debe tener una matrícula activa (`Enrollment` con estado `ACTIVA`) en el año lectivo corriente.
- **RN-16-05 (Auditoría Forense de Consulta):** Dado que el PIAR contiene información psicosocial y diagnóstica protegida por la Ley 1581 de 2012, **toda visualización de un PIAR deja un rastro inmutable en `AuditLog`** con la acción `PIAR_CONSULTADO`, indicando el usuario, el estudiante, la IP y la marca de tiempo.
- **RN-16-06 (No Discriminación Evaluativa):** El sistema advertirá al docente al calificar en M12 si un estudiante cuenta con PIAR aprobado, recordando que la escala y criterios deben ajustarse a lo consignado en el Anexo 2.

---

## 7. Diseño de Endpoints del Backend (API REST)

Los endpoints respetan la arquitectura en capas de Klassy:
- `backend/src/routes/piar.routes.ts`
- `backend/src/controllers/piar.controller.ts`
- `backend/src/services/piar.service.ts`
- `backend/src/validators/piar.validator.ts`

### 7.1 Catálogo de Rutas

```
# GESTIÓN DEL PIAR MAESTRO (ANEXO 1 Y ACTA ANEXO 3)
POST   /api/v1/piar                       # Crear expediente PIAR (ORIENTADOR, ADMIN, COORD)
GET    /api/v1/piar                       # Listar PIARs con filtros por sede, grupo, estado
GET    /api/v1/piar/:id                   # Consultar expediente PIAR completo (con validación de contexto)
PUT    /api/v1/piar/:id/anexo1            # Actualizar caracterización pedagógica y entorno
PUT    /api/v1/piar/:id/acta-acuerdo      # Formalizar acta de corresponsabilidad (Anexo 3)
PUT    /api/v1/piar/:id/informe-anual     # Registrar balance anual consolidado
GET    /api/v1/piar/:id/pdf               # Generar y descargar reporte oficial en PDF

# GESTIÓN DE AJUSTES RAZONABLES POR ASIGNATURA (ANEXO 2)
POST   /api/v1/piar/:id/ajustes           # Docente registra o actualiza ajustes de su materia
GET    /api/v1/piar/:id/ajustes           # Consultar ajustes (Docente solo ve los suyos; Orientador/Admin ve todos)
POST   /api/v1/piar/:id/ajustes/:ajusteId/seguimiento  # Docente evalúa efectividad de un periodo

# ORIENTACIÓN ESCOLAR Y ATENCIONES PSICOSOCIALES
POST   /api/v1/orientacion/atenciones     # Registrar sesión de atención confidencial (ORIENTADOR)
GET    /api/v1/orientacion/atenciones     # Listar sesiones de orientación (con filtro de confidencialidad)
GET    /api/v1/orientacion/estudiante/:studentId  # Expediente psicosocial del alumno (ORIENTADOR, ADMIN)
```

---

## 8. Diseño de la Interfaz de Usuario (Frontend)

Siguiendo las pautas de UX de Klassy (Vite, React, Tailwind CSS, TanStack Query y componentes estándar en `frontend/src/components/ui/`):

### 8.1 Puntos de Entrada y Navegación

1. **Pestaña "Observador y Bienestar" en la Ficha 360° del Estudiante (`StudentDetailPage.tsx`):**
   - Actualmente reservada en el código. Se divide en dos sub-pestañas:
     * *Convivencia Escolar (M14):* Línea de tiempo de observaciones y compromisos.
     * *Educación Inclusiva y PIAR (M16):* Indicador de condición SIMAT, estado del PIAR actual, acceso directo a la formulación y descarga del PDF oficial.

2. **Módulo Principal de Inclusión para Docentes y Orientadores:**
   - Para el `ORIENTADOR`: `/orientacion/piar` (Bandeja general de seguimiento, alertas de plazos del primer trimestre, estado de firmas de familias y estudiantes sin ajustes formulados).
   - Para el `DOCENTE`: `/docente/ajustes-razonables` o directamente desde su planilla de notas (`M12`), con un distintivo accesible: **"Estudiante con PIAR - Ver ajustes"**. Al hacer clic, abre un **Drawer lateral** donde el profesor consulta las barreras y diligencia sus ajustes pedagógicos sin salir de su contexto.

3. **Formulario del PIAR en Drawer / Wizard:**
   - Pestaña 1: *Caracterización y Entorno (Anexo 1)* — Orientación.
   - Pestaña 2: *Ajustes por Asignatura (Anexo 2)* — Acordeón por materias. Cada profesor solo tiene habilitado el botón de edición en su materia respectiva.
   - Pestaña 3: *Acta de Corresponsabilidad (Anexo 3)* — Checklists de compromisos y panel de firmas.
   - Pestaña 4: *Seguimiento Periódico e Informe Anual*.

---

## 9. Plan de Implementación Paso a Paso (Roadmap de Desarrollo)

Para ejecutar este módulo de manera segura, sin sobrecargar el alcance y respetando el estándar del repositorio, se definen 4 fases secuenciales:

### Fase 1: Núcleo Normativo y Modelos de Datos (Backend Core)
- Creación de enums y constantes oficiales (`backend/src/constants/piar.ts`).
- Definición de modelos Mongoose con índices y validadores:
  * `piar.model.ts`
  * `ajusteRazonable.model.ts`
  * `orientacionAtencion.model.ts`
- Adición de acciones de auditoría en `auditLog.model.ts` (`PIAR_CREADO`, `PIAR_CONSULTADO`, `PIAR_ACTUALIZADO`, `PIAR_ACTA_FIRMADA`, `ORIENTACION_ATENCION_REGISTRADA`).
- Implementación de validadores Joi rigurosos (`piar.validator.ts`).

### Fase 2: Servicios, Controladores y Lógica de Negocio
- Desarrollo de `piar.service.ts`:
  * Validación de matrícula activa y vinculación docente mediante `TeacherAssignment`.
  * Filtro estricto de visibilidad y minimización de datos por rol (ABAC).
  * Control del ciclo de vida y bloqueo por año lectivo cerrado.
- Desarrollo de `orientacion.service.ts` para sesiones confidenciales y canalizaciones externas.
- Pruebas unitarias y de integración backend con Vitest y `mongodb-memory-server`.

### Fase 3: Integración Frontend y Experiencia de Usuario
- Creación de hooks en TanStack Query (`usePiar.ts`, `useAjustesRazonables.ts`, `useOrientacion.ts`).
- Integración en la pestaña "Observador y Bienestar" de `StudentDetailPage.tsx`.
- Pantalla de gestión integral para el Orientador (`PiarManagementPage.tsx`).
- Drawer de diligenciamiento de ajustes razonables para el docente de aula (`AjusteRazonableDrawer.tsx`).
- Indicador accesible en planilla de notas de M12.

### Fase 4: Exportación Documental Oficial y Auditoría
- Generador de PDF oficial de los Anexos 1, 2 y 3 según la plantilla institucional y lineamientos del MEN.
- Pruebas de carga y auditoría de accesos.
- Documentación de entrega y guía de usuario para el equipo pedagógico.

---

## 10. Conclusión y Recomendaciones Finales

El Módulo 16 representa el cumplimiento del mandato constitucional y reglamentario más exigente de la educación colombiana contemporánea. Su éxito en Klassy radica en:
1. **Descentralizar la carga:** Garantizar que los docentes formulen sus propios ajustes curriculares en el sistema y no recargar al Orientador con tareas de planeación didáctica ajenas a su especialidad.
2. **Blindar los datos sensibles:** Cumplir a cabalidad con la Ley 1581 de 2012 y el Código de Infancia y Adolescencia, separando el seguimiento pedagógico del historial médico y confidencial.
3. **Cero fricción con el SIEE:** Articular los ajustes del PIAR con la evaluación periódica de M12 y M17 para asegurar que ningún estudiante sea evaluado al margen de sus capacidades y derechos.
