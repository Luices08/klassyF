import { NIVELES_DESEMPENO, NivelDesempeno } from '../constants/enums';
import { RESULTADOS_APROBATORIOS } from '../constants/dashboard';
import type { IEscalaEvaluacion } from '../models/academicYear.model';
import { resolverDesempeno } from './escalaEvaluacion';

/**
 * Cálculos de los dashboards de rectoría y coordinación (M30). Son puros: reciben conteos ya leídos de M05, M12, M13, M18 y M19 y devuelven lo que
 * la pantalla dibuja. Ninguna regla de negocio nueva vive aquí; solo se agrupa y se saca el porcentaje.
 */

const redondear = (n: number, decimales = 1): number => {
  const f = 10 ** decimales;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/** Porcentaje de `parte` sobre `total`, o `null` cuando no hay nada que medir (un 0 % engañaría: no es lo mismo «ninguno» que «sin datos»). */
export function porcentaje(parte: number, total: number, decimales = 1): number | null {
  return total > 0 ? redondear((parte / total) * 100, decimales) : null;
}

/**
 * El periodo «en curso» (el de las planillas que los docentes están entregando): el pedido si existe; si no, el que está en digitación; si no, el
 * abierto (en ambos casos el más reciente); si todos están cerrados, el último; y si aún nada empezó, el primero.
 */
export function elegirPeriodoEnCurso(solicitado: number | undefined, periodos: ReadonlyArray<{ numero: number; estado: string }>): number {
  if (solicitado !== undefined && periodos.some((p) => p.numero === solicitado)) return solicitado;
  const ultimoEn = (estado: string) => Math.max(0, ...periodos.filter((p) => p.estado === estado).map((p) => p.numero));
  const enDigitacion = ultimoEn('EN_DIGITACION');
  if (enDigitacion > 0) return enDigitacion;
  const abierto = ultimoEn('ABIERTO');
  if (abierto > 0) return abierto;
  const cerrado = ultimoEn('CERRADO');
  if (cerrado > 0) return cerrado;
  return periodos.length > 0 ? Math.min(...periodos.map((p) => p.numero)) : 1;
}

/** El periodo cuyas notas cerradas miden el rendimiento: el pedido si existe; si no, el último que ya tiene notas cerradas; y si ninguno, el primero del año. */
export function elegirPeriodoDeReferencia(solicitado: number | undefined, periodosDelAnio: readonly number[], conNotasCerradas: readonly number[]): number {
  if (solicitado !== undefined && periodosDelAnio.includes(solicitado)) return solicitado;
  const cerrados = conNotasCerradas.filter((p) => periodosDelAnio.includes(p));
  if (cerrados.length > 0) return Math.max(...cerrados);
  return periodosDelAnio.length > 0 ? Math.min(...periodosDelAnio) : 1;
}

// --- Matrícula y cupos ---

export interface ResumenCupos {
  matriculados: number;
  capacidad: number;
  disponibles: number;
  ocupacion_pct: number | null;
}

export function resumirCupos(matriculados: number, capacidad: number): ResumenCupos {
  return { matriculados, capacidad, disponibles: Math.max(0, capacidad - matriculados), ocupacion_pct: porcentaje(matriculados, capacidad) };
}

// --- Eficiencia interna por grado ---

export type ClasificacionEstudiante = 'PROMOVIDO' | 'NO_PROMOVIDO' | 'PENDIENTE' | 'SIN_PERDIDAS' | 'CON_PERDIDAS' | 'SIN_NOTAS';

export interface EntradaClasificacion {
  /** El resultado del cierre vigente de M19, o `null` si el estudiante aún no tiene cierre. */
  resultado_oficial: string | null;
  /** Asignaturas perdidas en el periodo de referencia (notas cerradas), o `null` si no tiene ninguna nota cerrada. */
  perdidas: number | null;
  /** Preescolar: nadie reprueba (Decreto 2247/1997), así que se cuenta como promovido sin mirar notas. */
  sin_reprobacion: boolean;
}

/**
 * Dónde cae un estudiante en la matriz de eficiencia. Con cierre oficial manda el cierre; sin él solo se puede decir si va sin asignaturas
 * perdidas o con ellas al periodo de referencia, que **no** es reprobar el año (aún falta recuperación), por eso son categorías aparte.
 */
export function clasificarEstudiante(e: EntradaClasificacion): ClasificacionEstudiante {
  if (e.sin_reprobacion) return 'PROMOVIDO';
  if (e.resultado_oficial !== null) {
    if ((RESULTADOS_APROBATORIOS as readonly string[]).includes(e.resultado_oficial)) return 'PROMOVIDO';
    if (e.resultado_oficial === 'NO_PROMOVIDO') return 'NO_PROMOVIDO';
    return 'PENDIENTE';
  }
  if (e.perdidas === null) return 'SIN_NOTAS';
  return e.perdidas === 0 ? 'SIN_PERDIDAS' : 'CON_PERDIDAS';
}

export interface FilaEficiencia {
  grado_id: string;
  grado: string;
  grado_numero: number;
  nivel?: string;
  matriculados: number;
  /** Matrículas RETIRADO del año (retiro o traslado hacia otro colegio): el sistema no distingue la deserción del retiro, así que se cuentan juntas. */
  retirados: number;
  promovidos: number;
  no_promovidos: number;
  pendientes: number;
  sin_perdidas: number;
  con_perdidas: number;
  sin_notas: number;
}

export interface EstudianteParaEficiencia {
  grado_id: string;
  clasificacion: ClasificacionEstudiante;
}

const CAMPO_DE_CLASIFICACION: Record<ClasificacionEstudiante, 'promovidos' | 'no_promovidos' | 'pendientes' | 'sin_perdidas' | 'con_perdidas' | 'sin_notas'> = {
  PROMOVIDO: 'promovidos',
  NO_PROMOVIDO: 'no_promovidos',
  PENDIENTE: 'pendientes',
  SIN_PERDIDAS: 'sin_perdidas',
  CON_PERDIDAS: 'con_perdidas',
  SIN_NOTAS: 'sin_notas',
};

export interface GradoDelDashboard {
  grado_id: string;
  grado: string;
  grado_numero: number;
  nivel?: string;
}

/** Una fila por grado ofrecido (en orden de grado, también los que no tienen estudiantes) con los conteos de matrícula, retiro y resultado. */
export function resumirEficienciaPorGrado(grados: readonly GradoDelDashboard[], estudiantes: readonly EstudianteParaEficiencia[], retiradosPorGrado: ReadonlyMap<string, number>): FilaEficiencia[] {
  const filas = new Map<string, FilaEficiencia>(
    grados.map((g) => [g.grado_id, { ...g, matriculados: 0, retirados: retiradosPorGrado.get(g.grado_id) ?? 0, promovidos: 0, no_promovidos: 0, pendientes: 0, sin_perdidas: 0, con_perdidas: 0, sin_notas: 0 }])
  );
  for (const e of estudiantes) {
    const fila = filas.get(e.grado_id);
    if (!fila) continue;
    fila.matriculados += 1;
    fila[CAMPO_DE_CLASIFICACION[e.clasificacion]] += 1;
  }
  return [...filas.values()].sort((a, b) => a.grado_numero - b.grado_numero);
}

export type ModoRendimiento = 'OFICIAL' | 'PROVISIONAL' | 'SIN_DATOS';

export interface ResumenRendimiento {
  modo: ModoRendimiento;
  /** OFICIAL: promovidos sobre quienes ya tienen resultado final. PROVISIONAL: estudiantes sin asignaturas perdidas al periodo de referencia. */
  aprobacion_pct: number | null;
  /** OFICIAL: no promovidos. PROVISIONAL: estudiantes con asignaturas perdidas o esperando recuperación o comisión (todavía pueden recuperar: no es reprobar el año). */
  reprobacion_pct: number | null;
  base: number;
}

/**
 * El «% de aprobación» institucional. Cuando todos tienen resultado final (cierre de M19) es el oficial; mientras tanto es una lectura provisional
 * y lo dice (`modo`), porque con el año en curso nadie ha aprobado ni reprobado todavía.
 */
export function resumirRendimiento(filas: readonly FilaEficiencia[]): ResumenRendimiento {
  const suma = (campo: 'matriculados' | 'promovidos' | 'no_promovidos' | 'pendientes' | 'sin_perdidas' | 'con_perdidas') => filas.reduce((s, f) => s + f[campo], 0);
  const matriculados = suma('matriculados');
  const promovidos = suma('promovidos');
  const noPromovidos = suma('no_promovidos');
  if (matriculados === 0) return { modo: 'SIN_DATOS', aprobacion_pct: null, reprobacion_pct: null, base: 0 };

  if (promovidos + noPromovidos === matriculados) {
    return { modo: 'OFICIAL', aprobacion_pct: porcentaje(promovidos, matriculados), reprobacion_pct: porcentaje(noPromovidos, matriculados), base: matriculados };
  }
  // Provisional: los ya promovidos o sin asignaturas perdidas suman a quienes van bien; los no promovidos, los que tienen asignaturas perdidas y los que
  // esperan recuperación o comisión (perdieron algo y aún no se resuelve), a quienes tienen algo por resolver. Quien no tiene notas no entra a la base.
  const bien = promovidos + suma('sin_perdidas');
  const mal = noPromovidos + suma('con_perdidas') + suma('pendientes');
  const base = bien + mal;
  if (base === 0) return { modo: 'SIN_DATOS', aprobacion_pct: null, reprobacion_pct: null, base: 0 };
  return { modo: 'PROVISIONAL', aprobacion_pct: porcentaje(bien, base), reprobacion_pct: porcentaje(mal, base), base };
}

// --- Morbilidad académica ---

export interface ConteoDeReprobacionPorAsignatura {
  clave: string;
  nombre: string;
  area: string;
  evaluados: number;
  reprobados: number;
}

export interface FilaMorbilidad extends ConteoDeReprobacionPorAsignatura {
  porcentaje: number;
}

function ordenarMorbilidad(filas: FilaMorbilidad[], limite: number): FilaMorbilidad[] {
  return filas.sort((a, b) => b.porcentaje - a.porcentaje || b.reprobados - a.reprobados || a.nombre.localeCompare(b.nombre, 'es')).slice(0, limite);
}

/** Las asignaturas con más reprobación. Se descartan las de muy pocos evaluados (el mínimo lo fija el colegio en M20) para no alertar por ruido. */
export function rankingMorbilidadPorAsignatura(conteos: readonly ConteoDeReprobacionPorAsignatura[], minimoEvaluados: number, limite: number): FilaMorbilidad[] {
  const filas = conteos
    .filter((c) => c.evaluados >= Math.max(1, minimoEvaluados) && c.reprobados > 0)
    .map((c) => ({ ...c, porcentaje: porcentaje(c.reprobados, c.evaluados) ?? 0 }));
  return ordenarMorbilidad(filas, limite);
}

/** Lo mismo agrupado por área: suma las asignaturas de cada una. */
export function rankingMorbilidadPorArea(conteos: readonly ConteoDeReprobacionPorAsignatura[], minimoEvaluados: number, limite: number): FilaMorbilidad[] {
  const porArea = new Map<string, ConteoDeReprobacionPorAsignatura>();
  for (const c of conteos) {
    const acumulado = porArea.get(c.area) ?? { clave: c.area, nombre: c.area, area: c.area, evaluados: 0, reprobados: 0 };
    acumulado.evaluados += c.evaluados;
    acumulado.reprobados += c.reprobados;
    porArea.set(c.area, acumulado);
  }
  return rankingMorbilidadPorAsignatura([...porArea.values()], minimoEvaluados, limite);
}

// --- Entrega de notas ---

export interface ClaseParaAvance {
  docente_id: string;
  docente: string;
  asignatura: string;
  grupo: string;
  estudiantes: number;
  /** Estudiantes con la nota de esta clase ya cerrada o definitiva. */
  cerradas: number;
  estado: 'ABIERTA' | 'CERRADA' | 'DEFINITIVA';
}

export interface AvancePlanillas {
  clases_total: number;
  clases_cerradas: number;
  clases_pct: number | null;
  notas_esperadas: number;
  notas_cerradas: number;
  notas_pct: number | null;
}

/** El avance global de la entrega de notas: cuántas planillas (clase y periodo) ya cerraron sus docentes y cuántas notas de estudiantes hay cerradas. */
export function resumirAvancePlanillas(clases: readonly ClaseParaAvance[]): AvancePlanillas {
  const cerradas = clases.filter((c) => c.estado !== 'ABIERTA').length;
  const esperadas = clases.reduce((s, c) => s + c.estudiantes, 0);
  const notas = clases.reduce((s, c) => s + Math.min(c.cerradas, c.estudiantes), 0);
  return { clases_total: clases.length, clases_cerradas: cerradas, clases_pct: porcentaje(cerradas, clases.length), notas_esperadas: esperadas, notas_cerradas: notas, notas_pct: porcentaje(notas, esperadas) };
}

export interface DocentePendiente {
  docente_id: string;
  docente: string;
  pendientes: number;
  clases: Array<{ asignatura: string; grupo: string; cerradas: number; estudiantes: number }>;
}

/** Los docentes con alguna planilla sin cerrar, el que más debe primero. `clases` se recorta para que la tarjeta no crezca sin límite. */
export function agruparDocentesPendientes(clases: readonly ClaseParaAvance[], limiteDocentes: number, limiteClases = 5): { total: number; docentes: DocentePendiente[] } {
  const porDocente = new Map<string, DocentePendiente>();
  for (const c of clases) {
    if (c.estado !== 'ABIERTA') continue;
    const d = porDocente.get(c.docente_id) ?? { docente_id: c.docente_id, docente: c.docente, pendientes: 0, clases: [] };
    d.pendientes += 1;
    d.clases.push({ asignatura: c.asignatura, grupo: c.grupo, cerradas: c.cerradas, estudiantes: c.estudiantes });
    porDocente.set(c.docente_id, d);
  }
  const todos = [...porDocente.values()].sort((a, b) => b.pendientes - a.pendientes || a.docente.localeCompare(b.docente, 'es'));
  return { total: todos.length, docentes: todos.slice(0, limiteDocentes).map((d) => ({ ...d, clases: d.clases.slice(0, limiteClases) })) };
}

// --- Desempeño ---

export interface FilaDesempeno {
  nivel: NivelDesempeno;
  etiqueta: string;
  total: number;
  porcentaje: number | null;
}

/**
 * La proporción de notas por nivel de la escala nacional. Los niveles y sus cortes salen de la escala del año lectivo (nunca fijos). Una nota
 * fuera de la escala se omite en lugar de romper el cálculo. Van del más alto al más bajo, como se suele leer.
 */
export function distribucionDesempeno(conteos: ReadonlyArray<{ nota: number; total: number }>, escala: IEscalaEvaluacion): { total: number; niveles: FilaDesempeno[] } {
  const totales = new Map<NivelDesempeno, number>(NIVELES_DESEMPENO.map((n) => [n, 0]));
  let total = 0;
  for (const c of conteos) {
    try {
      const { nivel } = resolverDesempeno(c.nota, escala);
      totales.set(nivel, (totales.get(nivel) ?? 0) + c.total);
      total += c.total;
    } catch {
      continue;
    }
  }
  const etiqueta = (nivel: NivelDesempeno) => escala.rangos.find((r) => r.nivel === nivel)?.etiqueta ?? nivel;
  const orden: NivelDesempeno[] = ['SUPERIOR', 'ALTO', 'BASICO', 'BAJO'];
  return { total, niveles: orden.map((nivel) => ({ nivel, etiqueta: etiqueta(nivel), total: totales.get(nivel) ?? 0, porcentaje: porcentaje(totales.get(nivel) ?? 0, total) })) };
}

// --- Comparativo por grupos ---

export interface PromedioDeGrupo {
  grupo_id: string;
  etiqueta: string;
  grado_id: string;
  grado: string;
  grado_numero: number;
  /** Promedio de las notas de asignatura cerradas del grupo. */
  promedio: number | null;
  notas: number;
}

export interface ComparativoDeGrado {
  grado_id: string;
  grado: string;
  grado_numero: number;
  grupos: Array<{ grupo_id: string; etiqueta: string; promedio: number | null; notas: number }>;
  /** Diferencia entre el mejor y el peor promedio del grado; `null` si hay menos de dos grupos con notas. */
  brecha: number | null;
}

/** Agrupa los promedios por grado para compararlos entre sí (8-A contra 8-B). Un grado con un solo grupo no tiene con quién compararse y no sale. */
export function compararGruposPorGrado(grupos: readonly PromedioDeGrupo[]): ComparativoDeGrado[] {
  const porGrado = new Map<string, ComparativoDeGrado>();
  for (const g of grupos) {
    const grado = porGrado.get(g.grado_id) ?? { grado_id: g.grado_id, grado: g.grado, grado_numero: g.grado_numero, grupos: [], brecha: null };
    grado.grupos.push({ grupo_id: g.grupo_id, etiqueta: g.etiqueta, promedio: g.promedio === null ? null : redondear(g.promedio, 2), notas: g.notas });
    porGrado.set(g.grado_id, grado);
  }
  return [...porGrado.values()]
    .filter((g) => g.grupos.length > 1)
    .map((g) => {
      const promedios = g.grupos.map((x) => x.promedio).filter((p): p is number => p !== null);
      return {
        ...g,
        grupos: g.grupos.sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es')),
        brecha: promedios.length > 1 ? redondear(Math.max(...promedios) - Math.min(...promedios), 2) : null,
      };
    })
    .sort((a, b) => a.grado_numero - b.grado_numero);
}

// --- Servicio social ---

export interface ResumenServicioSocial {
  estudiantes: number;
  aprobados: number;
  pendientes: number;
  /** El colegio apagó la exigencia de horas: no hay Aprobado ni Pendiente que contar. */
  sin_exigencia: boolean;
  horas_por_verificar: number;
}

export function resumirServicioSocial(filas: ReadonlyArray<{ estado: string; por_verificar: number }>): ResumenServicioSocial {
  return {
    estudiantes: filas.length,
    aprobados: filas.filter((f) => f.estado === 'Aprobado').length,
    pendientes: filas.filter((f) => f.estado === 'Pendiente').length,
    sin_exigencia: filas.length > 0 && filas.every((f) => f.estado === 'No se exige'),
    horas_por_verificar: redondear(filas.reduce((s, f) => s + f.por_verificar, 0), 2),
  };
}
