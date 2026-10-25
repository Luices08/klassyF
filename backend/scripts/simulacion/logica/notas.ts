/**
 * Cómo trabaja un periodo cada clase y cómo le va a cada estudiante: qué actividades programa el docente y cuándo, quién entrega,
 * qué nota saca y si recupera. Todo sale de las variables latentes del perfil oculto; funciones puras con pruebas.
 */
import { Azar } from '../nucleo/azar';
import { diaIso, sumarDias } from '../nucleo/fechas';
import { FamiliaArea, Latentes } from './perfiles';

const FAMILIA_DE_ASIGNATURA: Record<string, FamiliaArea> = {
  MAT: 'MATEMATICAS',
  GEO: 'MATEMATICAS',
  EST: 'MATEMATICAS',
  PROG: 'MATEMATICAS',
  BD: 'MATEMATICAS',
  CN: 'CIENCIAS',
  BIO: 'CIENCIAS',
  FQ: 'CIENCIAS',
  FIS: 'CIENCIAS',
  QUI: 'CIENCIAS',
  LEN: 'LENGUAJE',
  ING: 'INGLES',
  SOC: 'SOCIALES',
  ECO: 'SOCIALES',
  FIL: 'SOCIALES',
};

/** Las asignaturas que no son de un área «dura» se mueven con la familia formativa (ética, artes, deporte, técnica práctica…). */
export function familiaDeAsignatura(clave: string): FamiliaArea {
  return FAMILIA_DE_ASIGNATURA[clave] ?? 'FORMATIVAS';
}

/** En las asignaturas de nota «blanda» los docentes califican más alto (y con menos dispersión) que en las críticas. */
const AJUSTE_TIPO_NOTA: Record<string, { media: number; dispersion: number }> = {
  CRITICA: { media: 0, dispersion: 1.1 },
  MODERADA: { media: 0.15, dispersion: 1 },
  BLANDA: { media: 0.4, dispersion: 0.8 },
};

export const NOTA_NO_ENTREGADA = 1;
const NOTA_MIN = 1;
const NOTA_MAX = 5;
const PENALIDAD_TARDE = 0.3;

const redondear = (x: number) => Math.round(x * 10) / 10;
export const acotarNota = (x: number) => redondear(Math.min(NOTA_MAX, Math.max(NOTA_MIN, x)));

export type TipoActividadSim = 'TAREA' | 'TRABAJO' | 'EVALUACION' | 'PROYECTO';

export interface ActividadPlaneada {
  indice: number;
  tipo: TipoActividadSim;
  /** El día que se publica y el día límite de entrega (medianoche UTC). */
  apertura: Date;
  entrega: Date;
  digital: boolean;
  /** % del bloque; null = se reparte en partes iguales con las demás. */
  peso: number | null;
}

/** Días lectivos (lunes a viernes, fuera de recesos, vacaciones y festivos) entre dos fechas, ambas incluidas. */
export function diasLectivos(desde: Date, hasta: Date, noLectivos: ReadonlyArray<{ inicio: Date; fin: Date }>): Date[] {
  const dias: Date[] = [];
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
    if (diaIso(d) >= 6) continue;
    if (noLectivos.some((n) => d >= n.inicio && d <= n.fin)) continue;
    dias.push(d);
  }
  return dias;
}

/** El día lectivo que queda `n` días lectivos después (o antes, con n negativo) de `dia`; se queda en el borde de la lista. */
export function moverLectivos(lectivos: readonly Date[], dia: Date, n: number): Date {
  let i = lectivos.findIndex((d) => d.getTime() >= dia.getTime());
  if (i < 0) i = lectivos.length - 1;
  return lectivos[Math.min(lectivos.length - 1, Math.max(0, i + n))] as Date;
}

/** Cuántas actividades de heteroevaluación programa una clase según sus horas semanales. */
export function actividadesPorHoras(horasSemanales: number): number {
  if (horasSemanales <= 1) return 3;
  if (horasSemanales <= 3) return 4;
  return 5;
}

/** Cuántas de esas actividades se entregan por la plataforma: nada en los primeros grados, más en bachillerato. */
export function actividadesDigitales(grado: number, total: number): number {
  if (grado <= 2) return 0;
  if (grado <= 5) return 1;
  return Math.min(2, total - 1);
}

/**
 * Reparte las actividades de una clase a lo largo de los días lectivos disponibles: la última es la evaluación del periodo (pesa
 * más), las digitales se intercalan y cada una se publica unos días antes de su límite.
 */
export function planearActividades(lectivos: readonly Date[], horasSemanales: number, grado: number, azar: Azar): ActividadPlaneada[] {
  const total = actividadesPorHoras(horasSemanales);
  const digitales = actividadesDigitales(grado, total);
  const indicesDigitales = new Set(azar.barajar(Array.from({ length: total - 1 }, (_, i) => i)).slice(0, digitales));
  const tramo = lectivos.length / total;
  return Array.from({ length: total }, (_, i) => {
    const esEvaluacion = i === total - 1;
    const centro = Math.floor(tramo * (i + 0.6));
    const posicion = Math.min(lectivos.length - 1, Math.max(0, centro + azar.entero(-2, 2)));
    const entrega = lectivos[posicion] as Date;
    const apertura = moverLectivos(lectivos, entrega, -azar.entero(3, 6));
    const tipo: TipoActividadSim = esEvaluacion ? 'EVALUACION' : grado >= 9 && i === 0 && azar.prob(0.3) ? 'PROYECTO' : azar.prob(0.55) ? 'TAREA' : 'TRABAJO';
    return { indice: i, tipo, apertura, entrega, digital: indicesDigitales.has(i), peso: esEvaluacion ? 30 : null };
  });
}

export interface PerfilDeAnio {
  latentes: Latentes;
  categoria: string;
}

/** Nivel esperado del estudiante en una asignatura en un periodo (antes del ruido de cada actividad). */
export function nivelEsperado(perfil: PerfilDeAnio, claveAsignatura: string, tipoNota: string, periodo: number): number {
  const base = perfil.latentes.habilidad_area[familiaDeAsignatura(claveAsignatura)] ?? perfil.latentes.habilidad;
  const ajuste = AJUSTE_TIPO_NOTA[tipoNota] ?? AJUSTE_TIPO_NOTA.MODERADA;
  // La tendencia acumula: quien viene mejorando lo nota más en el cuarto periodo que en el primero.
  return base + (ajuste?.media ?? 0) + perfil.latentes.tendencia * (periodo - 1) * 2;
}

/** ¿Entrega la actividad, y a tiempo? La constancia decide si la hace; la puntualidad, si llega tarde. */
export function decidirEntrega(latentes: Latentes, tipo: TipoActividadSim, azar: Azar): { entrega: boolean; tarde: boolean } {
  // A una evaluación casi nadie falta; una tarea es donde se nota la constancia.
  const p = tipo === 'EVALUACION' ? 0.97 : Math.min(0.99, Math.max(0.2, latentes.constancia + 0.16));
  if (!azar.prob(p)) return { entrega: false, tarde: false };
  return { entrega: true, tarde: azar.prob(Math.min(0.5, latentes.puntualidad * 4)) };
}

/** Nota de una actividad: no entregada es 1.0; si llegó tarde pierde unas décimas. */
export function notaDeActividad(
  esperado: number,
  latentes: Latentes,
  tipoNota: string,
  tipo: TipoActividadSim,
  entrega: { entrega: boolean; tarde: boolean },
  azar: Azar
): number {
  if (!entrega.entrega) return NOTA_NO_ENTREGADA;
  const dispersion = latentes.volatilidad * (AJUSTE_TIPO_NOTA[tipoNota]?.dispersion ?? 1) * (tipo === 'EVALUACION' ? 1.4 : 1);
  const nota = azar.normal(tipo === 'EVALUACION' ? esperado - 0.15 : esperado, dispersion);
  return acotarNota(nota - (entrega.tarde ? PENALIDAD_TARDE : 0));
}

/** Autoevaluación, coevaluación y comportamiento: la primera sale generosa, la última depende del riesgo de convivencia. */
export function notasFormativas(esperado: number, latentes: Latentes, azar: Azar): { AUTO: number; COEV: number; COMP: number } {
  return {
    AUTO: acotarNota(Math.max(esperado, 3.5) + 0.5 + azar.normal(0, 0.2)),
    COEV: acotarNota(esperado + 0.3 + azar.normal(0, 0.3)),
    COMP: acotarNota(4.9 - 2.2 * latentes.riesgo_convivencia + azar.normal(0, 0.25)),
  };
}

/** Recuperación de periodo: se presenta casi siempre; la supera quien tiene con qué (y algo de suerte). */
export function intentoDeRecuperacion(esperado: number, latentes: Latentes, azar: Azar): number | null {
  if (!azar.prob(0.6 + 0.35 * latentes.constancia)) return null;
  const pSupera = Math.min(0.9, Math.max(0.1, 0.45 + 0.35 * (esperado - 2.6) + 0.2 * (latentes.constancia - 0.7)));
  return azar.prob(pSupera) ? acotarNota(Math.max(3, azar.normal(3.5, 0.35))) : acotarNota(Math.min(2.9, azar.normal(2.4, 0.3)));
}

const NIVEL_DESCRIPTIVO = ['INICIADO', 'EN_PROCESO', 'ALCANZADO'] as const;
export type NivelDescriptivo = (typeof NIVEL_DESCRIPTIVO)[number];

/** Preescolar no lleva nota: el nivel de la valoración descriptiva sigue la misma habilidad. */
export function nivelDescriptivo(esperado: number, azar: Azar): NivelDescriptivo {
  const x = esperado + azar.normal(0, 0.35);
  if (x >= 4) return 'ALCANZADO';
  if (x >= 3.1) return 'EN_PROCESO';
  return 'INICIADO';
}
