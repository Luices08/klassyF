import { Types } from 'mongoose';
import { EstadoArea, NivelEducativo } from '../constants/enums';
import { AlcanceJornada } from '../constants/planeacion';
import { ROLES } from '../constants/roles';
import Area from '../models/area.model';
import Campus from '../models/campus.model';
import LiderArea, { LiderAreaDocument } from '../models/liderArea.model';
import PlanArea from '../models/planArea.model';
import User from '../models/user.model';
import ApiError from '../utils/ApiError';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { AlcanceLider, alcancesSeSolapan, textoDeAlcance } from '../utils/liderArea';
import { registrarEvento } from './audit.service';

/**
 * Líderes de área (M07): quién responde por el plan de área de qué parte de la institución. Coordinación y administración los
 * designan en el Catálogo académico. Cualquier docente activo puede serlo, dicte o no en el área.
 */

interface ContextoActor {
  usuarioId: Types.ObjectId | string;
  ip?: string | null;
}

export interface DatosLiderArea {
  docente_id: string;
  /** Vacío = todos los niveles. */
  niveles?: NivelEducativo[];
  /** Por defecto, todas las jornadas. */
  jornada?: AlcanceJornada;
  /** Vacío = todas las sedes (lo normal: una persona por área para toda la institución). */
  sedes_ids?: string[];
}

export type CambiosLiderArea = Partial<DatosLiderArea> & { estado?: EstadoArea };

const alcanceDe = (l: Pick<LiderAreaDocument, 'niveles' | 'jornada' | 'sedes_ids'>): AlcanceLider => ({
  niveles: l.niveles,
  jornada: l.jornada,
  sedes_ids: l.sedes_ids.map(String),
});

async function nombresDeSedes(ids: ReadonlyArray<Types.ObjectId | string>): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const sedes = await Campus.find({ _id: { $in: ids } }).select('nombre').lean();
  return new Map(sedes.map((s) => [String(s._id), s.nombre]));
}

/** Cómo viaja un líder por la API: con el nombre del docente y de las sedes, y el texto de lo que cubre ya armado. */
export async function vistasDeLideres(lideres: readonly LiderAreaDocument[]) {
  const [docentes, sedes, conPlanes] = await Promise.all([
    User.find({ _id: { $in: lideres.map((l) => l.docente_id) } }).select('nombre apellido estado').lean(),
    nombresDeSedes(lideres.flatMap((l) => l.sedes_ids)),
    PlanArea.distinct('lider_area_id', { lider_area_id: { $in: lideres.map((l) => l._id) } }),
  ]);
  const docentePorId = new Map(docentes.map((d) => [String(d._id), d]));
  const conPlan = new Set(conPlanes.map(String));

  return lideres.map((l) => {
    const docente = docentePorId.get(String(l.docente_id));
    return {
      _id: String(l._id),
      area_id: String(l.area_id),
      docente: docente ? { _id: String(docente._id), nombre: docente.nombre, apellido: docente.apellido, estado: docente.estado } : null,
      niveles: l.niveles,
      jornada: l.jornada,
      sedes: l.sedes_ids.map((id) => ({ _id: String(id), nombre: sedes.get(String(id)) ?? 'Sede' })),
      alcance_texto: textoDeAlcance(alcanceDe(l), sedes),
      estado: l.estado,
      tiene_planes: conPlan.has(String(l._id)),
    };
  });
}

export async function listarLideresArea(filtro: { area_id?: string; incluir_inactivos?: boolean }) {
  const lideres = await LiderArea.find({
    ...(filtro.area_id ? { area_id: filtro.area_id } : {}),
    ...(filtro.incluir_inactivos ? {} : { estado: ESTADO_ACTIVO }),
  }).sort({ createdAt: 1 });
  return vistasDeLideres(lideres);
}

async function exigirDocenteActivo(docenteId: string): Promise<void> {
  if (!(await User.exists({ _id: docenteId, rol: ROLES.DOCENTE, estado: ESTADO_ACTIVO }))) {
    throw new ApiError(400, 'El líder del área debe ser un docente activo.');
  }
}

async function exigirSedesExistentes(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  if ((await Campus.countDocuments({ _id: { $in: ids } })) !== new Set(ids).size) throw new ApiError(400, 'Alguna de las sedes elegidas no existe.');
}

/** Dos líderes activos de la misma área no cubren lo mismo: si no, no se sabría de quién es el plan de ese pedazo. */
async function exigirSinSolape(areaId: Types.ObjectId | string, alcance: AlcanceLider, excluirId?: Types.ObjectId): Promise<void> {
  const otros = await LiderArea.find({ area_id: areaId, estado: ESTADO_ACTIVO, ...(excluirId ? { _id: { $ne: excluirId } } : {}) });
  const choque = otros.find((o) => alcancesSeSolapan(alcance, alcanceDe(o)));
  if (!choque) return;
  const [docente, sedes] = await Promise.all([User.findById(choque.docente_id).select('nombre apellido').lean(), nombresDeSedes(choque.sedes_ids)]);
  throw new ApiError(
    409,
    `Ya hay un líder para parte de eso: ${docente ? `${docente.nombre} ${docente.apellido}` : 'otro docente'} cubre ${textoDeAlcance(alcanceDe(choque), sedes)}. Ajusta el alcance para que no se crucen.`
  );
}

export async function crearLiderArea(areaId: string, datos: DatosLiderArea, { usuarioId, ip }: ContextoActor) {
  const area = await Area.findById(areaId);
  if (!area) throw new ApiError(404, 'Área no encontrada.');
  if (area.estado === 'inactivo') throw new ApiError(409, 'El área está inactiva: reactívala antes de asignarle un líder.');
  await exigirDocenteActivo(datos.docente_id);
  const sedes = [...new Set(datos.sedes_ids ?? [])];
  await exigirSedesExistentes(sedes);

  const niveles = [...new Set(datos.niveles ?? [])];
  const jornada = datos.jornada ?? 'TODAS';
  await exigirSinSolape(area._id, { niveles, jornada, sedes_ids: sedes });

  const lider = await LiderArea.create({ area_id: area._id, docente_id: datos.docente_id, niveles, jornada, sedes_ids: sedes });
  const [vista] = await vistasDeLideres([lider]);
  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'LIDER_AREA_ASIGNADO',
    entidad: 'LiderArea',
    entidad_id: lider._id,
    detalle: `${area.nombre}: líder ${datos.docente_id}, ${vista!.alcance_texto}.`,
    ip,
  });
  return vista!;
}

export async function actualizarLiderArea(id: string, cambios: CambiosLiderArea, { usuarioId, ip }: ContextoActor) {
  const lider = await LiderArea.findById(id);
  if (!lider) throw new ApiError(404, 'Líder de área no encontrado.');

  if (cambios.docente_id !== undefined && cambios.docente_id !== String(lider.docente_id)) {
    await exigirDocenteActivo(cambios.docente_id);
    lider.docente_id = new Types.ObjectId(cambios.docente_id);
  }
  if (cambios.niveles !== undefined) lider.niveles = [...new Set(cambios.niveles)];
  if (cambios.jornada !== undefined) lider.jornada = cambios.jornada;
  if (cambios.sedes_ids !== undefined) {
    const sedes = [...new Set(cambios.sedes_ids)];
    await exigirSedesExistentes(sedes);
    lider.sedes_ids = sedes.map((s) => new Types.ObjectId(s));
  }
  if (cambios.estado !== undefined) lider.estado = cambios.estado;

  // Solo un líder activo compite por un pedazo: reactivar uno o cambiar su alcance se revisa contra los demás.
  if (lider.estado !== 'inactivo') await exigirSinSolape(lider.area_id, alcanceDe(lider), lider._id);
  await lider.save();

  const [vista] = await vistasDeLideres([lider]);
  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'LIDER_AREA_ACTUALIZADO',
    entidad: 'LiderArea',
    entidad_id: lider._id,
    detalle: `Líder ${String(lider.docente_id)}, ${vista!.alcance_texto}, ${lider.estado}.`,
    ip,
  });
  return vista!;
}

/**
 * Quita un líder. Si ya cargó planes no se borra (el plan cuelga de él): queda inactivo y deja de contar como líder. Sin planes
 * se elimina del todo.
 */
export async function quitarLiderArea(id: string, { usuarioId, ip }: ContextoActor): Promise<{ eliminado: boolean; desactivado: boolean }> {
  const lider = await LiderArea.findById(id);
  if (!lider) throw new ApiError(404, 'Líder de área no encontrado.');

  const tienePlanes = await PlanArea.exists({ lider_area_id: lider._id });
  if (tienePlanes) lider.estado = 'inactivo';
  await (tienePlanes ? lider.save() : lider.deleteOne());

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'LIDER_AREA_QUITADO',
    entidad: 'LiderArea',
    entidad_id: lider._id,
    detalle: `Líder ${String(lider.docente_id)} del área ${String(lider.area_id)}: ${tienePlanes ? 'desactivado (tiene planes cargados)' : 'eliminado'}.`,
    ip,
  });
  return { eliminado: !tienePlanes, desactivado: Boolean(tienePlanes) };
}
