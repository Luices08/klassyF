import { EstadoActividadEstudiante, EstadoEntrega, TipoActividad } from '../constants/actividades';
import { TIPOS_EVENTO_NO_LECTIVO } from '../constants/enums';
import { EventoCalendario, RangoFechas, hayEventoNoLectivo } from './calendarioAcademico';

/**
 * Funciones puras de M11 (actividades). Los plazos de entrega son instantes (tienen hora); el calendario del año
 * lectivo (M05) son días a medianoche UTC. Aquí se cruzan los dos pasando el instante al día de calendario de Colombia.
 */

const MS_HORA = 3_600_000;
const FORMATO_INSTANTE = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' });

export const formatoInstante = (instante: Date): string => FORMATO_INSTANTE.format(instante);
const formatoDia = (dia: Date): string => dia.toISOString().slice(0, 10);

/** El día de calendario (medianoche UTC) en que cae un instante, en hora de Colombia (UTC-5, sin horario de verano). */
export function diaCalendarioColombia(instante: Date): Date {
  const dia = new Date(instante.getTime() - 5 * MS_HORA);
  dia.setUTCHours(0, 0, 0, 0);
  return dia;
}

/** ISO 1=lunes ... 7=domingo, el mismo formato de `JornadaOperativa.dias_habiles`. */
function diaIso(dia: Date): number {
  return dia.getUTCDay() === 0 ? 7 : dia.getUTCDay();
}

// --- Estado de una entrega ---

export interface EntregaParaEstado {
  estado?: EstadoEntrega | null;
  calificacion_numerica?: number | null;
  fecha_entrega?: Date | null;
}

/**
 * El estado que ve el estudiante y el docente. Se deriva de lo guardado en vez de confiar solo en `estado`: una nota
 * siempre es CALIFICADA (también en registros anteriores a M11, que no tenían el campo) y un registro sin
 * `fecha_entrega` es una nota puesta sin entrega, o sea que el estudiante sigue con la actividad programada.
 */
export function estadoDeEntrega(entrega: EntregaParaEstado | null | undefined): EstadoActividadEstudiante {
  if (!entrega) return 'PROGRAMADA';
  if (typeof entrega.calificacion_numerica === 'number') return 'CALIFICADA';
  if (!entrega.fecha_entrega) return 'PROGRAMADA';
  return entrega.estado === 'ENTREGADA_TARDE' ? 'ENTREGADA_TARDE' : 'ENTREGADA';
}

// --- Ventana de entrega ---

export interface PlazosActividad {
  fecha_apertura: Date;
  fecha_entrega: Date;
  permite_entrega_tardia: boolean;
}

export interface VentanaEntrega {
  publicada: boolean;
  vencida: boolean;
  /** Se puede entregar ahora (a tiempo, o tarde si la actividad lo admite). */
  abierta: boolean;
  /** Una entrega hecha ahora quedaría ENTREGADA_TARDE. */
  tardia: boolean;
  motivo: string | null;
}

export function evaluarVentanaEntrega(plazos: PlazosActividad, ahora: Date): VentanaEntrega {
  if (ahora < plazos.fecha_apertura) {
    return {
      publicada: false,
      vencida: false,
      abierta: false,
      tardia: false,
      motivo: `La actividad se publica el ${formatoInstante(plazos.fecha_apertura)}.`,
    };
  }
  if (ahora <= plazos.fecha_entrega) return { publicada: true, vencida: false, abierta: true, tardia: false, motivo: null };
  if (plazos.permite_entrega_tardia) return { publicada: true, vencida: true, abierta: true, tardia: true, motivo: null };
  return {
    publicada: true,
    vencida: true,
    abierta: false,
    tardia: false,
    motivo: `El plazo de entrega venció el ${formatoInstante(plazos.fecha_entrega)} y esta actividad no recibe entregas tardías.`,
  };
}

// --- Prevención de choques y sobrecarga ---

export type SeveridadAlerta = 'BLOQUEO' | 'ADVERTENCIA';

export interface AlertaCalendario {
  codigo:
    | 'FECHA_PASADA'
    | 'FUERA_DE_PERIODO'
    | 'DIA_NO_LECTIVO'
    | 'DIA_NO_HABIL'
    | 'VENTANA_RECUPERACION'
    | 'SOBRECARGA_EVALUACIONES'
    | 'SOBRECARGA_ENTREGAS';
  severidad: SeveridadAlerta;
  mensaje: string;
}

export interface ActividadDelGrupo {
  titulo: string;
  tipo: TipoActividad;
  asignatura: string;
  fecha_entrega: Date;
}

export interface EntradaCalendario {
  ahora: Date;
  fecha_entrega: Date;
  tipo: TipoActividad;
  /** Al crear (o mover la fecha) una entrega no puede quedar en el pasado. */
  exigir_futuro: boolean;
  /** Fechas del periodo tal como aplican a la sede del grupo (calendario propio si lo tiene). */
  periodo: RangoFechas & { numero: number };
  eventos: readonly EventoCalendario[];
  dias_habiles: readonly number[];
  /** Las demás actividades del grupo (de cualquier docente), sin la que se está programando. */
  del_grupo: readonly ActividadDelGrupo[];
  /** 0 = sin límite. */
  limites: { max_evaluaciones_por_dia: number; max_entregas_por_dia: number };
}

/**
 * Lo que el calendario (M05) y la carga del grupo dicen de una fecha de entrega. Los BLOQUEO no se pueden saltar (la
 * fecha no sirve); las ADVERTENCIA el docente las confirma a conciencia (un proyecto de vacaciones, un sábado).
 */
export function evaluarCalendarioActividad(entrada: EntradaCalendario): AlertaCalendario[] {
  const alertas: AlertaCalendario[] = [];
  const dia = diaCalendarioColombia(entrada.fecha_entrega);
  const etiquetaDia = formatoDia(dia);

  if (entrada.exigir_futuro && entrada.fecha_entrega <= entrada.ahora) {
    alertas.push({ codigo: 'FECHA_PASADA', severidad: 'BLOQUEO', mensaje: 'La fecha de entrega ya pasó.' });
  }

  if (dia < entrada.periodo.fecha_inicio || dia > entrada.periodo.fecha_fin) {
    alertas.push({
      codigo: 'FUERA_DE_PERIODO',
      severidad: 'BLOQUEO',
      mensaje: `El ${etiquetaDia} queda fuera del periodo ${entrada.periodo.numero} (${formatoDia(entrada.periodo.fecha_inicio)} a ${formatoDia(entrada.periodo.fecha_fin)}).`,
    });
  }

  const noLectivo = entrada.eventos.find((e) => hayEventoNoLectivo(dia, [e]));
  if (noLectivo) {
    alertas.push({
      codigo: 'DIA_NO_LECTIVO',
      severidad: 'ADVERTENCIA',
      mensaje: `El ${etiquetaDia} cae en «${noLectivo.nombre}»: no hay clases ese día.`,
    });
  } else if (!entrada.dias_habiles.includes(diaIso(dia))) {
    alertas.push({
      codigo: 'DIA_NO_HABIL',
      severidad: 'ADVERTENCIA',
      mensaje: `El ${etiquetaDia} no es un día hábil de la jornada de este grupo.`,
    });
  }

  const recuperacion = entrada.eventos.find(
    (e) => !TIPOS_EVENTO_NO_LECTIVO.includes(e.tipo) && dia >= e.fecha_inicio && dia <= e.fecha_fin
  );
  if (recuperacion) {
    alertas.push({
      codigo: 'VENTANA_RECUPERACION',
      severidad: 'ADVERTENCIA',
      mensaje: `El ${etiquetaDia} coincide con «${recuperacion.nombre}» (recuperaciones).`,
    });
  }

  const delMismoDia = entrada.del_grupo.filter((a) => diaCalendarioColombia(a.fecha_entrega).getTime() === dia.getTime());
  const evaluaciones = delMismoDia.filter((a) => a.tipo === 'EVALUACION');
  const { max_evaluaciones_por_dia: maxEvaluaciones, max_entregas_por_dia: maxEntregas } = entrada.limites;

  if (entrada.tipo === 'EVALUACION' && maxEvaluaciones > 0 && evaluaciones.length + 1 > maxEvaluaciones) {
    alertas.push({
      codigo: 'SOBRECARGA_EVALUACIONES',
      severidad: 'ADVERTENCIA',
      mensaje: `El grupo ya tiene ${evaluaciones.length} evaluación(es) el ${etiquetaDia} (${evaluaciones.map((a) => a.asignatura).join(', ')}); el límite del colegio es ${maxEvaluaciones} por día.`,
    });
  }
  if (maxEntregas > 0 && delMismoDia.length + 1 > maxEntregas) {
    alertas.push({
      codigo: 'SOBRECARGA_ENTREGAS',
      severidad: 'ADVERTENCIA',
      mensaje: `El grupo ya tiene ${delMismoDia.length} actividad(es) para el ${etiquetaDia}; el límite del colegio es ${maxEntregas} por día.`,
    });
  }

  return alertas.sort((a, b) => Number(b.severidad === 'BLOQUEO') - Number(a.severidad === 'BLOQUEO'));
}

/** Para comparar la competencia elegida con el texto libre de la planeación sin que importen tildes, mayúsculas ni espacios. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
