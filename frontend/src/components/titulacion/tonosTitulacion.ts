import type { Tone } from '../ui/Badge';
import type { EstadoTitulacion } from '../../hooks/useTitulacion';

export const TONO_ESTADO_TITULACION: Record<EstadoTitulacion, Tone> = {
  GRADUADO: 'green',
  GRADUADO_EXTEMPORANEO: 'blue',
  APROBO_NO_GRADUADO: 'orange',
};
