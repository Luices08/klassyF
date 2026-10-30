import type { Tone } from '../components/ui/Badge';
import type { TipoEventoHistorial } from '../types/historial';

/** Color del chip de una acción según su verbo: lo que borra, anula o falla en rojo; lo que crea o aprueba en verde; el resto neutro. */
export function tonoDeAccion(accion: string): Tone {
  if (/(ELIMINAD|ANULAD|RECHAZAD|FALLID|REVOCAD|BLOQUEAD|CANCELAD|QUITAD|DESVINCULAD)/.test(accion)) return 'red';
  if (/(CREAD|APROBAD|REGISTRAD|EMITID|PUBLICAD|FIRMAD|CONFIRMAD|OTORGAD|ACTIVAD|SOLICITAD|PREINSCRITA|VINCULAD)/.test(accion)) return 'green';
  if (/(CAMBIAD|ACTUALIZAD|REABIERT|EXCEPCION|SOBRECUPO|REINGRESO)/.test(accion)) return 'orange';
  return 'neutral';
}

/** Color del chip del tipo de evento: crear en verde, editar en naranja, matricular en azul y eliminar en rojo. */
const TONO_POR_TIPO: Record<TipoEventoHistorial, Tone> = { CREACION: 'green', EDICION: 'orange', MATRICULACION: 'blue', ELIMINACION: 'red' };
export const tonoDeTipo = (tipo: TipoEventoHistorial | null): Tone => (tipo ? TONO_POR_TIPO[tipo] : 'neutral');

export const nombreDeUsuario = (u: { nombre: string; apellido: string } | null): string => (u ? `${u.apellido}, ${u.nombre}` : 'Sistema');
