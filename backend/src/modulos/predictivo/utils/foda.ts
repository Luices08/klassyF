/**
 * El análisis FODA (fortalezas, oportunidades, debilidades, amenazas) de un estudiante y de cada asignatura. Los textos son datos
 * (`PLANTILLAS_FODA`, con marcas `{asignatura}`, `{nota}`…); lo que decide si una frase aplica está aquí, por su clave. Las frases están
 * en tercera persona y sin juicios: las lee el propio estudiante, su familia y el personal. Lo de convivencia solo sale a quien puede verlo
 * (audiencia `CONVIVENCIA`); para los demás la convivencia pesa en el cálculo pero no se nombra. Pura.
 */
import { NivelRiesgo } from '../constants/predictivo';
import { NotaRequerida } from './notaRequerida';

export type CuadranteFoda = 'FORTALEZA' | 'OPORTUNIDAD' | 'DEBILIDAD' | 'AMENAZA';
export type AudienciaFoda = 'TODOS' | 'CONVIVENCIA';

export interface PlantillaFoda {
  clave: string;
  cuadrante: CuadranteFoda;
  alcance: 'ASIGNATURA' | 'GENERAL';
  audiencia: AudienciaFoda;
  texto: string;
}

export const PLANTILLAS_FODA: readonly PlantillaFoda[] = [
  { clave: 'NOTA_ALTA', cuadrante: 'FORTALEZA', alcance: 'ASIGNATURA', audiencia: 'TODOS', texto: 'Su promedio en {asignatura} es {nota} (desempeño {desempeno}).' },
  { clave: 'TENDENCIA_SUBE', cuadrante: 'FORTALEZA', alcance: 'ASIGNATURA', audiencia: 'TODOS', texto: 'Ha mejorado en {asignatura} de un periodo a otro.' },
  { clave: 'ENTREGA_TODO', cuadrante: 'FORTALEZA', alcance: 'ASIGNATURA', audiencia: 'TODOS', texto: 'Ha entregado todas las actividades de {asignatura}.' },
  { clave: 'ASISTE_SIEMPRE', cuadrante: 'FORTALEZA', alcance: 'ASIGNATURA', audiencia: 'TODOS', texto: 'No tiene fallas sin excusa en {asignatura}.' },
  { clave: 'NOTA_BAJA', cuadrante: 'DEBILIDAD', alcance: 'ASIGNATURA', audiencia: 'TODOS', texto: 'Su promedio en {asignatura} es {nota}, por debajo de la nota aprobatoria ({aprobatoria}).' },
  { clave: 'TENDENCIA_BAJA', cuadrante: 'DEBILIDAD', alcance: 'ASIGNATURA', audiencia: 'TODOS', texto: 'Su nota en {asignatura} bajó del primer periodo al último.' },
  { clave: 'NO_ENTREGAS', cuadrante: 'DEBILIDAD', alcance: 'ASIGNATURA', audiencia: 'TODOS', texto: 'No entregó {no_entregadas} de {actividades} de {asignatura}.' },
  { clave: 'INASISTENCIA', cuadrante: 'DEBILIDAD', alcance: 'ASIGNATURA', audiencia: 'TODOS', texto: 'Faltó sin excusa a {fallas} de {asignatura} ({pct} %).' },
  { clave: 'ALCANZABLE', cuadrante: 'OPORTUNIDAD', alcance: 'ASIGNATURA', audiencia: 'TODOS', texto: 'Para aprobar {asignatura} le basta un promedio de {requerida} en {restantes}.' },
  { clave: 'ASEGURADA', cuadrante: 'OPORTUNIDAD', alcance: 'ASIGNATURA', audiencia: 'TODOS', texto: 'Con lo que lleva, aprobaría {asignatura} aun con la nota mínima en lo que falta.' },
  { clave: 'ANIO_ANTERIOR_BUENO', cuadrante: 'OPORTUNIDAD', alcance: 'ASIGNATURA', audiencia: 'TODOS', texto: 'El año anterior le fue bien en esta asignatura: es una base para apoyarse.' },
  { clave: 'RIESGO_ALTO', cuadrante: 'AMENAZA', alcance: 'ASIGNATURA', audiencia: 'TODOS', texto: 'Si sigue así, es probable que pierda {asignatura}.' },
  { clave: 'RIESGO_MEDIO', cuadrante: 'AMENAZA', alcance: 'ASIGNATURA', audiencia: 'TODOS', texto: 'Hay riesgo de perder {asignatura}: conviene reforzarla.' },
  { clave: 'NO_ALCANZA', cuadrante: 'AMENAZA', alcance: 'ASIGNATURA', audiencia: 'TODOS', texto: 'Aun con la nota máxima en lo que falta no alcanzaría a aprobar {asignatura}: tendrá que presentar la recuperación.' },
  { clave: 'PERDIDA', cuadrante: 'AMENAZA', alcance: 'ASIGNATURA', audiencia: 'TODOS', texto: 'Perdió {asignatura} en el año (definitiva {definitiva}).' },

  { clave: 'GEN_PROMEDIO_ALTO', cuadrante: 'FORTALEZA', alcance: 'GENERAL', audiencia: 'TODOS', texto: 'Su promedio general es {promedio} (desempeño {desempeno}).' },
  { clave: 'GEN_ASEGURADAS', cuadrante: 'FORTALEZA', alcance: 'GENERAL', audiencia: 'TODOS', texto: 'Con lo que lleva ya tiene asegurado aprobar: {aseguradas}.' },
  { clave: 'GEN_SIN_PERDIDAS', cuadrante: 'FORTALEZA', alcance: 'GENERAL', audiencia: 'TODOS', texto: 'No tiene asignaturas por debajo de la aprobatoria en los periodos cerrados.' },
  { clave: 'GEN_PERDIDAS', cuadrante: 'DEBILIDAD', alcance: 'GENERAL', audiencia: 'TODOS', texto: 'Va perdiendo {perdidas} en los periodos cerrados.' },
  { clave: 'GEN_INASISTENCIA', cuadrante: 'DEBILIDAD', alcance: 'GENERAL', audiencia: 'TODOS', texto: 'Faltó sin excusa al {pct} % de sus clases.' },
  { clave: 'GEN_RECUPERABLES', cuadrante: 'OPORTUNIDAD', alcance: 'GENERAL', audiencia: 'TODOS', texto: 'Las asignaturas en riesgo aún se pueden aprobar en los periodos que faltan: {asignaturas}.' },
  { clave: 'GEN_RIESGO_NO_PROMOCION', cuadrante: 'AMENAZA', alcance: 'GENERAL', audiencia: 'TODOS', texto: 'Con su rendimiento actual hay riesgo de no ser promovido al grado siguiente.' },
  { clave: 'GEN_RIESGO_RECUPERACION', cuadrante: 'AMENAZA', alcance: 'GENERAL', audiencia: 'TODOS', texto: 'Con su rendimiento actual es probable que tenga que presentar la recuperación final.' },
  { clave: 'GEN_CONVIVENCIA', cuadrante: 'AMENAZA', alcance: 'GENERAL', audiencia: 'CONVIVENCIA', texto: 'Tiene {faltas} de convivencia Tipo II o III este año.' },
];

/** Umbrales de presentación del FODA (cuándo una frase vale la pena), no de la evaluación: esa es del colegio. */
export const UMBRALES_FODA = {
  /** % de inasistencia sin excusa que se menciona (por asignatura y en general). */
  inasistencia: 0.1,
  /** Fracción de actividades sin entregar que se menciona. */
  no_entregadas: 0.2,
  /** Riesgo de no promoción o de recuperación (fracción de simulaciones) que se menciona. */
  riesgo_general: 0.3,
} as const;

export interface ResumenAsignaturaFoda {
  nombre: string;
  /** Promedio de los periodos cerrados en la escala del colegio; null sin notas. */
  nota: number | null;
  /** Nivel y etiqueta del desempeño de esa nota según la escala del año. */
  nivel: 'BAJO' | 'BASICO' | 'ALTO' | 'SUPERIOR' | null;
  desempeno: string | null;
  tendencia: 'SUBE' | 'BAJA' | 'ESTABLE' | null;
  actividades: number;
  no_entregadas: number;
  registros: number;
  fallas: number;
  nota_requerida: NotaRequerida;
  riesgo: NivelRiesgo | null;
  /** Normalizada 0–1; null si no hubo año anterior. */
  nota_anio_anterior: number | null;
}

export interface ResumenGeneralFoda {
  promedio: number | null;
  nivel: 'BAJO' | 'BASICO' | 'ALTO' | 'SUPERIOR' | null;
  desempeno: string | null;
  perdidas: number;
  registros: number;
  fallas: number;
  faltas_graves: number;
  hay_periodos_cerrados: boolean;
  riesgo_no_promocion: number | null;
  riesgo_recuperacion: number | null;
}

export interface ElementoFoda {
  clave: string;
  texto: string;
}

export interface Foda {
  fortalezas: ElementoFoda[];
  oportunidades: ElementoFoda[];
  debilidades: ElementoFoda[];
  amenazas: ElementoFoda[];
}

const CUADRANTE: Record<CuadranteFoda, keyof Foda> = { FORTALEZA: 'fortalezas', OPORTUNIDAD: 'oportunidades', DEBILIDAD: 'debilidades', AMENAZA: 'amenazas' };

/** «1 asignatura», «3 asignaturas»: las frases llevan el sustantivo ya concordado con la cantidad. */
export const cantidad = (n: number, singular: string, plural: string): string => `${n} ${n === 1 ? singular : plural}`;

export function rellenar(texto: string, valores: Record<string, string | number>): string {
  return texto.replace(/\{(\w+)\}/g, (marca, clave: string) => (clave in valores ? String(valores[clave]) : marca));
}

const pct = (parte: number, total: number): number => (total === 0 ? 0 : Math.round((parte / total) * 1000) / 10);
const periodosTexto = (n: number): string => (n === 1 ? 'el periodo que falta' : `los ${n} periodos que faltan`);

function armar(claves: string[], valores: Record<string, string | number>, verConvivencia: boolean): Foda {
  const foda: Foda = { fortalezas: [], oportunidades: [], debilidades: [], amenazas: [] };
  for (const clave of claves) {
    const plantilla = PLANTILLAS_FODA.find((p) => p.clave === clave);
    if (!plantilla || (plantilla.audiencia === 'CONVIVENCIA' && !verConvivencia)) continue;
    foda[CUADRANTE[plantilla.cuadrante]].push({ clave, texto: rellenar(plantilla.texto, valores) });
  }
  return foda;
}

export function fodaDeAsignatura(a: ResumenAsignaturaFoda, aprobatoria: number, decimales = 1): Foda {
  const fijo = (v: number | null): string => (v === null ? '' : v.toFixed(decimales));
  const claves: string[] = [];
  const req = a.nota_requerida;
  if (a.nota !== null && (a.nivel === 'ALTO' || a.nivel === 'SUPERIOR')) claves.push('NOTA_ALTA');
  if (a.tendencia === 'SUBE') claves.push('TENDENCIA_SUBE');
  if (a.actividades > 0 && a.no_entregadas === 0) claves.push('ENTREGA_TODO');
  if (a.registros > 0 && a.fallas === 0) claves.push('ASISTE_SIEMPRE');
  if (a.nota !== null && a.nota < aprobatoria) claves.push('NOTA_BAJA');
  if (a.tendencia === 'BAJA') claves.push('TENDENCIA_BAJA');
  if (a.actividades > 0 && a.no_entregadas / a.actividades >= UMBRALES_FODA.no_entregadas) claves.push('NO_ENTREGAS');
  if (a.registros > 0 && a.fallas / a.registros >= UMBRALES_FODA.inasistencia) claves.push('INASISTENCIA');
  if (req.estado === 'ALCANZABLE') claves.push('ALCANZABLE');
  if (req.estado === 'ASEGURADA') claves.push('ASEGURADA');
  if (a.nota === null && a.nota_anio_anterior !== null && a.nota_anio_anterior >= 0.6) claves.push('ANIO_ANTERIOR_BUENO');
  if (req.estado === 'NO_ALCANZA') claves.push('NO_ALCANZA');
  else if (req.estado === 'PERDIDA') claves.push('PERDIDA');
  else if (req.estado !== 'APROBADA' && req.estado !== 'ASEGURADA') {
    if (a.riesgo === 'ALTO') claves.push('RIESGO_ALTO');
    else if (a.riesgo === 'MEDIO') claves.push('RIESGO_MEDIO');
  }
  return armar(
    claves,
    {
      asignatura: a.nombre,
      nota: fijo(a.nota),
      desempeno: (a.desempeno ?? '').toLowerCase(),
      aprobatoria: fijo(aprobatoria),
      no_entregadas: a.no_entregadas,
      actividades: cantidad(a.actividades, 'actividad', 'actividades'),
      fallas: cantidad(a.fallas, 'clase', 'clases'),
      pct: pct(a.fallas, a.registros),
      requerida: fijo(req.nota),
      restantes: periodosTexto(req.periodos_restantes),
      definitiva: fijo(req.definitiva),
    },
    false
  );
}

export function fodaGeneral(g: ResumenGeneralFoda, recuperables: string[], verConvivencia: boolean, aseguradas: string[] = []): Foda {
  const claves: string[] = [];
  if (g.promedio !== null && (g.nivel === 'ALTO' || g.nivel === 'SUPERIOR')) claves.push('GEN_PROMEDIO_ALTO');
  if (aseguradas.length > 0) claves.push('GEN_ASEGURADAS');
  if (g.hay_periodos_cerrados && g.perdidas === 0) claves.push('GEN_SIN_PERDIDAS');
  if (g.perdidas > 0) claves.push('GEN_PERDIDAS');
  if (g.registros > 0 && g.fallas / g.registros >= UMBRALES_FODA.inasistencia) claves.push('GEN_INASISTENCIA');
  if (recuperables.length > 0) claves.push('GEN_RECUPERABLES');
  if ((g.riesgo_no_promocion ?? 0) >= UMBRALES_FODA.riesgo_general) claves.push('GEN_RIESGO_NO_PROMOCION');
  else if ((g.riesgo_recuperacion ?? 0) >= UMBRALES_FODA.riesgo_general) claves.push('GEN_RIESGO_RECUPERACION');
  if (g.faltas_graves > 0) claves.push('GEN_CONVIVENCIA');
  return armar(
    claves,
    {
      promedio: g.promedio ?? '',
      desempeno: (g.desempeno ?? '').toLowerCase(),
      perdidas: cantidad(g.perdidas, 'asignatura', 'asignaturas'),
      pct: pct(g.fallas, g.registros),
      asignaturas: recuperables.join(', '),
      faltas: cantidad(g.faltas_graves, 'falta', 'faltas'),
      aseguradas: aseguradas.join(', '),
    },
    verConvivencia
  );
}
