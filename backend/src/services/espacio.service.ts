import { Types } from 'mongoose';
import { EstadoEspacio, RecursoEspacio, TipoEspacio } from '../constants/enums';
import Area from '../models/area.model';
import Campus from '../models/campus.model';
import Espacio, { EspacioDocument } from '../models/espacio.model';
import Group from '../models/group.model';
import Institution from '../models/institution.model';
import ApiError from '../utils/ApiError';
import { registrarEvento } from './audit.service';

interface ContextoUsuario {
  usuarioId: Types.ObjectId | string;
  ip?: string | null;
}

export interface EspacioInput {
  sede_id: string;
  nombre: string;
  tipo_espacio: TipoEspacio;
  capacidad: number;
  piso_bloque?: string | null;
  recursos?: RecursoEspacio[];
  computadores_operativos?: number;
  areas_exclusivas?: string[];
  admite_grupos_simultaneos?: boolean;
}

export type ActualizarEspacioInput = Omit<EspacioInput, 'sede_id'>;

/**
 * M10 es opcional por modalidad: una institucion VIRTUAL no tiene espacios fisicos, asi que no se registran espacios
 * ni se asignan aulas a los grupos. Los documentos anteriores al campo `modalidad` cuentan como PRESENCIAL.
 */
export async function exigirEspaciosFisicos(): Promise<void> {
  const institucion = await Institution.findOne().select('modalidad');
  if (institucion?.modalidad === 'VIRTUAL') {
    throw new ApiError(
      409,
      'La institución está configurada como virtual: no usa espacios físicos. Cambia la modalidad en Configuración institucional.'
    );
  }
}

async function exigirAreasExistentes(ids: string[] | undefined): Promise<void> {
  if (!ids || ids.length === 0) return;
  const existentes = await Area.countDocuments({ _id: { $in: ids } });
  if (existentes !== new Set(ids).size) throw new ApiError(400, 'Una o más áreas exclusivas no existen.');
}

function traducirDuplicado(err: unknown): never {
  if ((err as { code?: number }).code === 11000) {
    throw new ApiError(409, 'Ya existe un espacio con ese nombre en la sede.');
  }
  throw err;
}

function datosEditables(input: ActualizarEspacioInput) {
  return {
    nombre: input.nombre,
    tipo_espacio: input.tipo_espacio,
    capacidad: input.capacidad,
    piso_bloque: input.piso_bloque || null,
    recursos: input.recursos ?? [],
    computadores_operativos: input.computadores_operativos ?? 0,
    areas_exclusivas: input.areas_exclusivas ?? [],
    admite_grupos_simultaneos: input.admite_grupos_simultaneos ?? false,
  };
}

export async function crearEspacio(input: EspacioInput, { usuarioId, ip }: ContextoUsuario): Promise<EspacioDocument> {
  await exigirEspaciosFisicos();
  const sede = await Campus.findById(input.sede_id);
  if (!sede) throw new ApiError(404, 'La sede indicada no existe.');
  await exigirAreasExistentes(input.areas_exclusivas);

  let espacio: EspacioDocument;
  try {
    espacio = await Espacio.create({ sede_id: sede._id, ...datosEditables(input) });
  } catch (err) {
    return traducirDuplicado(err);
  }

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'ESPACIO_CREADO',
    entidad: 'Espacio',
    entidad_id: espacio._id,
    detalle: `${espacio.nombre} (${espacio.tipo_espacio}, aforo ${espacio.capacidad}) en ${sede.nombre}`,
    ip,
  });
  return espacio;
}

/** La sede no se cambia: los grupos que lo usan como salon titular quedarian apuntando a otra sede. */
export async function actualizarEspacio(
  id: string,
  input: ActualizarEspacioInput,
  { usuarioId, ip }: ContextoUsuario
): Promise<EspacioDocument> {
  const espacio = await Espacio.findById(id);
  if (!espacio) throw new ApiError(404, 'Espacio no encontrado.');
  await exigirAreasExistentes(input.areas_exclusivas);

  // validarAulaParaGrupo solo exige AULA_REGULAR al crear/reactivar el grupo: si el espacio deja
  // de serlo mientras sigue siendo el salon titular de alguno, esa regla M01<->M10 quedaria rota
  // en silencio. Igual que eliminarEspacio, se revisa cualquier grupo que lo referencie (no solo
  // los ACTIVOS): reasigna esos grupos a otra aula antes de cambiar el tipo de este espacio.
  if (input.tipo_espacio !== 'AULA_REGULAR' && (await Group.countDocuments({ aula_id: espacio._id })) > 0) {
    throw new ApiError(
      409,
      'El espacio es el salón titular de uno o más grupos: solo un aula regular puede serlo. Reasigna esos grupos a otra aula antes de cambiar el tipo.'
    );
  }

  espacio.set(datosEditables(input));
  try {
    await espacio.save();
  } catch (err) {
    return traducirDuplicado(err);
  }

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'ESPACIO_ACTUALIZADO',
    entidad: 'Espacio',
    entidad_id: espacio._id,
    detalle: `${espacio.nombre}: aforo ${espacio.capacidad}, tipo ${espacio.tipo_espacio}`,
    ip,
  });
  return espacio;
}

export async function cambiarEstadoEspacio(
  id: string,
  estado: EstadoEspacio,
  { usuarioId, ip }: ContextoUsuario
): Promise<EspacioDocument> {
  const espacio = await Espacio.findByIdAndUpdate(id, { $set: { estado } }, { new: true, runValidators: true });
  if (!espacio) throw new ApiError(404, 'Espacio no encontrado.');

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'ESPACIO_ESTADO_CAMBIADO',
    entidad: 'Espacio',
    entidad_id: espacio._id,
    detalle: `${espacio.nombre} → ${estado}`,
    ip,
  });
  return espacio;
}

/** Un espacio que ya fue salon titular de algun grupo no se borra (dejaria grupos sin su aula historica): se inhabilita. */
export async function eliminarEspacio(id: string, { usuarioId, ip }: ContextoUsuario): Promise<void> {
  const espacio = await Espacio.findById(id);
  if (!espacio) throw new ApiError(404, 'Espacio no encontrado.');

  if ((await Group.countDocuments({ aula_id: espacio._id })) > 0) {
    throw new ApiError(409, 'El espacio es el salón titular de uno o más grupos. Inhabilítalo en lugar de eliminarlo.');
  }
  await Espacio.deleteOne({ _id: espacio._id });

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'ESPACIO_ELIMINADO',
    entidad: 'Espacio',
    entidad_id: espacio._id,
    detalle: espacio.nombre,
    ip,
  });
}

export interface GrupoAsignado {
  _id: Types.ObjectId;
  nomenclatura: string;
  grado: string;
  max_capacity: number;
  jornada: { _id: Types.ObjectId; nombre: string; hora_inicio: string; hora_fin: string } | null;
}

export interface ListarEspaciosFilter {
  sede_id?: string;
  tipo_espacio?: TipoEspacio;
  estado?: EstadoEspacio;
  /** Año lectivo de los grupos que se reportan como asignados (todos los años si se omite). */
  academic_year_id?: string;
}

interface GrupoPoblado {
  _id: Types.ObjectId;
  aula_id: Types.ObjectId;
  nomenclatura: string;
  max_capacity: number;
  grade_id?: { nombre: string } | null;
  jornada_id?: { _id: Types.ObjectId; nombre: string; hora_inicio: string; hora_fin: string } | null;
}

/**
 * Directorio de espacios con los grupos ACTIVOS que los usan como salon titular. `sobrecupo` marca un espacio
 * cuyo aforo quedo por debajo del cupo de algun grupo asignado (p. ej. tras reducir el aforo o con politica ADVERTIR).
 */
export async function listarEspacios(filter: ListarEspaciosFilter) {
  const query: Record<string, unknown> = {};
  if (filter.sede_id) query.sede_id = filter.sede_id;
  if (filter.tipo_espacio) query.tipo_espacio = filter.tipo_espacio;
  if (filter.estado) query.estado = filter.estado;

  const espacios = await Espacio.find(query).sort({ nombre: 1 }).populate('sede_id', 'nombre').lean();
  if (espacios.length === 0) return [];

  const filtroGrupos: Record<string, unknown> = { aula_id: { $in: espacios.map((e) => e._id) }, estado: 'ACTIVE' };
  if (filter.academic_year_id) filtroGrupos.academic_year_id = filter.academic_year_id;

  const grupos = await Group.find(filtroGrupos)
    .populate('grade_id', 'nombre')
    .populate('jornada_id', 'nombre hora_inicio hora_fin')
    .sort({ nomenclatura: 1 })
    .lean<GrupoPoblado[]>();

  return espacios.map((e) => {
    const asignados: GrupoAsignado[] = grupos
      .filter((g) => String(g.aula_id) === String(e._id))
      .map((g) => ({
        _id: g._id,
        nomenclatura: g.nomenclatura,
        grado: g.grade_id?.nombre ?? '—',
        max_capacity: g.max_capacity,
        jornada: g.jornada_id ?? null,
      }));
    return { ...e, grupos_asignados: asignados, sobrecupo: asignados.some((g) => g.max_capacity > e.capacidad) };
  });
}

export interface AulaDeGrupoInput {
  aula_id: string | Types.ObjectId;
  sede_id: string | Types.ObjectId;
  jornada_id: string | Types.ObjectId;
  academic_year_id: string | Types.ObjectId;
  max_capacity: number;
  /** Al reactivar un grupo existente: no compararlo consigo mismo. */
  excluir_group_id?: string | Types.ObjectId;
}

const ESTADO_LEGIBLE: Record<EstadoEspacio, string> = {
  DISPONIBLE: 'disponible',
  EN_MANTENIMIENTO: 'en mantenimiento',
  INACTIVO: 'inactivo',
};

/**
 * Regla M01 <-> M10: el salon titular de un grupo debe ser un aula regular disponible de su misma sede, no puede
 * estar ya asignada a otro grupo de la misma jornada y año (salvo espacios de uso simultaneo) y el cupo del grupo
 * no debe pasar del aforo. Segun la politica de la institucion, pasarse del aforo bloquea (BLOQUEAR) o solo se
 * devuelve como advertencia (ADVERTIR) para que el llamador la deje en auditoria.
 */
export async function validarAulaParaGrupo(input: AulaDeGrupoInput): Promise<{ advertencia: string | null }> {
  const espacio = await Espacio.findById(input.aula_id);
  if (!espacio) throw new ApiError(404, 'El aula indicada no existe.');
  if (String(espacio.sede_id) !== String(input.sede_id)) {
    throw new ApiError(400, 'El aula pertenece a otra sede distinta a la del grupo.');
  }
  if (espacio.tipo_espacio !== 'AULA_REGULAR') {
    throw new ApiError(400, 'Solo un aula regular puede ser el salón titular de un grupo.');
  }
  if (espacio.estado !== 'DISPONIBLE') {
    throw new ApiError(409, `El aula "${espacio.nombre}" está ${ESTADO_LEGIBLE[espacio.estado]}.`);
  }

  if (!espacio.admite_grupos_simultaneos) {
    const filtro: Record<string, unknown> = {
      aula_id: espacio._id,
      academic_year_id: input.academic_year_id,
      jornada_id: input.jornada_id,
      estado: 'ACTIVE',
    };
    if (input.excluir_group_id) filtro._id = { $ne: input.excluir_group_id };
    const ocupante = await Group.findOne(filtro).select('nomenclatura');
    if (ocupante) {
      throw new ApiError(409, `El aula "${espacio.nombre}" ya es el salón titular del grupo ${ocupante.nomenclatura} en esa jornada.`);
    }
  }

  if (input.max_capacity <= espacio.capacidad) return { advertencia: null };

  const mensaje = `El cupo máximo (${input.max_capacity}) supera el aforo del aula "${espacio.nombre}" (${espacio.capacidad}).`;
  const institucion = await Institution.findOne().select('politica_aforo_aula');
  if ((institucion?.politica_aforo_aula ?? 'BLOQUEAR') === 'BLOQUEAR') {
    throw new ApiError(
      409,
      `${mensaje} Reduce el cupo, elige un aula con más aforo o cambia la política de aforo en Configuración institucional.`
    );
  }
  return { advertencia: mensaje };
}
