import { EstadoCaso, ResultadoCierreCaso, TIPOS_SITUACION, TipoSituacion } from '../constants/convivencia';

const MS_HORA = 3_600_000;

/**
 * Flujo del caso (patrón de `TRANSICIONES_PERIODO`, M05). Cerrar, reabrir y anular no van por aquí: tienen sus propias
 * reglas (resultado y protocolo completo; solo ADMIN con motivo). REMITIDO no cierra: la institución sigue con el seguimiento.
 */
export const TRANSICIONES_CASO: Record<EstadoCaso, readonly EstadoCaso[]> = {
  ABIERTO: ['EN_ATENCION', 'REMITIDO'],
  EN_ATENCION: ['EN_MEDIACION', 'EN_SEGUIMIENTO', 'REMITIDO'],
  EN_MEDIACION: ['EN_SEGUIMIENTO', 'REMITIDO'],
  REMITIDO: ['EN_SEGUIMIENTO'],
  EN_SEGUIMIENTO: ['REMITIDO'],
  REABIERTO: ['EN_SEGUIMIENTO'],
  CERRADO: [],
  ANULADO: [],
};

export const ESTADOS_CASO_FINALES: readonly EstadoCaso[] = ['CERRADO', 'ANULADO'];
/** Desde estos estados se puede cerrar el caso (con resultado y el protocolo completo). */
export const ESTADOS_CASO_CERRABLES: readonly EstadoCaso[] = ['EN_ATENCION', 'EN_MEDIACION', 'EN_SEGUIMIENTO'];

export const puedeTransicionar = (desde: EstadoCaso, hasta: EstadoCaso): boolean => TRANSICIONES_CASO[desde].includes(hasta);

const posicion = (tipo: TipoSituacion) => TIPOS_SITUACION.indexOf(tipo);

/** Subir de tipo (I → II → III) lo decide coordinación; bajar solo un ADMIN, con motivo. */
export const esEscalamiento = (de: TipoSituacion, a: TipoSituacion): boolean => posicion(a) > posicion(de);

export interface CasoParaCierre {
  tipo_situacion: TipoSituacion;
  pasos: { nombre: string; obligatorio: boolean; estado: string }[];
  atencion_inmediata: unknown | null;
  notificaciones: { tipo: string }[];
  remisiones: unknown[];
  justificacion_sin_remision: string;
  decision: unknown | null;
  medidas_aplicadas: unknown[];
}

/**
 * Qué falta para cerrar el caso con ese resultado (RN-15-03/04/05): el caso no se cierra con pasos obligatorios pendientes;
 * en tipo II y III hay atención inmediata e informe a los acudientes; en tipo III, remisión inmediata o justificación escrita.
 */
export function pendientesParaCerrar(caso: CasoParaCierre, resultado: ResultadoCierreCaso): string[] {
  const faltan: string[] = [];
  for (const paso of caso.pasos) {
    if (paso.obligatorio && paso.estado === 'PENDIENTE') faltan.push(`Paso obligatorio pendiente: ${paso.nombre}.`);
  }
  if (caso.tipo_situacion !== 'I') {
    if (!caso.atencion_inmediata) faltan.push('Falta registrar la atención inmediata.');
    if (!caso.notificaciones.some((n) => n.tipo === 'ACUDIENTES')) faltan.push('Falta registrar el informe a los acudientes.');
  }
  if (caso.tipo_situacion === 'III' && caso.remisiones.length === 0 && !caso.justificacion_sin_remision.trim()) {
    faltan.push('Un caso tipo III exige remisión a la autoridad competente o la justificación de por qué no hubo.');
  }
  if (resultado === 'REMITIDO' && caso.remisiones.length === 0) faltan.push('El resultado "remitido" exige al menos una remisión registrada.');
  if (resultado === 'MEDIDA_APLICADA') {
    if (!caso.decision) faltan.push('El resultado "medida aplicada" exige la decisión motivada.');
    if (caso.medidas_aplicadas.length === 0) faltan.push('El resultado "medida aplicada" exige al menos una medida registrada.');
  }
  return faltan;
}

/** Pasos del protocolo del nuevo tipo que el caso todavía no tiene (al escalar de tipo no se pierde lo ya hecho). */
export function pasosFaltantes<T extends { nombre: string }>(existentes: { nombre: string }[], protocolo: T[]): T[] {
  const tiene = new Set(existentes.map((p) => p.nombre.trim().toLowerCase()));
  return protocolo.filter((p) => !tiene.has(p.nombre.trim().toLowerCase()));
}

export interface CasoParaAlertas {
  tipo_situacion: TipoSituacion;
  estado: EstadoCaso;
  createdAt: Date;
  remisiones: unknown[];
  justificacion_sin_remision: string;
  seguimientos: { proxima_fecha: Date | null }[];
}

export interface AlertaCaso {
  codigo: 'REMISION_TIPO_III_PENDIENTE' | 'SEGUIMIENTO_VENCIDO';
  mensaje: string;
}

/** Alertas que M15 calcula y muestra (el envío es de M28). `hoy` = día de calendario en Colombia a medianoche UTC. */
export function alertasDeCaso(
  caso: CasoParaAlertas,
  politica: { plazo_remision_tipo_iii_horas: number },
  ahora: Date,
  hoy: Date
): AlertaCaso[] {
  if (ESTADOS_CASO_FINALES.includes(caso.estado)) return [];
  const alertas: AlertaCaso[] = [];

  const sinRemision = caso.remisiones.length === 0 && !caso.justificacion_sin_remision.trim();
  const horas = (ahora.getTime() - caso.createdAt.getTime()) / MS_HORA;
  if (caso.tipo_situacion === 'III' && sinRemision && horas >= politica.plazo_remision_tipo_iii_horas) {
    alertas.push({
      codigo: 'REMISION_TIPO_III_PENDIENTE',
      mensaje: `Caso tipo III sin remisión a la autoridad competente (plazo: ${politica.plazo_remision_tipo_iii_horas} h).`,
    });
  }

  const ultimo = caso.seguimientos.at(-1);
  if (ultimo?.proxima_fecha && ultimo.proxima_fecha < hoy) {
    alertas.push({ codigo: 'SEGUIMIENTO_VENCIDO', mensaje: 'La fecha del próximo seguimiento ya pasó sin un nuevo registro.' });
  }
  return alertas;
}
