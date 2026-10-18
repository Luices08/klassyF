import { MomentoPromocion } from '../constants/promocion';
import { AreaEntrada, AsignaturaEntrada, EntradaPromocion, PoliticaPromocion } from './promocion';

/** Un estudiante hipotético para probar la política sin tocar datos reales («Pruébalo» de la pantalla). */
export interface CasoSimulado {
  /** Asignaturas perdidas (con unidad ÁREA se ignora: se cuentan las áreas). */
  perdidas_asignaturas: number;
  /** Áreas perdidas (con unidad ASIGNATURA se ignora). */
  perdidas_areas: number;
  /** Entre lo perdido hay una materia (o área) imprescindible de la política. */
  incluye_imprescindible: boolean;
  /** % de inasistencia del año (se toma igual como total e injustificada). */
  inasistencia_pct: number;
  tiene_piar: boolean;
  momento: MomentoPromocion;
}

/** Lo que de M18 hace falta cuando la política aún no define el tope de recuperación. */
export interface RecuperacionAnualVigente {
  aplica: boolean;
  max_asignaturas_pendientes: number;
}

const NOTA_PERDIDA = 1;
const NOTA_APROBADA = 4;

/**
 * Arma la entrada del motor para un caso hipotético. Pura. Cada asignatura perdida pertenece a su propia área; con unidad `AMBAS` las áreas
 * perdidas son las primeras (las demás áreas aprueban aunque tengan una asignatura perdida, salvo que la política lo cambie).
 * Las imprescindibles se simulan con el primer id marcado en la política; sin ninguno marcado el caso no puede incluirlas.
 */
export function entradaDeCasoSimulado(caso: CasoSimulado, p: PoliticaPromocion, recuperacion: RecuperacionAnualVigente, notaAprobatoria: number): EntradaPromocion {
  const conAsignaturas = p.unidad !== 'AREA';
  const conAreas = p.unidad !== 'ASIGNATURA';
  const criticaAsignatura = conAsignaturas && p.asignaturas_criticas_ids[0];
  const criticaArea = conAreas && p.areas_criticas_ids[0];

  // Con unidad ÁREA cada área perdida lleva su asignatura perdida (así «perder una materia del área» también se puede probar).
  // Perder una imprescindible implica haber perdido al menos una unidad.
  const piso = (n: number, hay: unknown) => (caso.incluye_imprescindible && hay ? Math.max(n, 1) : n);
  const nAsignaturas = p.unidad === 'AREA' ? piso(caso.perdidas_areas, criticaArea) : piso(caso.perdidas_asignaturas, criticaAsignatura);
  const nAreas = p.unidad === 'ASIGNATURA' ? nAsignaturas : piso(caso.perdidas_areas, criticaArea);

  const areas: AreaEntrada[] = [];
  const nuevaArea = (id: string, perdida: boolean): AreaEntrada => ({ area_id: id, nombre: id, nota_antes: perdida ? NOTA_PERDIDA : NOTA_APROBADA, nota_final: perdida ? NOTA_PERDIDA : NOTA_APROBADA, recuperacion: null });
  for (let i = 0; i < nAreas; i += 1) areas.push(nuevaArea(i === 0 && caso.incluye_imprescindible && criticaArea ? (criticaArea as string) : `sim-area-${i}`, true));

  const asignaturas: AsignaturaEntrada[] = [];
  for (let i = 0; i < nAsignaturas; i += 1) {
    const areaId = areas[i]?.area_id ?? `sim-area-ok-${i}`;
    if (!areas.some((a) => a.area_id === areaId)) areas.push(nuevaArea(areaId, p.unidad === 'ASIGNATURA'));
    asignaturas.push({
      subject_id: i === 0 && caso.incluye_imprescindible && criticaAsignatura ? (criticaAsignatura as string) : `sim-asignatura-${i}`,
      area_id: areaId,
      nombre: `Materia ${i + 1}`,
      nota_antes: NOTA_PERDIDA,
      nota_final: NOTA_PERDIDA,
      recuperacion: null,
      inasistencia_total_pct: caso.inasistencia_pct,
      inasistencia_injustificada_pct: caso.inasistencia_pct,
    });
  }

  const hasta = p.umbrales?.recuperacion_hasta ?? null;
  return {
    grado_id: 'sim-grado',
    nivel: 'SECUNDARIA',
    nota_aprobatoria: notaAprobatoria,
    asignaturas,
    areas,
    promedio_general: asignaturas.length > 0 ? NOTA_PERDIDA : NOTA_APROBADA,
    inasistencia_global_total_pct: caso.inasistencia_pct,
    inasistencia_global_injustificada_pct: caso.inasistencia_pct,
    faltas_por_gravedad: {},
    tiene_piar: caso.tiene_piar,
    admite_recuperacion_final: hasta !== null ? hasta > 0 : recuperacion.aplica,
    max_recuperables: hasta !== null ? hasta : recuperacion.max_asignaturas_pendientes,
  };
}
