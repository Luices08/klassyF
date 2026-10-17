import { createHmac } from 'crypto';
import { serializacionEstable } from './comiteConvivencia';

/** Lo que entra a la huella de un cierre. Los ids viajan como texto para que la serialización sea idéntica al recalcular. */
export interface ContenidoDeHuella {
  academic_year_id: string;
  student_id: string;
  enrollment_id: string;
  group_id: string;
  version: number;
  momento: string;
  resultado: string;
  detalle: unknown;
  entrada: unknown;
  politica: unknown;
  motivo: string;
}

/**
 * HMAC-SHA256 del cierre de un estudiante. Con la clave del servidor, quien edite la base directamente no puede recalcular una huella
 * coherente (la misma lógica de los certificados de M26: no es firma digital certificada).
 */
export function huellaDeEvaluacion(clave: string, contenido: ContenidoDeHuella): string {
  return createHmac('sha256', clave).update(serializacionEstable(contenido)).digest('hex');
}
