import { Types } from 'mongoose';
import { EstadoUsuario } from '../../../constants/enums';
import Campus, { CampusDocument } from './campus.model';
import Group from './group.model';
import Institution from '../institucion/institution.model';
import JornadaOperativa from './jornadaOperativa.model';
import ApiError from '../../../utils/ApiError';

export interface CrearSedeInput {
  institucion_id: string | Types.ObjectId;
  nombre: string;
  codigo_dane_sede: string;
  direccion: string;
  telefono?: string;
}

// Crea una sede adicional (no principal) para una institucion ya existente.
// La sede principal solo se crea una vez, dentro de institution.service#setupInstitution.
export async function crearSede(input: CrearSedeInput): Promise<CampusDocument> {
  const institucion = await Institution.findById(input.institucion_id);
  if (!institucion) throw new ApiError(404, 'institucion_id no corresponde a una institucion existente.');

  return Campus.create({ ...input, telefono: input.telefono || null, es_principal: false });
}

export interface ActualizarSedeInput {
  nombre: string;
  codigo_dane_sede: string;
  direccion: string;
  telefono?: string;
}

export async function actualizarSede(id: string, input: ActualizarSedeInput): Promise<CampusDocument> {
  const sede = await Campus.findById(id);
  if (!sede) throw new ApiError(404, 'La sede indicada no existe.');

  sede.nombre = input.nombre;
  sede.codigo_dane_sede = input.codigo_dane_sede;
  sede.direccion = input.direccion;
  if (input.telefono !== undefined) sede.telefono = input.telefono || null;
  await sede.save();

  return sede;
}

// Desactivar es reversible (a diferencia de eliminarSede) — para una sede que
// dejo de operar temporalmente, sin perder sus jornadas/grupos historicos.
export async function actualizarEstadoSede(id: string, estado: EstadoUsuario): Promise<CampusDocument> {
  const sede = await Campus.findById(id);
  if (!sede) throw new ApiError(404, 'La sede indicada no existe.');
  if (sede.es_principal && estado === 'inactivo') {
    throw new ApiError(400, 'No se puede desactivar la sede principal de la institución.');
  }

  sede.estado = estado;
  await sede.save();

  return sede;
}

// No borra la sede principal (es la creada junto con la institucion) ni una
// sede que ya tiene jornadas o grupos, para no dejar esos registros huerfanos.
export async function eliminarSede(id: string): Promise<void> {
  const sede = await Campus.findById(id);
  if (!sede) throw new ApiError(404, 'La sede indicada no existe.');
  if (sede.es_principal) {
    throw new ApiError(400, 'No se puede eliminar la sede principal de la institución.');
  }

  const [tieneJornadas, tieneGrupos] = await Promise.all([
    JornadaOperativa.countDocuments({ sede_id: id }),
    Group.countDocuments({ sede_id: id }),
  ]);
  if (tieneJornadas > 0 || tieneGrupos > 0) {
    throw new ApiError(409, 'No se puede eliminar la sede porque tiene jornadas o grupos asociados.');
  }

  await Campus.deleteOne({ _id: id });
}
