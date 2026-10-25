/**
 * Riesgo de no promoción derivado de las probabilidades por asignatura y de la política del colegio. No se adivina un umbral: se simula
 * el cierre del año muchas veces (cada asignatura se pierde o no según su probabilidad) y cada simulación pasa por el MISMO motor de
 * promoción de M19 (`evaluarPromocion`), con sus umbrales, imprescindibles, críticas y reglas propias. Pura y con semilla fija: los
 * mismos datos dan siempre la misma cifra.
 *
 * Aproximaciones (dichas aquí para no leerlas como exactas): las asignaturas se tratan como independientes; una perdida toma una nota
 * a mitad de camino entre la mínima y la aprobatoria y una aprobada, entre la aprobatoria y la máxima; el área promedia sus asignaturas
 * por igual (no con las ponderaciones de M06), y el PIAR no se mira (es dato reservado de M16).
 */
import { MOMENTOS_PROMOCION, ResultadoPromocion } from '../../../constants/promocion';
import { AsignaturaEntrada, EntradaPromocion, evaluarPromocion, PoliticaPromocion } from '../../../utils/promocion';
import { SIMULACIONES_PROMOCION } from '../constants/predictivo';

export interface AsignaturaConRiesgo {
  subject_id: string;
  area_id: string;
  nombre: string;
  probabilidad: number;
  inasistencia_total_pct: number;
  inasistencia_injustificada_pct: number;
}

export interface BaseRiesgo {
  grado_id: string;
  nivel: string;
  escala: { minima: number; maxima: number; aprobatoria: number };
  inasistencia_global_total_pct: number;
  inasistencia_global_injustificada_pct: number;
  faltas_por_gravedad: Record<string, number>;
  admite_recuperacion_final: boolean;
  max_recuperables: number;
}

export interface RiesgoPromocion {
  /** Fracción de simulaciones que terminan en cada situación al cierre del año (antes de la recuperación final). */
  no_promovido: number;
  recuperacion: number;
  comision: number;
  promovido: number;
  /** Cuántas asignaturas se espera que pierda (suma de probabilidades). */
  perdidas_esperadas: number;
  simulaciones: number;
}

/** Generador con semilla (mulberry32): rápido, sin dependencias y reproducible. */
export function generador(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOMENTO_CIERRE: (typeof MOMENTOS_PROMOCION)[number] = 'CIERRE';

function clasificar(r: ResultadoPromocion): keyof Omit<RiesgoPromocion, 'perdidas_esperadas' | 'simulaciones'> {
  if (r === 'NO_PROMOVIDO' || r === 'RETIRO_PROPUESTO') return 'no_promovido';
  if (r === 'PENDIENTE_RECUPERACION') return 'recuperacion';
  if (r === 'EN_COMISION' || r === 'INCOMPLETO') return 'comision';
  return 'promovido';
}

export function riesgoDePromocion(asignaturas: readonly AsignaturaConRiesgo[], base: BaseRiesgo, politica: PoliticaPromocion, simulaciones = SIMULACIONES_PROMOCION): RiesgoPromocion {
  const { minima, maxima, aprobatoria } = base.escala;
  const notaPerdida = (minima + aprobatoria) / 2;
  const notaAprobada = (aprobatoria + maxima) / 2;
  const azar = generador(20260901);
  const conteo = { no_promovido: 0, recuperacion: 0, comision: 0, promovido: 0 };

  for (let s = 0; s < simulaciones; s += 1) {
    const filas: AsignaturaEntrada[] = asignaturas.map((a) => {
      const nota = azar() < a.probabilidad ? notaPerdida : notaAprobada;
      return {
        subject_id: a.subject_id,
        area_id: a.area_id,
        nombre: a.nombre,
        nota_antes: nota,
        nota_final: nota,
        recuperacion: null,
        inasistencia_total_pct: a.inasistencia_total_pct,
        inasistencia_injustificada_pct: a.inasistencia_injustificada_pct,
      };
    });
    const porArea = new Map<string, number[]>();
    for (const f of filas) porArea.set(f.area_id, [...(porArea.get(f.area_id) ?? []), f.nota_antes as number]);
    const entrada: EntradaPromocion = {
      grado_id: base.grado_id,
      nivel: base.nivel,
      nota_aprobatoria: aprobatoria,
      asignaturas: filas,
      areas: [...porArea.entries()].map(([areaId, notas]) => {
        const nota = notas.reduce((x, y) => x + y, 0) / notas.length;
        return { area_id: areaId, nombre: areaId, nota_antes: nota, nota_final: nota, recuperacion: null };
      }),
      promedio_general: filas.length === 0 ? null : filas.reduce((x, f) => x + (f.nota_antes as number), 0) / filas.length,
      inasistencia_global_total_pct: base.inasistencia_global_total_pct,
      inasistencia_global_injustificada_pct: base.inasistencia_global_injustificada_pct,
      faltas_por_gravedad: base.faltas_por_gravedad,
      tiene_piar: false,
      admite_recuperacion_final: base.admite_recuperacion_final,
      max_recuperables: base.max_recuperables,
    };
    conteo[clasificar(evaluarPromocion(entrada, politica, MOMENTO_CIERRE).resultado)] += 1;
  }

  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  return {
    no_promovido: r4(conteo.no_promovido / simulaciones),
    recuperacion: r4(conteo.recuperacion / simulaciones),
    comision: r4(conteo.comision / simulaciones),
    promovido: r4(conteo.promovido / simulaciones),
    perdidas_esperadas: r4(asignaturas.reduce((x, a) => x + a.probabilidad, 0)),
    simulaciones,
  };
}
