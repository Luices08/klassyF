import {
  type EstadoCitacion,
  NOMBRES_ESTADO_CITACION,
  NOMBRES_RESPUESTA,
  NOMBRES_SITUACION_CORREO,
  type RespuestaAsistencia,
  type SituacionCorreo,
} from '../../hooks/useCitaciones';
import { Chip, type Tone } from '../ui/Badge';

const TONO_ESTADO: Record<EstadoCitacion, Tone> = { PROGRAMADA: 'blue', REALIZADA: 'green', CANCELADA: 'neutral' };
const TONO_RESPUESTA: Record<RespuestaAsistencia, Tone> = { PENDIENTE: 'neutral', CONFIRMADA: 'green', NO_ASISTIRA: 'red' };
const TONO_CORREO: Record<SituacionCorreo, Tone> = { SIN_CORREO: 'neutral', NO_ENVIADO: 'orange', EN_COLA: 'blue', ENVIADO: 'green', FALLIDO: 'red', OMITIDO: 'neutral' };

export function EstadoCitacionChip({ estado }: { estado: EstadoCitacion }) {
  return <Chip tone={TONO_ESTADO[estado]}>{NOMBRES_ESTADO_CITACION[estado]}</Chip>;
}

export function RespuestaChip({ respuesta }: { respuesta: RespuestaAsistencia }) {
  return <Chip tone={TONO_RESPUESTA[respuesta]}>{NOMBRES_RESPUESTA[respuesta]}</Chip>;
}

export function CorreoChip({ situacion }: { situacion: SituacionCorreo }) {
  return <Chip tone={TONO_CORREO[situacion]}>{NOMBRES_SITUACION_CORREO[situacion]}</Chip>;
}
