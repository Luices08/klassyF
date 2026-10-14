import {
  AccionPlan,
  DIAS_ANTICIPO_APERTURA_ENTREGA,
  EstadoPlan,
  EstadoPlanVista,
  TRANSICIONES_PLAN,
} from '../constants/planeacion';
import { finDelDia, inicioDelDia } from './calendarioAcademico';

/**
 * Funciones puras de M07 (planeación documental): la ventana de entrega de los planes de aula, la regla de «fuera de plazo»,
 * qué puede hacer cada plan según su estado y qué áreas bloquean la activación del año. Sin Mongoose, con pruebas.
 */

const MS_DIA = 86_400_000;
const sumarDias = (fecha: Date, dias: number): Date => new Date(fecha.getTime() + dias * MS_DIA);

// --- Ventana de entrega del plan de aula (configurable por periodo) ---

export interface PeriodoVentana {
  numero: number;
  fecha_inicio: Date;
  fecha_fin: Date;
  fecha_apertura_planes_aula?: Date | null;
  fecha_limite_planes_aula?: Date | null;
}

export interface VentanaEntrega {
  numero: number;
  /** Día de calendario (medianoche UTC, como el resto de fechas de M05) desde el que se radican los planes del periodo. */
  apertura: Date;
  /** Último día para radicar a tiempo, inclusive. */
  limite: Date;
  apertura_personalizada: boolean;
  limite_personalizado: boolean;
}

/**
 * La ventana de un periodo: la que fijó el administrador o coordinación y, si no, la sugerida. Sugerida: abre 2 semanas antes
 * de que termine el periodo previo y cierra el día anterior al inicio del periodo (para el Periodo 1, que no tiene previo
 * en el año, abre 2 semanas antes de su propio cierre). `null` si el año no tiene ese periodo.
 */
export function ventanaDeEntrega(periodos: readonly PeriodoVentana[], numero: number): VentanaEntrega | null {
  const ordenados = [...periodos].sort((a, b) => a.numero - b.numero);
  const periodo = ordenados.find((p) => p.numero === numero);
  if (!periodo) return null;
  const previo = ordenados.filter((p) => p.numero < numero).at(-1);

  const limiteSugerido = sumarDias(periodo.fecha_inicio, -1);
  const limite = periodo.fecha_limite_planes_aula ?? limiteSugerido;
  const aperturaBase = previo ? sumarDias(previo.fecha_fin, -DIAS_ANTICIPO_APERTURA_ENTREGA) : sumarDias(limite, -DIAS_ANTICIPO_APERTURA_ENTREGA);
  // La sugerida nunca abre después de cerrar (p. ej. si coordinación adelantó el cierre).
  const aperturaSugerida = aperturaBase.getTime() > limite.getTime() ? limite : aperturaBase;

  return {
    numero,
    apertura: periodo.fecha_apertura_planes_aula ?? aperturaSugerida,
    limite,
    apertura_personalizada: Boolean(periodo.fecha_apertura_planes_aula),
    limite_personalizado: Boolean(periodo.fecha_limite_planes_aula),
  };
}

export type EstadoVentana = 'NO_ABIERTA' | 'ABIERTA' | 'VENCIDA';

/** Contra «ahora» la ventana se mide en hora de Colombia: el día de apertura y el de cierre cuentan completos. */
export function estadoDeVentana(ventana: Pick<VentanaEntrega, 'apertura' | 'limite'>, ahora: Date): EstadoVentana {
  if (ahora.getTime() < inicioDelDia(ventana.apertura).getTime()) return 'NO_ABIERTA';
  if (ahora.getTime() > finDelDia(ventana.limite).getTime()) return 'VENCIDA';
  return 'ABIERTA';
}

/** Mensaje de las validaciones al configurar una ventana; null si es coherente. */
export function validarVentana(periodos: readonly PeriodoVentana[], numero: number): string | null {
  const ventana = ventanaDeEntrega(periodos, numero);
  const periodo = periodos.find((p) => p.numero === numero);
  if (!ventana || !periodo) return `El año lectivo no tiene el periodo ${numero}.`;
  if (ventana.limite.getTime() < ventana.apertura.getTime()) return 'La fecha límite no puede ser anterior a la apertura de la entrega.';
  // Con el Periodo 1 sin planes no hay clases con actividades: el límite debe quedar antes de que empiecen.
  if (numero === 1 && ventana.limite.getTime() >= periodo.fecha_inicio.getTime()) {
    return 'La fecha límite del Periodo 1 debe ser anterior al inicio de clases.';
  }
  return null;
}

export interface EvaluacionRadicacion {
  fuera_de_plazo: boolean;
  /** El límite que regía cuando se radicó (queda guardado: cambiarlo después no reescribe la historia). */
  fecha_limite: Date | null;
}

/**
 * Una entrega es «fuera de plazo» si llega después del último instante del día límite (hora de Colombia). No cuenta contra quien
 * fue asignado después de ese cierre (un reemplazo): no pudo cumplir un plazo que ya había pasado cuando llegó.
 */
export function evaluarRadicacion(ahora: Date, ventana: Pick<VentanaEntrega, 'limite'> | null, asignadoDesde: Date | null): EvaluacionRadicacion {
  if (!ventana) return { fuera_de_plazo: false, fecha_limite: null };
  const cierre = finDelDia(ventana.limite).getTime();
  const llegoDespuesDelCierre = asignadoDesde !== null && asignadoDesde.getTime() > cierre;
  return { fuera_de_plazo: ahora.getTime() > cierre && !llegoDespuesDelCierre, fecha_limite: ventana.limite };
}

// --- Estado de un plan ---

export function siguienteEstado(actual: EstadoPlanVista, accion: AccionPlan): EstadoPlan | null {
  return TRANSICIONES_PLAN[actual][accion] ?? null;
}

export type CodigoBloqueoCarga = 'ANIO_CERRADO' | 'PLAN_AREA_PENDIENTE' | 'EN_REVISION' | 'APROBADO' | 'VENTANA_NO_ABIERTA';

export interface EntradaCargaPlanAula {
  anioCerrado: boolean;
  planAreaEstado: EstadoPlanVista;
  planAulaEstado: EstadoPlanVista;
  ventana: EstadoVentana | null;
}

/**
 * Cuándo puede un docente radicar su plan de aula. Vencida la fecha límite el formulario NO se cierra (queda marcado «fuera de
 * plazo»), y un plan devuelto siempre se puede corregir hasta que se apruebe. Lo único que lo frena es el plan de área
 * sin aprobar, que el plan ya está en revisión o aprobado, o que la entrega del periodo todavía no abre.
 */
export function bloqueoDeCargaPlanAula(e: EntradaCargaPlanAula): CodigoBloqueoCarga | null {
  if (e.anioCerrado) return 'ANIO_CERRADO';
  if (e.planAreaEstado !== 'APROBADO') return 'PLAN_AREA_PENDIENTE';
  if (e.planAulaEstado === 'EN_REVISION') return 'EN_REVISION';
  if (e.planAulaEstado === 'APROBADO') return 'APROBADO';
  if (e.planAulaEstado === 'SIN_CARGAR' && e.ventana === 'NO_ABIERTA') return 'VENTANA_NO_ABIERTA';
  return null;
}

// --- Áreas que bloquean la activación del año ---

export type MotivoAreaPendiente = 'SIN_LIDER' | 'SIN_CARGAR' | 'EN_REVISION' | 'DEVUELTO';

/** Por qué un área no tiene su plan aprobado; null si ya lo tiene. */
export function motivoAreaPendiente(tieneLider: boolean, estado: EstadoPlanVista): MotivoAreaPendiente | null {
  if (estado === 'APROBADO') return null;
  if (estado === 'SIN_CARGAR') return tieneLider ? 'SIN_CARGAR' : 'SIN_LIDER';
  return estado;
}

export const NOMBRES_MOTIVO_AREA_PENDIENTE: Record<MotivoAreaPendiente, string> = {
  SIN_LIDER: 'no tiene docente líder',
  SIN_CARGAR: 'el líder aún no carga el plan de área',
  EN_REVISION: 'el plan de área está en revisión',
  DEVUELTO: 'el plan de área fue devuelto y falta la corrección',
};

interface AsignaturaDelPlan {
  subject_id: { toString(): string };
}

export interface PlanDeEstudiosMinimo {
  grades: ReadonlyArray<{
    grade_id: { toString(): string };
    asignaturas: readonly AsignaturaDelPlan[];
    jornadas_personalizadas?: ReadonlyArray<{ asignaturas_agregadas: readonly AsignaturaDelPlan[] }>;
    personalizaciones_grupo: ReadonlyArray<{ asignaturas_agregadas: readonly AsignaturaDelPlan[] }>;
  }>;
}

/**
 * Las asignaturas que el año dicta en cada grado: las de la malla y las que una jornada o un grupo de ese grado agregan. Es
 * conservador a propósito (no distingue a qué jornada o grupo pertenece lo agregado): pedir de más un plan de área es mejor que
 * dejar sin él una asignatura obligatoria.
 */
export function asignaturasPorGrado(plan: PlanDeEstudiosMinimo | null): Map<string, Set<string>> {
  const porGrado = new Map<string, Set<string>>();
  for (const grado of plan?.grades ?? []) {
    const ids = porGrado.get(grado.grade_id.toString()) ?? new Set<string>();
    for (const a of grado.asignaturas) ids.add(a.subject_id.toString());
    for (const j of grado.jornadas_personalizadas ?? []) for (const a of j.asignaturas_agregadas) ids.add(a.subject_id.toString());
    for (const g of grado.personalizaciones_grupo) for (const a of g.asignaturas_agregadas) ids.add(a.subject_id.toString());
    porGrado.set(grado.grade_id.toString(), ids);
  }
  return porGrado;
}

// --- Plan de un docente que se fue ---

export interface PlanParaAdopcion {
  docente_id: string;
  estado: EstadoPlan;
  /** El dueño ya no dicta esa asignatura en ese grado: el plan quedó en el histórico del periodo. */
  archivado: boolean;
}

/**
 * Los planes que un docente nuevo puede adoptar: aprobados, de otro docente y archivados. Adoptar el plan de un colega que sigue
 * dictando esa asignatura en ese grado rompería el «cada docente radica el suyo».
 */
export function planesAdoptables<P extends PlanParaAdopcion>(planes: readonly P[], docenteId: string): P[] {
  return planes.filter((p) => p.estado === 'APROBADO' && p.archivado && p.docente_id !== docenteId);
}
