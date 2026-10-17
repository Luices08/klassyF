import type { Tone } from '../ui/Badge';
import type { EstadoSesion } from '../../hooks/useComision';

export const TONO_ESTADO_SESION: Record<EstadoSesion, Tone> = {
  BORRADOR: 'neutral',
  CONVOCADA: 'blue',
  REALIZADA: 'orange',
  FIRMADA: 'green',
  ANULADA: 'red',
};
