import type { Tone } from '../components/ui/Badge';

/** Color del chip de una acción según su verbo: lo que borra, anula o falla en rojo; lo que crea o aprueba en verde; el resto neutro. */
export function tonoDeAccion(accion: string): Tone {
  if (/(ELIMINAD|ANULAD|RECHAZAD|FALLID|REVOCAD|BLOQUEAD|CANCELAD|QUITAD|DESVINCULAD)/.test(accion)) return 'red';
  if (/(CREAD|APROBAD|REGISTRAD|EMITID|PUBLICAD|FIRMAD|CONFIRMAD|OTORGAD|ACTIVAD|SOLICITAD|PREINSCRITA|VINCULAD)/.test(accion)) return 'green';
  if (/(CAMBIAD|ACTUALIZAD|REABIERT|EXCEPCION|SOBRECUPO|REINGRESO)/.test(accion)) return 'orange';
  return 'neutral';
}

export const nombreDeUsuario = (u: { nombre: string; apellido: string } | null): string => (u ? `${u.apellido}, ${u.nombre}` : 'Sistema');
