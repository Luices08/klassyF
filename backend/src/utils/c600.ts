import type { ClasificacionEstudiante, GradoDelDashboard } from './dashboard';

/**
 * Cálculos del reporte estadístico con la estructura del formulario C-600 del DANE (M30): balance de matrícula, resultados por grado y sexo y edad por grado.
 * Son puros: reciben una fila por matrícula ya leída de M03, M04 y M19 y devuelven lo que dibujan la pantalla, el Excel y el PDF. La estructura sigue la que
 * dio el usuario; hay que validarla con el formulario oficial vigente del DANE antes de reportar.
 */

export type SexoC600 = 'H' | 'M' | 'O';

/** El sistema guarda `M` (masculino), `F` (femenino) y `OTRO`; el formulario tiene Hombres y Mujeres. Lo demás (y quien no tiene el dato) va en «Otro / sin dato» para que los totales cuadren. */
export function sexoDeC600(genero: string | null | undefined): SexoC600 {
  if (genero === 'M') return 'H';
  if (genero === 'F') return 'M';
  return 'O';
}

export interface ConteoSexo {
  H: number;
  M: number;
  O: number;
  total: number;
}

export const conteoVacio = (): ConteoSexo => ({ H: 0, M: 0, O: 0, total: 0 });

function sumar(c: ConteoSexo, sexo: SexoC600): void {
  c[sexo] += 1;
  c.total += 1;
}

function sumarConteos(a: ConteoSexo, b: ConteoSexo): ConteoSexo {
  return { H: a.H + b.H, M: a.M + b.M, O: a.O + b.O, total: a.total + b.total };
}

/** Años cumplidos a una fecha de corte. Las fechas de calendario están a medianoche UTC, así que se comparan por sus componentes UTC. */
export function edadCumplida(nacimiento: Date, corte: Date): number {
  let edad = corte.getUTCFullYear() - nacimiento.getUTCFullYear();
  const aunNoCumple = corte.getUTCMonth() < nacimiento.getUTCMonth() || (corte.getUTCMonth() === nacimiento.getUTCMonth() && corte.getUTCDate() < nacimiento.getUTCDate());
  if (aunNoCumple) edad -= 1;
  return edad;
}

export const EDAD_MINIMA = 4;
export const EDAD_MAXIMA = 18;

/** Las filas de la tabla de edades: «Menos de 4», de 4 a 17 una por una y «18 o más». */
export function claveDeEdad(edad: number): string {
  if (edad < EDAD_MINIMA) return '<4';
  if (edad >= EDAD_MAXIMA) return `${EDAD_MAXIMA}+`;
  return String(edad);
}

export function etiquetaDeEdad(clave: string): string {
  if (clave === '<4') return `Menos de ${EDAD_MINIMA} años`;
  if (clave === `${EDAD_MAXIMA}+`) return `${EDAD_MAXIMA} años o más`;
  return `${clave} años`;
}

export interface MatriculaC600 {
  grado_id: string;
  sexo: SexoC600;
  /** `ACTIVA` = matriculada al cierre (condicional o definitiva); `RETIRADA` = salió durante el año (retiro o traslado). */
  situacion: 'ACTIVA' | 'RETIRADA';
  /** Entró **después** del inicio del año (la matrícula se legalizó pasado el día de inicio del periodo 1). */
  ingreso_tardio: boolean;
  /** Solo de las activas: el resultado del cierre de promoción (M19) o, sin él, lo que se pueda decir. */
  clasificacion: ClasificacionEstudiante | null;
  nacimiento: Date | null;
}

// --- Sección 2: balance general de matrícula ---

export interface FilaBalance {
  grado_id: string;
  grado: string;
  grado_numero: number;
  matricula_inicial: number;
  ingresados: number;
  retirados: number;
  matricula_final: number;
}

/**
 * Matrícula inicial (con la que abrió el año), ingresados durante el año, retirados y matrícula final. Cuadra siempre: inicial + ingresados − retirados = final,
 * porque todos cuentan una sola vez al entrar y los retirados salen de las dos primeras. Los retirados incluyen los traslados a otro colegio (el sistema los deja en el
 * mismo estado), y «ingresados» incluye a los antiguos cuya matrícula se legalizó pasado el inicio de clases.
 */
export function armarBalance(grados: readonly GradoDelDashboard[], matriculas: readonly MatriculaC600[]): { filas: FilaBalance[]; total: Omit<FilaBalance, 'grado_id' | 'grado' | 'grado_numero'> } {
  const filas = new Map<string, FilaBalance>(grados.map((g) => [g.grado_id, { ...g, matricula_inicial: 0, ingresados: 0, retirados: 0, matricula_final: 0 }]));
  for (const m of matriculas) {
    const fila = filas.get(m.grado_id);
    if (!fila) continue;
    if (m.ingreso_tardio) fila.ingresados += 1;
    else fila.matricula_inicial += 1;
    if (m.situacion === 'RETIRADA') fila.retirados += 1;
    else fila.matricula_final += 1;
  }
  const lista = [...filas.values()].sort((a, b) => a.grado_numero - b.grado_numero);
  const suma = (campo: 'matricula_inicial' | 'ingresados' | 'retirados' | 'matricula_final') => lista.reduce((s, f) => s + f[campo], 0);
  return { filas: lista, total: { matricula_inicial: suma('matricula_inicial'), ingresados: suma('ingresados'), retirados: suma('retirados'), matricula_final: suma('matricula_final') } };
}

// --- Sección 3: resultados y eficiencia por grado y sexo ---

export interface FilaResultados {
  grado_id: string;
  grado: string;
  grado_numero: number;
  promovidos: ConteoSexo;
  no_promovidos: ConteoSexo;
  desertores: ConteoSexo;
  /** Matriculados que aún no tienen resultado final (recuperación, comisión o notas por completar): no es una categoría del formulario, pero sin ella los totales no cuadrarían. */
  sin_resultado: number;
}

export function armarResultados(grados: readonly GradoDelDashboard[], matriculas: readonly MatriculaC600[]): { filas: FilaResultados[]; total: Omit<FilaResultados, 'grado_id' | 'grado' | 'grado_numero'> } {
  const filas = new Map<string, FilaResultados>(grados.map((g) => [g.grado_id, { ...g, promovidos: conteoVacio(), no_promovidos: conteoVacio(), desertores: conteoVacio(), sin_resultado: 0 }]));
  for (const m of matriculas) {
    const fila = filas.get(m.grado_id);
    if (!fila) continue;
    if (m.situacion === 'RETIRADA') sumar(fila.desertores, m.sexo);
    else if (m.clasificacion === 'PROMOVIDO') sumar(fila.promovidos, m.sexo);
    else if (m.clasificacion === 'NO_PROMOVIDO') sumar(fila.no_promovidos, m.sexo);
    else fila.sin_resultado += 1;
  }
  const lista = [...filas.values()].sort((a, b) => a.grado_numero - b.grado_numero);
  const total = lista.reduce(
    (t, f) => ({ promovidos: sumarConteos(t.promovidos, f.promovidos), no_promovidos: sumarConteos(t.no_promovidos, f.no_promovidos), desertores: sumarConteos(t.desertores, f.desertores), sin_resultado: t.sin_resultado + f.sin_resultado }),
    { promovidos: conteoVacio(), no_promovidos: conteoVacio(), desertores: conteoVacio(), sin_resultado: 0 }
  );
  return { filas: lista, total };
}

// --- Sección 4: distribución por edad y grado ---

export interface FilaEdad {
  clave: string;
  etiqueta: string;
  /** Por id de grado. */
  celdas: Record<string, ConteoSexo>;
  total: ConteoSexo;
}

/**
 * Los matriculados al cierre por edad cumplida a la fecha de corte, por grado y sexo. Siempre salen las edades de 4 a 18 o más (aunque estén en cero, como en el
 * formulario); «Menos de 4» solo si hay alguien. Quien no tiene fecha de nacimiento no entra y se cuenta aparte.
 */
export function armarEdades(grados: readonly GradoDelDashboard[], matriculas: readonly MatriculaC600[], corte: Date): { filas: FilaEdad[]; total_por_grado: Record<string, ConteoSexo>; sin_fecha_nacimiento: number } {
  const claves: string[] = [];
  for (let e = EDAD_MINIMA; e < EDAD_MAXIMA; e++) claves.push(String(e));
  claves.push(`${EDAD_MAXIMA}+`);

  const gradosIds = grados.map((g) => g.grado_id);
  const nuevaFila = (clave: string): FilaEdad => ({ clave, etiqueta: etiquetaDeEdad(clave), celdas: Object.fromEntries(gradosIds.map((id) => [id, conteoVacio()])), total: conteoVacio() });
  const filas = new Map<string, FilaEdad>(claves.map((c) => [c, nuevaFila(c)]));
  const totalPorGrado: Record<string, ConteoSexo> = Object.fromEntries(gradosIds.map((id) => [id, conteoVacio()]));
  let sinFecha = 0;

  for (const m of matriculas) {
    if (m.situacion !== 'ACTIVA' || !gradosIds.includes(m.grado_id)) continue;
    if (!m.nacimiento) {
      sinFecha += 1;
      continue;
    }
    const clave = claveDeEdad(edadCumplida(m.nacimiento, corte));
    const fila = filas.get(clave) ?? nuevaFila(clave);
    filas.set(clave, fila);
    sumar(fila.celdas[m.grado_id] as ConteoSexo, m.sexo);
    sumar(fila.total, m.sexo);
    sumar(totalPorGrado[m.grado_id] as ConteoSexo, m.sexo);
  }

  const ordenadas = [...filas.values()].filter((f) => f.clave !== '<4' || f.total.total > 0).sort((a, b) => ordenDeEdad(a.clave) - ordenDeEdad(b.clave));
  return { filas: ordenadas, total_por_grado: totalPorGrado, sin_fecha_nacimiento: sinFecha };
}

const ordenDeEdad = (clave: string): number => (clave === '<4' ? -1 : clave === `${EDAD_MAXIMA}+` ? EDAD_MAXIMA : Number(clave));

/** ¿Alguien quedó en «Otro / sin dato»? Solo entonces el reporte agrega esa columna (el formulario solo trae Hombres y Mujeres). */
export function hayOtroSinDato(resultados: { total: Omit<FilaResultados, 'grado_id' | 'grado' | 'grado_numero'> }, edades: { total_por_grado: Record<string, ConteoSexo> }): boolean {
  const r = resultados.total;
  return r.promovidos.O + r.no_promovidos.O + r.desertores.O > 0 || Object.values(edades.total_por_grado).some((c) => c.O > 0);
}

/** El día de calendario (UTC) de una fecha, como `AAAA-MM-DD`. */
export const aFechaIso = (d: Date): string => d.toISOString().slice(0, 10);

/** Un día de calendario `AAAA-MM-DD` como fecha a medianoche UTC; `null` si no es una fecha válida. */
export function desdeFechaIso(texto: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  const d = new Date(`${texto}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || aFechaIso(d) !== texto ? null : d;
}

