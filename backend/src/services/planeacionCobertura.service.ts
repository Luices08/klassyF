import { Types } from 'mongoose';
import { ROLES } from '../constants/roles';
import { TIPO_DE_JORNADA, TipoJornada } from '../constants/planeacion';
import Area from '../models/area.model';
import Campus from '../models/campus.model';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import JornadaOperativa from '../models/jornadaOperativa.model';
import LiderArea from '../models/liderArea.model';
import PlanArea from '../models/planArea.model';
import StudyPlan from '../models/studyPlan.model';
import Subject from '../models/subject.model';
import User from '../models/user.model';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { CoberturaConPlan, Rebanada } from '../utils/liderArea';
import { asignaturasPorGrado } from '../utils/planeacion';

/**
 * Lo que M07 lee para saber quién lidera qué y qué necesita cada área: solo modelos (sin ciclos de importación), porque lo usan
 * la activación del año (M05), las actividades (M11) y el plan de aula.
 */

export interface CoberturaDelAnio extends CoberturaConPlan {
  area_id: string;
  docente_id: string;
  /** El docente sigue activo: un líder dado de baja cuenta como «sin líder» mientras su plan no esté aprobado. */
  docente_activo: boolean;
  estado_registro: 'activo' | 'inactivo';
}

/**
 * Los líderes de las áreas dadas con el estado de su plan de área del año. Por defecto solo los activos; `conHistorial` suma los
 * que ya no lideran pero dejaron un plan ese año (para que el listado de coordinación los muestre).
 */
export async function cargarCoberturas(
  anioId: string | Types.ObjectId,
  areaIds?: ReadonlyArray<string | Types.ObjectId>,
  { conHistorial = false }: { conHistorial?: boolean } = {}
): Promise<CoberturaDelAnio[]> {
  const filtroArea = areaIds ? { area_id: { $in: areaIds } } : {};
  const planes = await PlanArea.find({ academic_year_id: anioId, ...filtroArea }).select('lider_area_id estado').lean();
  const planDeLider = new Map(planes.map((p) => [String(p.lider_area_id), p]));

  const lideres = await LiderArea.find({
    ...filtroArea,
    $or: [{ estado: ESTADO_ACTIVO }, ...(conHistorial ? [{ _id: { $in: [...planDeLider.keys()] } }] : [])],
  }).lean();
  if (lideres.length === 0) return [];

  const docentesActivos = new Set(
    (await User.find({ _id: { $in: lideres.map((l) => l.docente_id) }, roles: ROLES.DOCENTE, estado: ESTADO_ACTIVO }).select('_id').lean()).map((u) => String(u._id))
  );

  return lideres.map((l) => {
    const plan = planDeLider.get(String(l._id));
    return {
      _id: String(l._id),
      area_id: String(l.area_id),
      docente_id: String(l.docente_id),
      docente_activo: docentesActivos.has(String(l.docente_id)),
      estado_registro: l.estado === 'inactivo' ? 'inactivo' : 'activo',
      alcance: { niveles: l.niveles, jornada: l.jornada, sedes_ids: l.sedes_ids.map(String) },
      estado: plan?.estado ?? 'SIN_CARGAR',
      plan_id: plan ? String(plan._id) : null,
    };
  });
}

export interface DemandaDelAnio {
  /** Áreas activas con al menos una asignatura obligatoria en el plan de estudios del año. */
  areas: Array<{ _id: Types.ObjectId; nombre: string; codigo: string }>;
  /** Por área: los pedazos de la institución (nivel, jornada y sede) donde se dicta con carácter obligatorio. */
  rebanadas: Map<string, Rebanada[]>;
}

/**
 * Qué áreas exigen plan de área y en qué parte de la institución: «obligatoria» se deriva del plan de estudios (M06) grado por
 * grado, y la jornada y la sede salen de los grupos activos de ese grado. Un grado sin grupos todavía exige su nivel completo
 * (jornada y sede sin definir): el líder de cualquier jornada lo cubre.
 */
export async function demandaDelAnio(anioId: string | Types.ObjectId): Promise<DemandaDelAnio> {
  const plan = await StudyPlan.findOne({ academic_year_id: anioId })
    .select('grades.grade_id grades.asignaturas grades.jornadas_personalizadas.asignaturas_agregadas grades.personalizaciones_grupo.asignaturas_agregadas')
    .lean();
  const porGrado = asignaturasPorGrado(plan);
  const todas = new Set([...porGrado.values()].flatMap((ids) => [...ids]));
  if (todas.size === 0) return { areas: [], rebanadas: new Map() };

  const obligatorias = await Subject.find({ _id: { $in: [...todas] }, tipo: 'OBLIGATORIA', estado: ESTADO_ACTIVO }).select('area_id').lean();
  const areaDeAsignatura = new Map(obligatorias.map((s) => [String(s._id), String(s.area_id)]));
  const areas = await Area.find({ _id: { $in: [...new Set(areaDeAsignatura.values())] }, estado: ESTADO_ACTIVO })
    .sort({ nombre: 1 })
    .select('nombre codigo')
    .lean();
  const areasActivas = new Set(areas.map((a) => String(a._id)));

  const gradeIds = [...porGrado.keys()];
  const [grados, grupos] = await Promise.all([
    Grade.find({ _id: { $in: gradeIds } }).select('nivel').lean(),
    Group.find({ academic_year_id: anioId, grade_id: { $in: gradeIds }, estado: 'ACTIVE' }).select('grade_id sede_id jornada_id').lean(),
  ]);
  const jornadas = await JornadaOperativa.find({ _id: { $in: [...new Set(grupos.map((g) => String(g.jornada_id)))] } }).select('nombre').lean();
  const tipoDeJornada = new Map<string, TipoJornada>(jornadas.map((j) => [String(j._id), TIPO_DE_JORNADA[j.nombre]]));
  const nivelDeGrado = new Map(grados.map((g) => [String(g._id), g.nivel]));

  const rebanadas = new Map<string, Rebanada[]>();
  const vistas = new Set<string>();
  for (const [gradeId, ids] of porGrado) {
    const nivel = nivelDeGrado.get(gradeId);
    if (!nivel) continue;
    const areasDelGrado = new Set([...ids].flatMap((id) => (areaDeAsignatura.has(id) && areasActivas.has(areaDeAsignatura.get(id)!) ? [areaDeAsignatura.get(id)!] : [])));
    const gruposDelGrado = grupos.filter((g) => String(g.grade_id) === gradeId);
    const piezas: Rebanada[] =
      gruposDelGrado.length > 0
        ? gruposDelGrado.flatMap((g) => {
            const jornada = tipoDeJornada.get(String(g.jornada_id));
            return jornada ? [{ nivel, jornada, sede_id: String(g.sede_id) }] : [];
          })
        : [{ nivel, jornada: null, sede_id: null }];
    for (const areaId of areasDelGrado) {
      for (const pieza of piezas) {
        const clave = `${areaId}|${pieza.nivel}|${pieza.jornada ?? '-'}|${pieza.sede_id ?? '-'}`;
        if (vistas.has(clave)) continue;
        vistas.add(clave);
        rebanadas.set(areaId, [...(rebanadas.get(areaId) ?? []), pieza]);
      }
    }
  }
  return { areas, rebanadas };
}

export interface NombresDeSedes {
  nombres: Map<string, string>;
  variasSedes: boolean;
}

export async function nombresDeSedes(): Promise<NombresDeSedes> {
  const sedes = await Campus.find().select('nombre').lean();
  return { nombres: new Map(sedes.map((s) => [String(s._id), s.nombre])), variasSedes: sedes.length > 1 };
}
