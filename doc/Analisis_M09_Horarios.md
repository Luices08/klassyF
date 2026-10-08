# Análisis M09 — Gestión y creación de horarios

Estado: **fase 1 (motor y modelos) implementada**. Fases 2 a 4 (API, pantallas, publicación y vistas) diseñadas aquí.

## 1. Qué hace el módulo

Toma la carga ya registrada —intensidad horaria de cada asignatura por grupo y el docente que la dicta (M06 + M08)—,
la estructura de tiempo de cada jornada (días hábiles y franjas de M01/M05) y los espacios (M10), y produce un horario
semanal que cumple las restricciones duras y optimiza las preferencias. El coordinador puede ajustar a mano, revalidar
y publicar. Se consulta por grupo, por docente, por espacio y en vista general (la "sábana" institucional).

M09 **no crea** asignaturas, horas, docentes, franjas ni aulas: las lee por llave foránea (regla de oro de datos).
Lo único propio de M09 son las **variables** (restricciones y preferencias) y las **versiones** del horario.

## 2. De dónde sale cada insumo

| Insumo | Fuente | Cómo lo usa M09 |
|---|---|---|
| Días y franjas | `JornadaOperativa.dias_habiles` / `franjas` | Solo las franjas `CLASE` son periodos; un `DESCANSO` marca `descanso_antes` en el siguiente |
| Horas por asignatura y grupo, y su docente | `TeacherAssignment` (CLASE, activa) | Cada asignación se parte en sesiones según `DISTRIBUCION_BLOQUES` |
| Proyectos y reuniones sin grupo | Variable `REUNION_COLECTIVA` | Sesión sin grupo con varios docentes a la vez (la "R/Matem." de las capturas) |
| Aulas y laboratorios | `Espacio` (solo `DISPONIBLE`) | `ESPACIO_REQUERIDO` limita dónde va una sesión; respeta `areas_exclusivas` y `admite_grupos_simultaneos` |
| Salón titular | `Group.aula_id` | Una sesión sin `ESPACIO_REQUERIDO` va al salón del grupo y no compite por espacio |

## 3. Variables: una sola forma para todas

Cada variable (`VariableHorario`) tiene:

- **tipo**: qué regla es (catálogo en `constants/horarios.ts`).
- **severidad**: `DURA` (no se publica si se incumple) o `BLANDA` con **peso** 1–10 (preferencia optimizable).
  Separar obligatorio de optimizable es requisito del documento maestro.
- **alcance**: a quién aplica.
  - `GLOBAL`: a todos los grados.
  - `GRADOS` + lista: a un grado o a un grupo de grados (ej. 10° y 11°). Un grado solo es una lista de uno.
  - `GRUPOS` + lista: a cursos concretos (ej. 6A, o 6A y 6B).
- **filtros**: `asignatura_ids` y `docente_ids` (vacío = todos).
- **parámetros** propios del tipo (patrón de bloques, celdas de tiempo libre, máximos...).
- **es_excepción**: anula, donde aplique, a las variables del mismo tipo igual o menos específicas.

### Cascada de especificidad

Si varias variables del mismo tipo le aplican a una sesión:

1. Se descartan las que no le aplican por alcance, asignatura o docente.
2. Una excepción anula las de su tipo que cubre y que no son más específicas que ella.
3. En tipos de **valor único** queda solo la más específica: `GRUPOS > GRADOS > GLOBAL`; a igual alcance, nombrar
   docentes o asignaturas gana a "todos". Empate: la más reciente.
4. Las **relaciones** (no mismo día, consecutivas...) se acumulan.

Ejemplo: "Matemáticas en bloques [2,2,1]" (global) + "Matemáticas en [2,1,1,1]" para 6° → 6° usa la segunda, el resto la
primera. "No el mismo día: Castellano" (global) + excepción para 11A → aplica en todos menos en 11A.

### Catálogo (mapeado a las capturas del sistema actual)

| Tipo | Captura de referencia | Valor único | Default |
|---|---|---|---|
| `DISTRIBUCION_BLOQUES` | Contrato: columnas Cantidad × Duración (Física 10A = 1×2 + 1×1) | Sí | Dura |
| `REUNION_COLECTIVA` | "Reunión Área C. Nat — Sin clase", "R/Matem." en la sábana | No | Dura |
| `DISPONIBILIDAD` | Tiempo libre (✓ adecuado, ? condicional, ✗ inadecuado) por docente, grupo o asignatura | No | Dura |
| `NO_MISMO_DIA` | "No pueden darse en el mismo día" (Física, Biol. en 10A; Cast. en 6D) | No | Blanda |
| `NO_CONSECUTIVAS` | "No pueden ser consecutivas" (Tecnol., Ed. Fís. en todas las clases) | No | Blanda |
| `DISTRIBUCION_SEMANAL` | "Distribución de fichas a lo largo de la semana" | Sí | Blanda |
| `MISMO_DIA` | "Dos asignaturas deben darse en un día" | No | Blanda |
| `CONSECUTIVAS` | "Dos asignaturas deben ser consecutivas" (orden especificado / arbitrario) | No | Blanda |
| `RECREO_NO_INTERRUMPE` | "El recreo no puede estar entre un grupo de lecciones" | Sí | Dura |
| `MISMA_FRANJA_CADA_DIA` | "Esta asignatura debe estar en el mismo período cada día" | No | Blanda |
| `MAX_HORAS_DIA_GRUPO` | Máximo de horas de una asignatura por día | Sí | Blanda |
| `MAX_HUECOS_GRUPO` | Horas libres intermedias del grupo | Sí | Blanda |
| `SIMULTANEAS` | "Las asignaturas seleccionadas deben estar a la misma hora en todas las clases seleccionadas" | No | Dura |
| `MISMO_DIA_ENTRE_GRUPOS` | "Grupo de fichas de diferentes clases deben darse el mismo día" | No | Blanda |
| `MAX_HORAS_DIA_DOCENTE` | Condiciones del profesor | Sí | Dura |
| `MAX_HUECOS_DOCENTE` | Horas huecas del docente (restricción blanda del documento maestro) | Sí | Blanda |
| `MAX_CONSECUTIVAS_DOCENTE` | Horas seguidas | Sí | Blanda |
| `ESPACIO_REQUERIDO` | Columna Aulas del contrato ("Lab., 1") | Sí | Dura |

Siempre duras, sin configurar: un grupo, un docente o un espacio no pueden estar en dos lugares a la vez, y toda hora
del plan debe quedar programada.

Las variables de docente y las reuniones se filtran por docente, no por grado: su alcance es siempre `GLOBAL`
(lo valida el modelo).

## 4. El motor (`backend/src/utils/motorHorarios/`)

Funciones puras, sin Mongoose (mismo patrón que `utils/cargaDocente.ts`), probadas en `tests/motorHorarios.test.ts`.

1. `construirEstructura` — semana a partir de la jornada.
2. `expandirSesiones` — asignaciones → sesiones (aplica bloques y espacio requerido); reuniones → sesiones sin grupo.
3. `diagnosticarCapacidad` — antes de generar, detecta lo imposible y lo explica: grupo con más horas que periodos,
   docente con más horas que franjas libres, y **más bloques dobles de los que caben** (si el descanso no puede partir
   un bloque, cada tramo entre descansos admite `floor(largo/2)` bloques por día).
4. `generarHorario` — une en unidades las sesiones simultáneas, construye una solución voraz (lo más difícil
   primero) y la mejora con recocido simulado en dos fases: primero elimina conflictos duros (aceptando a veces empeorar
   para salir de mínimos locales, con recalentamiento por ciclos), luego pule preferencias sin volver a aceptar
   conflictos duros. El movimiento principal es el intercambio de región dentro del grupo (un bloque de 2 por dos
   sesiones de 1), que nunca apila dos clases del mismo grupo. Con semilla: reproducible.
5. `evaluarHorario` — revalida un horario editado a mano; una sesión sin ubicar cuenta como conflicto duro.

El costo se descompone por grupo, por docente, por celda (espacios) y un componente global: mover una sesión solo
recalcula lo que toca (~150 000 movimientos por segundo).

Referencia medida: 17 grupos con semana llena (30 periodos), 358 sesiones, 34 docentes, laboratorio compartido,
disponibilidad de docentes y reunión de área → 0 conflictos duros y 0 penalización en ~3–9 s.

**Hallazgo de diseño:** al probar con 24 horas por docente en bloques [2,2], el problema resultó imposible (12 bloques
dobles para 10 medias jornadas). Por eso existe el aviso `BLOQUES_NO_CABEN`: en un caso así el coordinador debe ver
la causa, no un "no se pudo generar".

## 5. Versiones y publicación (`Horario`)

- Cada generación crea una versión `BORRADOR` (número consecutivo por año + jornada) con sus sesiones, conflictos,
  avisos, semilla y la huella de las franjas.
- Edición manual: mover una sesión (o fijarla) revalida y guarda conflictos. Las fijas se respetan al regenerar.
- Publicar exige 0 conflictos duros (lo valida el modelo), archiva la publicada anterior y queda en auditoría (M31).
  Solo una `PUBLICADO` por año + jornada (índice parcial).
- Si cambian las franjas de la jornada (`huella_franjas` distinta) o la carga de M08, la versión se marca
  desactualizada: las posiciones guardadas ya no significan lo mismo.

## 6. API (fase 2)

Prefijo `/horarios`. Gestión: ADMIN y COORDINADOR. Lectura del horario publicado: cualquier rol autenticado (cada uno
ve lo suyo: docente sus clases, estudiante/acudiente su grupo).

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/horarios/variables?academic_year_id&jornada_id` | Lista variables |
| POST / PATCH / DELETE | `/horarios/variables[/:id]` | Crea, edita, desactiva (Joi valida `parametros` por tipo) |
| GET | `/horarios/insumos?academic_year_id&jornada_id` | Sesiones a programar + `diagnosticarCapacidad` |
| POST | `/horarios/generar` | Crea versión BORRADOR (`semilla`, `tiempo_max_ms` opcionales) |
| GET | `/horarios?academic_year_id&jornada_id` | Versiones |
| GET | `/horarios/:id?vista=grupo\|docente\|espacio\|general&id=` | Malla para pintar |
| PATCH | `/horarios/:id/sesiones/:sesionId` | Mover / fijar; devuelve conflictos nuevos |
| POST | `/horarios/:id/publicar` | Publica (contraseña del usuario, como el cierre de año) |
| GET | `/horarios/:id/pdf?vista=` | Sábana y horarios individuales (pdfkit, como M13) |

`POST /generar` puede tardar segundos: correrlo en `worker_threads` para no bloquear el servidor y responder con la
versión en estado "generando" que el frontend consulta con `useQuery` + `refetchInterval`.

## 7. Pantallas (fases 3 y 4)

`/admin/horarios` con `Tabs`, todo sobre `components/ui/`:

1. **Insumos**: por grupo, horas a programar vs. periodos; por docente, horas vs. franjas libres; avisos del
   diagnóstico con acceso directo a lo que hay que corregir (M08, jornada, variable).
2. **Variables**: tabla (tipo, alcance, asignaturas, severidad/peso, estado) y `Drawer` de creación con el selector de
   alcance (Global / Grados / Grupos con `MultiSelect`) y los parámetros del tipo elegido.
3. **Tiempo libre**: componente nuevo `MallaDisponibilidad` en `components/ui/` (clic alterna disponible →
   condicional → no disponible, como la captura de Tatiana Herrera); se guarda como variable `DISPONIBILIDAD`.
4. **Generar y versiones**: botón generar, lista de versiones con conflictos/penalización, publicar.
5. **Horario**: malla día × periodo por grupo, docente o espacio, y la sábana general; arrastrar para mover, candado
   para fijar, panel de conflictos que resalta las sesiones implicadas.

## 8. Fases

1. ✅ Catálogo, motor puro con pruebas, modelos `VariableHorario` y `Horario`.
2. Servicio (traduce M01/M06/M08/M10 → `EntradaMotor`), validadores Joi por tipo, controladores y rutas, auditoría.
3. Pantallas de insumos, variables y tiempo libre.
4. Generación en segundo plano, mallas, edición manual, publicación y PDFs.

Fuera de alcance de M09: que M13 tome la asistencia por franja del horario publicado (se conectará después).
