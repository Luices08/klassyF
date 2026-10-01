import { Types } from 'mongoose';
import { EstadoArea, NivelEducativo, TipoAsignatura } from '../constants/enums';
import AcademicYear from '../models/academicYear.model';
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
 * La asignatura aparece en la malla (Configuracion General o asignaturas agregadas de un grupo) del
 * plan de estudios de un año lectivo que ya no esta en PLANIFICACION. Mismo criterio de congelamiento
 * que studyPlan.service.ts: generateReportCard (M12) lee el area de la asignatura en vivo, asi que
 * reubicarla con el año EN_CURSO o CERRADO reescribiria boletines ya calculados.
 */
async function estaEnPlanDeAnioNoPlanificacion(subjectId: string): Promise<boolean> {
  const anios = await AcademicYear.find({ estado: { $ne: 'PLANIFICACION' } }).select('_id');
  if (anios.length === 0) return false;

  const planes = await StudyPlan.find({ academic_year_id: { $in: anios.map((a) => a._id) } }).select('grades');
  return planes.some((plan) =>
    plan.grades.some(
      (grado) =>
        grado.asignaturas.some((a) => String(a.subject_id) === subjectId) ||
        grado.personalizaciones_grupo.some((p) =>
          p.asignaturas_agregadas.some((a) => String(a.subject_id) === subjectId)
        )
    )
  );
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
    if (await estaEnPlanDeAnioNoPlanificacion(id)) {
      throw new ApiError(
        409,
        'Esta asignatura ya está en el plan de estudios de un año lectivo activado o cerrado: reubicarla de área ' +
          'alteraría boletines ya calculados. Solo se puede cambiar de área mientras ese año sigue en planificación.'
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
