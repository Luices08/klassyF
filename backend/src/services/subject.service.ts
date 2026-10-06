import { Types } from 'mongoose';
import { EstadoArea, NivelEducativo, TipoAsignatura } from '../constants/enums';
import AcademicYear from '../dominios/institucional/calendario/academicYear.model';
import Area from '../models/area.model';
import StudyPlan from '../models/studyPlan.model';
import Subject, { SubjectDocument } from '../models/subject.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import ApiError from '../utils/ApiError';
import { ESTADO_ACTIVO, filtroPorEstado } from '../utils/filtroEstado';
import { registrarEvento } from './audit.service';

interface ContextoActor {
  usuarioId: Types.ObjectId | string;
  ip?: string | null;
}

async function exigirAreaActiva(areaId: string): Promise<void> {
  const area = await Area.findById(areaId);
  if (!area) throw new ApiError(400, 'El área indicada no existe.');
  if (area.estado !== 'activo') {
    throw new ApiError(400, `El área "${area.nombre}" está inactiva: actívala antes de asignarle asignaturas.`);
  }
}

/**
 * Años lectivos cuyo plan de estudios (M06) usa la asignatura: en la malla del grado, en la ponderación
 * de un área, o en la distribución de un grupo (asignaturas agregadas o evaluación personalizada).
 */
async function aniosLectivosQueUsanLaAsignatura(subjectId: string): Promise<Array<{ year: number; estado: string }>> {
  const planes = await StudyPlan.find({
    $or: [
      { 'grades.asignaturas.subject_id': subjectId },
      { 'grades.evaluaciones_area.asignaturas.subject_id': subjectId },
      { 'grades.personalizaciones_grupo.asignaturas_agregadas.subject_id': subjectId },
      { 'grades.personalizaciones_grupo.evaluaciones_area_personalizadas.asignaturas.subject_id': subjectId },
    ],
  }).select('academic_year_id');
  if (planes.length === 0) return [];

  const anios = await AcademicYear.find({ _id: { $in: planes.map((p) => p.academic_year_id) } })
    .select('year estado')
    .sort({ year: 1 });
  return anios.map((a) => ({ year: a.year, estado: a.estado }));
}

/**
 * Con un año ya activado o cerrado, reubicar la asignatura alteraria boletines ya calculados:
 * generateReportCard (M12) lee su area en vivo.
 */
async function estaEnPlanDeAnioNoPlanificacion(subjectId: string): Promise<boolean> {
  const anios = await aniosLectivosQueUsanLaAsignatura(subjectId);
  return anios.some((a) => a.estado !== 'PLANIFICACION');
}

export interface CrearSubjectInput {
  area_id: string;
  nombre: string;
  abreviatura: string;
  descripcion: string;
  tipo: TipoAsignatura;
  niveles_educativos: NivelEducativo[];
}

export async function crearSubject(
  input: CrearSubjectInput,
  { usuarioId, ip }: ContextoActor
): Promise<SubjectDocument> {
  await exigirAreaActiva(input.area_id);
  const subject = await Subject.create(input);

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'ASIGNATURA_CREADA',
    entidad: 'Subject',
    entidad_id: subject._id,
    detalle: `${subject.nombre} (${subject.abreviatura})`,
    ip,
  });
  return subject;
}

export interface ListarSubjectsFilter {
  area_id?: string;
  estado?: EstadoArea;
  nivel_educativo?: NivelEducativo;
}

export async function listarSubjects(filter: ListarSubjectsFilter): Promise<SubjectDocument[]> {
  const query: Record<string, unknown> = {};
  if (filter.area_id) query.area_id = filter.area_id;
  if (filter.estado) query.estado = filtroPorEstado(filter.estado);
  if (filter.nivel_educativo) query.niveles_educativos = filter.nivel_educativo;
  return Subject.find(query).sort({ nombre: 1 });
}

export interface ActualizarSubjectInput {
  area_id?: string;
  nombre?: string;
  abreviatura?: string;
  descripcion?: string;
  tipo?: TipoAsignatura;
  niveles_educativos?: NivelEducativo[];
}

export async function actualizarSubject(
  id: string,
  input: ActualizarSubjectInput,
  { usuarioId, ip }: ContextoActor
): Promise<SubjectDocument> {
  const subject = await Subject.findById(id);
  if (!subject) throw new ApiError(404, 'Asignatura no encontrada.');

  if (input.area_id && input.area_id !== String(subject.area_id)) {
    await exigirAreaActiva(input.area_id);
    const anios = await aniosLectivosQueUsanLaAsignatura(id);
    if (anios.some((a) => a.estado !== 'PLANIFICACION')) {
      throw new ApiError(
        409,
        'Esta asignatura ya está en el plan de estudios de un año lectivo activado o cerrado: reubicarla de área ' +
          'alteraría boletines ya calculados.'
      );
    }
    // Aunque el año siga en planificación, sus ponderaciones apuntan al área actual de la asignatura:
    // cambiarla dejaría porcentajes colgando de un área que ya no es la suya.
    if (anios.length > 0) {
      throw new ApiError(
        409,
        `Esta asignatura ya está en la malla o en las ponderaciones del Plan de Estudios ${anios.map((a) => a.year).join(', ')}. ` +
          'Retírala de ese plan antes de cambiarle el área.'
      );
    }
  }

  subject.set(input);
  await subject.save();

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'ASIGNATURA_ACTUALIZADA',
    entidad: 'Subject',
    entidad_id: subject._id,
    detalle: `${subject.nombre} (${subject.abreviatura})`,
    ip,
  });
  return subject;
}

export async function actualizarEstadoSubject(
  id: string,
  estado: EstadoArea,
  { usuarioId, ip }: ContextoActor
): Promise<SubjectDocument> {
  const subject = await Subject.findById(id);
  if (!subject) throw new ApiError(404, 'Asignatura no encontrada.');

  if (estado === 'inactivo') {
    if (await estaEnPlanDeAnioNoPlanificacion(id)) {
      throw new ApiError(
        409,
        'La asignatura está en el plan de estudios de un año lectivo ya activado o cerrado: no se puede inactivar.'
      );
    }
    const asignacionesActivas = await TeacherAssignment.countDocuments({ subject_id: id, estado: ESTADO_ACTIVO });
    if (asignacionesActivas > 0) {
      throw new ApiError(409, 'La asignatura tiene asignaciones docentes activas. Retíralas antes de inactivarla.');
    }
  }

  subject.estado = estado;
  await subject.save();

  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'ASIGNATURA_ESTADO_CAMBIADO',
    entidad: 'Subject',
    entidad_id: subject._id,
    detalle: `${subject.nombre} → ${estado}`,
    ip,
  });
  return subject;
}
