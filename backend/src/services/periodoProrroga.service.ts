import { Types } from 'mongoose';
import AcademicYear from '../models/academicYear.model';
import Group from '../models/group.model';
import PeriodoProrroga, { IPeriodoProrroga, PeriodoProrrogaDocument } from '../models/periodoProrroga.model';
import User from '../models/user.model';
import ApiError from '../utils/ApiError';
import { registrarEvento } from './audit.service';

export interface OtorgarProrrogaInput {
  periodo_numero: number;
  docente_id?: string | null;
  group_id?: string | null;
  hasta: Date | string;
  justificacion: string;
}

interface ContextoAuditoria {
  usuarioId: Types.ObjectId | string;
  ip?: string | null;
}

/**
 * Habilitacion excepcional para digitar notas de un periodo que ya no admite
 * calificacion (cerrado o fuera de su ventana), dirigida a un docente, a un
 * grupo o a ambos, con vencimiento y justificacion (queda en auditoria, M31).
 */
export async function otorgarProrroga(
  anioId: string,
  input: OtorgarProrrogaInput,
  { usuarioId, ip }: ContextoAuditoria
): Promise<PeriodoProrrogaDocument> {
  const anio = await AcademicYear.findById(anioId);
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
  if (anio.estado !== 'EN_CURSO') {
    throw new ApiError(409, 'Solo se conceden prórrogas en el año lectivo vigente.');
  }

  const periodo = anio.periodos.find((p) => p.numero === input.periodo_numero);
  if (!periodo) throw new ApiError(400, `El año lectivo no tiene periodo ${input.periodo_numero}.`);
  if (periodo.estado === 'PROGRAMADO') {
    throw new ApiError(409, 'El periodo aún no ha iniciado: ábrelo en lugar de conceder una prórroga.');
  }

  const hasta = new Date(input.hasta);
  if (hasta.getTime() <= Date.now()) throw new ApiError(400, 'La prórroga debe vencer en el futuro.');

  if (input.docente_id) {
    const docente = await User.findById(input.docente_id);
    if (!docente || docente.rol !== 'DOCENTE') throw new ApiError(400, 'docente_id no corresponde a un docente.');
  }
  if (input.group_id) {
    const grupo = await Group.findById(input.group_id);
    if (!grupo) throw new ApiError(404, 'Grupo no encontrado.');
    if (String(grupo.academic_year_id) !== String(anio._id)) {
      throw new ApiError(400, 'El grupo no pertenece a este año lectivo.');
    }
  }

  const prorroga = await PeriodoProrroga.create({
    academic_year_id: anio._id,
    periodo_numero: input.periodo_numero,
    docente_id: input.docente_id ?? null,
    group_id: input.group_id ?? null,
    hasta,
    justificacion: input.justificacion,
    otorgada_por_id: usuarioId,
  });

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'PRORROGA_OTORGADA',
    entidad: 'PeriodoProrroga',
    entidad_id: prorroga._id,
    detalle: `Año ${anio.year}, periodo ${input.periodo_numero}, hasta ${hasta.toISOString()}. Justificación: ${input.justificacion}`,
    ip,
  });

  return prorroga;
}

export type ProrrogaListada = Omit<IPeriodoProrroga, 'docente_id' | 'group_id'> & {
  _id: Types.ObjectId;
  docente_id: { _id: Types.ObjectId; nombre: string; apellido: string } | null;
  group_id: { _id: Types.ObjectId; nomenclatura: string } | null;
  vigente: boolean;
};

export async function listarProrrogas(anioId: string): Promise<ProrrogaListada[]> {
  const prorrogas = await PeriodoProrroga.find({ academic_year_id: anioId })
    .populate('docente_id', 'nombre apellido')
    .populate('group_id', 'nomenclatura')
    .sort({ createdAt: -1 })
    .lean<Array<Omit<ProrrogaListada, 'vigente'>>>();

  const ahora = Date.now();
  return prorrogas.map((p) => ({ ...p, vigente: !p.revocada && p.hasta.getTime() > ahora }));
}

export async function revocarProrroga(
  anioId: string,
  prorrogaId: string,
  { usuarioId, ip }: ContextoAuditoria
): Promise<PeriodoProrrogaDocument> {
  const prorroga = await PeriodoProrroga.findOneAndUpdate(
    { _id: prorrogaId, academic_year_id: anioId, revocada: false },
    { $set: { revocada: true, revocada_por_id: usuarioId, revocada_at: new Date() } },
    { new: true }
  );
  if (!prorroga) throw new ApiError(404, 'Prórroga no encontrada o ya revocada.');

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'PRORROGA_REVOCADA',
    entidad: 'PeriodoProrroga',
    entidad_id: prorroga._id,
    detalle: `Periodo ${prorroga.periodo_numero}`,
    ip,
  });

  return prorroga;
}

/**
 * ¿Hay una prorroga vigente que cubra a este docente en este grupo? Una prorroga
 * sin docente cubre a cualquiera del grupo, y una sin grupo cubre al docente en
 * cualquiera de sus grupos.
 */
export async function existeProrrogaVigente(
  anioId: Types.ObjectId | string,
  periodoNumero: number,
  groupId: Types.ObjectId | string,
  docenteId: Types.ObjectId | string | null
): Promise<boolean> {
  const prorroga = await PeriodoProrroga.exists({
    academic_year_id: anioId,
    periodo_numero: periodoNumero,
    revocada: false,
    hasta: { $gt: new Date() },
    $and: [{ $or: [{ docente_id: null }, { docente_id: docenteId }] }, { $or: [{ group_id: null }, { group_id: groupId }] }],
  });
  return prorroga !== null;
}
