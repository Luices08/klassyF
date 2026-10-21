import { Types } from 'mongoose';
import { ROLES } from '../constants/roles';
import Campus from '../models/campus.model';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import JornadaOperativa from '../models/jornadaOperativa.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { etiquetaDeGrupo } from '../utils/sabanaCalificaciones';

export interface FiltrosAlcance {
  sede_id?: string;
  jornada_id?: string;
  grade_id?: string;
  group_id?: string;
}

export interface GrupoDelAlcance {
  _id: Types.ObjectId;
  etiqueta: string;
  grado: string;
  gradoNumero: number;
  nomenclatura: string;
  sede: string;
  jornada: string;
  sede_id: Types.ObjectId;
  jornada_id: Types.ObjectId;
  grade_id: Types.ObjectId;
}

/**
 * Los grupos de un año que cubren los filtros en cascada (sede → jornada → grado → grupo; cada uno opcional). Secretaría solo ve las sedes que tiene
 * asignadas y, sin ninguna, no ve nada. Ordenados por grado, grupo y sede. Sin coincidencias, 404.
 */
export async function gruposDelAlcance(anioId: Types.ObjectId | string, filtros: FiltrosAlcance, usuario: UserDocument): Promise<GrupoDelAlcance[]> {
  const filtro: Record<string, unknown> = { academic_year_id: anioId };
  if (usuario.rol === ROLES.SECRETARIA) {
    const propias = (usuario.sedes_ids ?? []).map(String);
    filtro.sede_id = filtros.sede_id ? (propias.includes(String(filtros.sede_id)) ? filtros.sede_id : { $in: [] }) : { $in: propias };
  } else if (filtros.sede_id) filtro.sede_id = filtros.sede_id;
  if (filtros.jornada_id) filtro.jornada_id = filtros.jornada_id;
  if (filtros.grade_id) filtro.grade_id = filtros.grade_id;
  if (filtros.group_id) filtro._id = filtros.group_id;
  const grupos = await Group.find(filtro).lean();
  if (grupos.length === 0) throw new ApiError(404, 'No hay grupos que coincidan con los filtros elegidos.');

  const [grados, sedes, jornadas] = await Promise.all([
    Grade.find({ _id: { $in: grupos.map((g) => g.grade_id) } }).select('nombre numero').lean(),
    Campus.find({ _id: { $in: grupos.map((g) => g.sede_id) } }).select('nombre').lean(),
    JornadaOperativa.find({ _id: { $in: grupos.map((g) => g.jornada_id) } }).select('nombre').lean(),
  ]);
  const gradoPor = new Map(grados.map((g) => [String(g._id), g]));
  const sedePor = new Map(sedes.map((s) => [String(s._id), s.nombre]));
  const jornadaPor = new Map(jornadas.map((j) => [String(j._id), j.nombre]));
  return grupos
    .map((g): GrupoDelAlcance => {
      const grado = gradoPor.get(String(g.grade_id));
      return {
        _id: g._id,
        etiqueta: etiquetaDeGrupo(grado?.numero ?? 0, grado?.nombre ?? '', g.nomenclatura),
        grado: grado?.nombre ?? '',
        gradoNumero: grado?.numero ?? 0,
        nomenclatura: g.nomenclatura,
        sede: sedePor.get(String(g.sede_id)) ?? '',
        jornada: jornadaPor.get(String(g.jornada_id)) ?? '',
        sede_id: g.sede_id,
        jornada_id: g.jornada_id,
        grade_id: g.grade_id,
      };
    })
    .sort((a, b) => a.gradoNumero - b.gradoNumero || a.nomenclatura.localeCompare(b.nomenclatura, 'es') || a.sede.localeCompare(b.sede, 'es'));
}

/** «Todas las sedes · Todas las jornadas · Todos los grados · Todos los grupos» o lo que se haya elegido, para el encabezado del archivo. */
export function describirAlcance(grupos: GrupoDelAlcance[], filtros: FiltrosAlcance): string {
  const unico = (valores: string[]) => [...new Set(valores)];
  const sedes = unico(grupos.map((g) => g.sede));
  const jornadas = unico(grupos.map((g) => g.jornada));
  const grados = unico(grupos.map((g) => g.grado));
  return [
    filtros.sede_id && sedes.length === 1 ? sedes[0] : 'Todas las sedes',
    filtros.jornada_id && jornadas.length === 1 ? `Jornada ${(jornadas[0] ?? '').toLowerCase()}` : 'Todas las jornadas',
    filtros.grade_id && grados.length === 1 ? grados[0] : 'Todos los grados',
    filtros.group_id && grupos.length === 1 ? `Grupo ${grupos[0]?.etiqueta}` : 'Todos los grupos',
  ].join(' · ');
}
