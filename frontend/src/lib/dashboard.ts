import type { Tone } from '../components/ui/Badge';
import type { NivelDesempeno } from '../hooks/useDashboard';

/** «87,5 %» (coma decimal, como en Colombia), o `null` si no hay nada que medir. */
export function formatoPorcentaje(valor: number | null): string | null {
  return valor === null ? null : `${valor.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`;
}

export const formatoNumero = (valor: number): string => valor.toLocaleString('es-CO');

/** Los mismos cortes del chip de cupos de un grupo (`CupoBadge`): lleno es rojo y casi lleno (desde el 80 %) naranja. */
export function tonoDeOcupacion(ocupacionPct: number | null): Tone {
  if (ocupacionPct === null) return 'blue';
  return ocupacionPct >= 100 ? 'red' : ocupacionPct >= 80 ? 'orange' : 'green';
}

/** El color de cada nivel de desempeño es fijo (Decreto 1290), igual que en el boletín; el nombre que se muestra sí es el del colegio. */
export const TONO_DE_NIVEL: Record<NivelDesempeno, Tone> = { SUPERIOR: 'green', ALTO: 'blue', BASICO: 'orange', BAJO: 'red' };

export const NOMBRE_ESTADO_CASO: Record<string, string> = {
  ABIERTO: 'Abierto',
  EN_ATENCION: 'En atención',
  EN_MEDIACION: 'En mediación',
  EN_SEGUIMIENTO: 'En seguimiento',
  REMITIDO: 'Remitido',
  REABIERTO: 'Reabierto',
};

export const NOMBRE_ESTADO_MATRICULA: Record<string, string> = {
  PREINSCRITO: 'Preinscritos',
  MATRICULADO_CONDICIONAL: 'Condicionales',
  MATRICULADO_DEFINITIVO: 'Definitivas',
  RETIRADO: 'Retirados',
  ANULADO: 'Anuladas',
};

export const NOMBRE_ESTADO_EXPEDIENTE: Record<string, string> = {
  BORRADOR: 'Borrador',
  EN_CONSTRUCCION: 'En construcción',
  LISTO_PARA_ACUERDO: 'Listo para acuerdo',
  ACTIVO: 'Activo',
  CERRADO: 'Cerrado',
};

export const NOMBRE_ALERTA_CASO: Record<string, string> = {
  REMISION_TIPO_III_PENDIENTE: 'Remisión tipo III sin atender',
  SEGUIMIENTO_VENCIDO: 'Seguimiento vencido',
};

/** «hace 3 días», «hoy»; `null` = no hay nada pendiente. */
export function antiguedadEnDias(dias: number | null): string | null {
  if (dias === null) return null;
  return dias === 0 ? 'hoy' : dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
}
