import { HydratedDocument, Types } from 'mongoose';
import { ESTADOS_MATRICULA_ACTIVOS } from '../../../constants/enums';
import { ROLES } from '../../../constants/roles';
import AcademicYear, { AcademicYearDocument } from '../../institucional/calendario/academicYear.model';
import Area from '../../curricular/plan-estudios/area.model';
import ConfiguracionInclusion, { ConfiguracionInclusionDocument } from './configuracionInclusion.model';
import Enrollment, { EnrollmentDocument } from '../../registro/matriculas/enrollment.model';
import Group, { IGroup } from '../../institucional/estructura/group.model';
import StudyPlan from '../../curricular/plan-estudios/studyPlan.model';
import Subject from '../../curricular/plan-estudios/subject.model';
import TeacherAssignment from '../../curricular/carga-docente/teacherAssignment.model';
import { UserDocument } from '../../../models/user.model';
import ApiError from '../../../utils/ApiError';
import { ESTADO_ACTIVO } from '../../../utils/filtroEstado';
import { AccionInclusion, ContextoInclusion, UsuarioInclusion, permisoInclusion } from './permisosInclusion';
import { exigirInstitucion } from '../../institucional';
import { exigirAnioEnCurso } from '../../institucional';

/** "No existe" y "no autorizado" responden igual (IDOR): nunca se revela qué estudiantes tienen apoyo. */
export const noEncontrado = (que = 'Estudiante') => new ApiError(404, `${que} no encontrado.`);

export const comoUsuarioInclusion = (u: UserDocument): UsuarioInclusion => ({ id: String(u._id), rol: u.rol, sedes_ids: u.sedes_ids.map(String) });

export async function obtenerConfiguracion(): Promise<ConfiguracionInclusionDocument> {
  const institucion = await exigirInstitucion('Configura primero la institución antes de usar inclusión.');
  const existente = await ConfiguracionInclusion.findOne({ institucion_id: institucion._id });
  if (existente) return existente;
  try {
    return await ConfiguracionInclusion.create({ institucion_id: institucion._id });
  } catch (err) {
    // Dos primeras peticiones a la vez: la otra ya la creó.
    if ((err as { code?: number }).code === 11000) return (await ConfiguracionInclusion.findOne({ institucion_id: institucion._id })) as ConfiguracionInclusionDocument;
    throw err;
  }
}

export const anioEnCurso = (): Promise<AcademicYearDocument> => exigirAnioEnCurso('No hay un año lectivo en curso.');

export interface ContextoEstudianteInclusion {
  matricula: EnrollmentDocument;
  grupo: HydratedDocument<IGroup>;
  /** La matrícula está activa: la única sobre la que se abre o se edita algo. */
  vigente: boolean;
  contexto: ContextoInclusion;
}

/**
 * Matrícula sobre la que se decide el acceso: la activa del año; si no la tiene (retirado, año cerrado) la más reciente de ese año,
 * para que se pueda consultar la historia. El expediente se liga a estudiante+año, y el grupo vigente sale de aquí.
 */
export async function cargarContextoEstudiante(usuario: UserDocument, studentId: string | Types.ObjectId, anioId: string | Types.ObjectId): Promise<ContextoEstudianteInclusion | null> {
  if (!Types.ObjectId.isValid(String(studentId)) || !Types.ObjectId.isValid(String(anioId))) return null;
  const activa = await Enrollment.findOne({ student_id: studentId, academic_year_id: anioId, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } });
  const matricula = activa ?? (await Enrollment.findOne({ student_id: studentId, academic_year_id: anioId }).sort({ createdAt: -1 }));
  if (!matricula) return null;
  const grupo = await Group.findById(matricula.group_id);
  if (!grupo) return null;

  const esDocente = usuario.rol === ROLES.DOCENTE;
  const docenteDictaClase =
    esDocente &&
    Boolean(
      await TeacherAssignment.exists({ docente_id: usuario._id, group_id: grupo._id, academic_year_id: grupo.academic_year_id, tipo_asignacion: 'CLASE', estado: ESTADO_ACTIVO })
    );
  const esDirectorDeGrupo = esDocente && String(grupo.director_grupo_id) === String(usuario._id);

  return { matricula, grupo, vigente: Boolean(activa), contexto: { sede_id: String(grupo.sede_id), docenteDictaClase, esDirectorDeGrupo } };
}

export function exigirPermiso(usuario: UserDocument, ctx: ContextoEstudianteInclusion | null, accion: AccionInclusion, extra: Partial<ContextoInclusion> = {}): ContextoEstudianteInclusion {
  if (!ctx || !permisoInclusion(comoUsuarioInclusion(usuario), { ...ctx.contexto, ...extra }, accion)) throw noEncontrado();
  return ctx;
}

export async function docenteDictaAsignatura(docenteId: Types.ObjectId | string, groupId: Types.ObjectId | string, anioId: Types.ObjectId | string, subjectId: Types.ObjectId | string): Promise<boolean> {
  return Boolean(
    await TeacherAssignment.exists({
      docente_id: docenteId,
      group_id: groupId,
      academic_year_id: anioId,
      subject_id: subjectId,
      tipo_asignacion: 'CLASE',
      estado: ESTADO_ACTIVO,
    })
  );
}

export interface AsignaturaEsperadaDetalle {
  subject_id: string;
  nombre: string;
  area_id: string;
  area: string;
  docente_id: string | null;
}

/**
 * Filas esperadas del Anexo 2: las asignaturas del plan de estudios efectivo del grupo (grado + las que se agregaron al grupo, M06)
 * con su docente de clase vigente (M08). Nunca se inventan filas: si el grupo no tiene plan, no hay nada que diligenciar.
 */
export async function asignaturasEsperadas(grupo: HydratedDocument<IGroup>): Promise<AsignaturaEsperadaDetalle[]> {
  const plan = await StudyPlan.findOne({ academic_year_id: grupo.academic_year_id });
  const gradoPlan = plan?.grades.find((g) => String(g.grade_id) === String(grupo.grade_id));
  if (!gradoPlan) return [];
  const personalizacion = gradoPlan.personalizaciones_grupo.find((p) => String(p.group_id) === String(grupo._id));
  const ids = [...new Set([...gradoPlan.asignaturas.map((a) => String(a.subject_id)), ...(personalizacion?.asignaturas_agregadas.map((a) => String(a.subject_id)) ?? [])])];
  if (ids.length === 0) return [];

  const [asignaturas, docentes] = await Promise.all([
    Subject.find({ _id: { $in: ids } }),
    TeacherAssignment.find({ group_id: grupo._id, academic_year_id: grupo.academic_year_id, tipo_asignacion: 'CLASE', estado: ESTADO_ACTIVO, subject_id: { $in: ids } }),
  ]);
  const areas = await Area.find({ _id: { $in: [...new Set(asignaturas.map((s) => String(s.area_id)))] } });
  const area = new Map(areas.map((a) => [String(a._id), a.nombre]));
  const docente = new Map(docentes.map((d) => [String(d.subject_id), String(d.docente_id)]));

  return asignaturas
    .map((s) => ({
      subject_id: String(s._id),
      nombre: s.nombre,
      area_id: String(s.area_id),
      area: area.get(String(s.area_id)) ?? '',
      docente_id: docente.get(String(s._id)) ?? null,
    }))
    .sort((a, b) => `${a.area} ${a.nombre}`.localeCompare(`${b.area} ${b.nombre}`, 'es'));
}

/** Un año CERRADO es histórico: nada de M16 se edita en él (la regla se lee del año, sin tocar M05). */
export async function exigirAnioNoCerrado(anioId: Types.ObjectId | string): Promise<void> {
  const anio = await AcademicYear.findById(anioId).select('estado');
  if (!anio) throw new ApiError(404, 'Año lectivo no encontrado.');
  if (anio.estado === 'CERRADO') throw new ApiError(409, 'El año lectivo está cerrado: el expediente es histórico y solo se consulta.');
}

export const escaparRegex = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
