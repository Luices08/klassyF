import { Types } from 'mongoose';
import { EstadoArea } from '../constants/enums';
import Area, { AreaDocument } from '../models/area.model';
import Institution from '../models/institution.model';
import Subject from '../models/subject.model';
import ApiError from '../utils/ApiError';
import { ESTADO_ACTIVO, filtroPorEstado } from '../utils/filtroEstado';
import { registrarEvento } from './audit.service';

interface ContextoActor {
  usuarioId: Types.ObjectId | string;
  ip?: string | null;
}

// Una sola institucion por instalacion (ver CLAUDE.md): el area nunca recibe
// institucion_id del cliente, se resuelve aqui, igual que academicYear.service.ts.
async function obtenerInstitucion() {
  const institucion = await Institution.findOne();
  if (!institucion) throw new ApiError(409, 'Configura primero la institución antes de crear áreas.');
  return institucion;
}

export interface CrearAreaInput {
  nombre: string;
  descripcion: string;
  codigo: string;
}

export async function crearArea(input: CrearAreaInput, { usuarioId, ip }: ContextoActor): Promise<AreaDocument> {
  const institucion = await obtenerInstitucion();
  const area = await Area.create({
    institucion_id: institucion._id,
    nombre: input.nombre,
    descripcion: input.descripcion,
    codigo: input.codigo,
  });

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'AREA_CREADA',
    entidad: 'Area',
    entidad_id: area._id,
    detalle: `${area.nombre} (${area.codigo})`,
    ip,
  });
  return area;
}

export interface ListarAreasFilter {
  estado?: EstadoArea;
}

export async function listarAreas(filter: ListarAreasFilter): Promise<AreaDocument[]> {
  const query: Record<string, unknown> = {};
  if (filter.estado) query.estado = filtroPorEstado(filter.estado);
  return Area.find(query).sort({ nombre: 1 });
}

export interface ActualizarAreaInput {
  nombre?: string;
  descripcion?: string;
  codigo?: string;
}

export async function actualizarArea(
  id: string,
  input: ActualizarAreaInput,
  { usuarioId, ip }: ContextoActor
): Promise<AreaDocument> {
  const area = await Area.findByIdAndUpdate(id, input, { new: true, runValidators: true });
  if (!area) throw new ApiError(404, 'Área no encontrada.');

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'AREA_ACTUALIZADA',
    entidad: 'Area',
    entidad_id: area._id,
    detalle: `${area.nombre} (${area.codigo})`,
    ip,
  });
  return area;
}

export async function actualizarEstadoArea(
  id: string,
  estado: EstadoArea,
  { usuarioId, ip }: ContextoActor
): Promise<AreaDocument> {
  const area = await Area.findById(id);
  if (!area) throw new ApiError(404, 'Área no encontrada.');

  if (estado === 'inactivo') {
    const asignaturasActivas = await Subject.countDocuments({ area_id: area._id, estado: ESTADO_ACTIVO });
    if (asignaturasActivas > 0) {
      throw new ApiError(
        409,
        'El área tiene asignaturas activas asociadas. Inactívalas o reubícalas en otra área antes de inactivar el área.'
      );
    }
  }

  area.estado = estado;
  await area.save();

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'AREA_ESTADO_CAMBIADO',
    entidad: 'Area',
    entidad_id: area._id,
    detalle: `${area.nombre} → ${estado}`,
    ip,
  });
  return area;
}
