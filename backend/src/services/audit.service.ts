import { Types } from 'mongoose';
import AuditLog, { AccionAuditoria } from '../models/auditLog.model';

interface RegistrarEventoInput {
  usuario_id?: Types.ObjectId | string | null;
  accion: AccionAuditoria;
  entidad: string;
  entidad_id?: Types.ObjectId | string | null;
  detalle?: string | null;
  ip?: string | null;
}

/**
 * Registra un evento de auditoria (M31 minimo). Nunca debe tumbar la accion de
 * negocio que la origino: un fallo aqui solo se deja en consola.
 */
export async function registrarEvento(input: RegistrarEventoInput): Promise<void> {
  try {
    await AuditLog.create({
      usuario_id: input.usuario_id ?? null,
      accion: input.accion,
      entidad: input.entidad,
      entidad_id: input.entidad_id ?? null,
      detalle: input.detalle ?? null,
      ip: input.ip ?? null,
    });
  } catch (err) {
    console.error('No se pudo registrar el evento de auditoria:', err);
  }
}
