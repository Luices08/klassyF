import type { Tone } from '../ui/Badge';
import type { EstadoAnticipada } from '../../hooks/usePromocionAnticipada';

export const TONO_ESTADO_ANTICIPADA: Record<EstadoAnticipada, Tone> = {
  SOLICITADA: 'orange',
  LISTA_PARA_RESOLUCION: 'blue',
  RESUELTA: 'blue',
  APLICADA: 'green',
  RECHAZADA: 'red',
  ANULADA: 'neutral',
};
