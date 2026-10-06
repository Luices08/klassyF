import { Types } from 'mongoose';
import { ESTADOS_ASISTENCIA_BASE } from './asistencia.constants';
import { EstadoUsuario, TonoEstadoAsistencia } from '../../../constants/enums';
import AttendanceState, { AttendanceStateDocument } from './attendanceState.model';
import ApiError from '../../../utils/ApiError';
import { ESTADO_ACTIVO } from '../../../utils/filtroEstado';
import { registrarEvento } from '../../../services/audit.service';
import { exigirInstitucion } from '../../institucional';

interface ContextoActor {
  usuarioId: Types.ObjectId | string;
  ip?: string | null;
}

// Una sola institución por instalación (ver CLAUDE.md): el estado nunca recibe institucion_id del cliente.
const obtenerInstitucion = () => exigirInstitucion('Configura primero la institución antes de parametrizar la asistencia.');

const esErrorDeDuplicado = (err: unknown): boolean => (err as { code?: number })?.code === 11000;

/** Siembra los estados base la primera vez que la institución usa M13; después son suyos y no se vuelven a tocar. */
async function asegurarEstadosBase(institucionId: Types.ObjectId): Promise<void> {
  if (await AttendanceState.exists({ institucion_id: institucionId })) return;
  try {
    await AttendanceState.insertMany(ESTADOS_ASISTENCIA_BASE.map((e) => ({ ...e, institucion_id: institucionId })));
  } catch (err) {
    // Dos primeras peticiones a la vez: la otra ya sembró, que es lo que se quería.
    if (!esErrorDeDuplicado(err)) throw err;
  }
}

export async function listarEstados(incluirInactivos: boolean): Promise<AttendanceStateDocument[]> {
  const institucion = await obtenerInstitucion();
  await asegurarEstadosBase(institucion._id);
  return AttendanceState.find({
    institucion_id: institucion._id,
    ...(incluirInactivos ? {} : { estado: ESTADO_ACTIVO }),
  }).sort({ orden: 1, nombre: 1 });
}

/** Estados por id, incluidos los inactivos: un registro viejo debe poder resolver su estado aunque ya no se ofrezca. */
export async function mapaDeEstados(): Promise<Map<string, AttendanceStateDocument>> {
  const estados = await listarEstados(true);
  return new Map(estados.map((e) => [String(e._id), e]));
}

export interface DatosEstadoAsistencia {
  nombre: string;
  abreviatura: string;
  tono: TonoEstadoAsistencia;
  cuenta_como_falla: boolean;
  es_retardo: boolean;
  es_justificada: boolean;
  es_predeterminado: boolean;
  orden: number;
}

async function liberarPredeterminado(institucionId: Types.ObjectId, exceptoId?: Types.ObjectId) {
  await AttendanceState.updateMany(
    { institucion_id: institucionId, es_predeterminado: true, ...(exceptoId ? { _id: { $ne: exceptoId } } : {}) },
    { $set: { es_predeterminado: false } }
  );
}

function traducirDuplicado(err: unknown): never {
  if (esErrorDeDuplicado(err)) throw new ApiError(409, 'Ya existe un estado con ese nombre o esa abreviatura.');
  throw err;
}

export async function crearEstado(
  input: DatosEstadoAsistencia,
  { usuarioId, ip }: ContextoActor
): Promise<AttendanceStateDocument> {
  const institucion = await obtenerInstitucion();
  await asegurarEstadosBase(institucion._id);

  const estado = new AttendanceState({ ...input, institucion_id: institucion._id });
  try {
    await estado.save();
    if (estado.es_predeterminado) await liberarPredeterminado(institucion._id, estado._id);
  } catch (err) {
    traducirDuplicado(err);
  }

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'ESTADO_ASISTENCIA_CREADO',
    entidad: 'AttendanceState',
    entidad_id: estado._id,
    detalle: estado.nombre,
    ip,
  });
  return estado;
}

async function obtenerEstado(id: string): Promise<AttendanceStateDocument> {
  const estado = await AttendanceState.findById(id);
  if (!estado) throw new ApiError(404, 'Estado de asistencia no encontrado.');
  return estado;
}

export async function actualizarEstado(
  id: string,
  input: Partial<DatosEstadoAsistencia>,
  { usuarioId, ip }: ContextoActor
): Promise<AttendanceStateDocument> {
  const estado = await obtenerEstado(id);

  if (estado.es_predeterminado && input.es_predeterminado === false) {
    throw new ApiError(409, 'La planilla siempre necesita un estado predeterminado: marca otro como predeterminado en su lugar.');
  }
  if (input.es_predeterminado && estado.estado === 'inactivo') {
    throw new ApiError(409, 'Reactiva el estado antes de marcarlo como predeterminado.');
  }

  estado.set(input);
  try {
    await estado.save();
    if (input.es_predeterminado) await liberarPredeterminado(estado.institucion_id, estado._id);
  } catch (err) {
    traducirDuplicado(err);
  }

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'ESTADO_ASISTENCIA_ACTUALIZADO',
    entidad: 'AttendanceState',
    entidad_id: estado._id,
    detalle: estado.nombre,
    ip,
  });
  return estado;
}

/** No se elimina: los registros históricos y los reportes siguen resolviendo su estado; se desactiva. */
export async function cambiarEstadoActivo(
  id: string,
  nuevoEstado: EstadoUsuario,
  { usuarioId, ip }: ContextoActor
): Promise<AttendanceStateDocument> {
  const estado = await obtenerEstado(id);
  if (nuevoEstado === 'inactivo' && estado.es_predeterminado) {
    throw new ApiError(409, 'No se puede desactivar el estado predeterminado: marca otro como predeterminado primero.');
  }

  estado.estado = nuevoEstado;
  await estado.save();

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'ESTADO_ASISTENCIA_CAMBIADO',
    entidad: 'AttendanceState',
    entidad_id: estado._id,
    detalle: `${estado.nombre}: ${nuevoEstado}`,
    ip,
  });
  return estado;
}
