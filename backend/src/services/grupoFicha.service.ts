import { Types } from 'mongoose';
import { ESTADOS_MATRICULA_ACTIVOS, EstadoMatricula, TipoIngreso } from '../constants/enums';
import { EstadoHorario } from '../constants/horarios';
import AcademicYear from '../models/academicYear.model';
import Enrollment from '../models/enrollment.model';
import Group from '../models/group.model';
import Horario from '../models/horario.model';
import Institution from '../models/institution.model';
import StudyPlan from '../models/studyPlan.model';
import Subject from '../models/subject.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import User from '../models/user.model';
import ApiError from '../utils/ApiError';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { obtenerHorario } from './horario.service';

/**
 * Ficha 360° de un grupo (M01): junta lo que otros módulos son dueños de guardar. NADA aquí se escribe: cada dato se
 * modifica en su módulo de origen (aula en M10, director y docentes en M08, estudiantes en M03/M04, plan en M06, horario
 * en M09). El director sale de M08 (`TeacherAssignment` DIRECCION_GRUPO), que es su única fuente de verdad.
 */

export interface DocenteResumen {
  _id: string;
  nombre: string;
  apellido: string;
  numero_documento: string;
}

export interface FichaGrupo {
  grupo: {
    _id: string;
    nomenclatura: string;
    estado: string;
    max_capacity: number;
    cupos_ocupados: number;
    grado: { _id: string; nombre: string; numero: number; nivel: string } | null;
    jornada: { _id: string; nombre: string; hora_inicio: string; hora_fin: string } | null;
    sede: { _id: string; nombre: string } | null;
    anio: { _id: string; nombre: string; year: number; estado: string } | null;
  };
  /** false en una institución virtual: sin espacios físicos, el grupo no lleva salón. */
  usa_espacios: boolean;
  aula: { _id: string; nombre: string; capacidad: number; estado: string; piso_bloque: string | null; excede_aforo: boolean } | null;
  director: { teacher_assignment_id: string | null; docente: DocenteResumen } | null;
  estudiantes: Array<{
    enrollment_id: string;
    estado: EstadoMatricula;
    tipo_ingreso: TipoIngreso;
    estudiante: { _id: string; nombre: string; apellido: string; numero_documento: string };
  }>;
  asignaturas: Array<{
    subject_id: string;
    nombre: string;
    abreviatura: string;
    area: { _id: string; nombre: string } | null;
    horas_semanales: number;
    /** De dónde sale la asignatura: la malla del grado o una que M06 agregó solo a este grupo. */
    origen: 'GRADO' | 'GRUPO';
    /** Las horas del grupo difieren de las del grado (M06, distribución por grupos). */
    horas_personalizadas: boolean;
    docente: (DocenteResumen & { teacher_assignment_id: string }) | null;
  }>;
  horas_semanales_total: number;
  horario: { disponible: boolean };
}

interface DocentePoblado {
  _id: Types.ObjectId;
  nombre: string;
  apellido: string;
  numero_documento: string;
}

const aResumen = (d: DocentePoblado): DocenteResumen => ({
  _id: String(d._id),
  nombre: d.nombre,
  apellido: d.apellido,
  numero_documento: d.numero_documento,
});

export async function obtenerFichaGrupo(groupId: string): Promise<FichaGrupo> {
  const grupo = await Group.findById(groupId)
    .populate<{ grade_id: { _id: Types.ObjectId; nombre: string; numero: number; nivel: string } | null }>('grade_id', 'nombre numero nivel')
    .populate<{ jornada_id: { _id: Types.ObjectId; nombre: string; hora_inicio: string; hora_fin: string } | null }>('jornada_id', 'nombre hora_inicio hora_fin')
    .populate<{ sede_id: { _id: Types.ObjectId; nombre: string } | null }>('sede_id', 'nombre')
    .populate<{ aula_id: { _id: Types.ObjectId; nombre: string; capacidad: number; estado: string; piso_bloque?: string } | null }>(
      'aula_id',
      'nombre capacidad estado piso_bloque'
    )
    .lean();
  if (!grupo) throw new ApiError(404, 'Grupo no encontrado.');

  const [anio, institucion, matriculas, asignaciones, plan, horarioExiste] = await Promise.all([
    AcademicYear.findById(grupo.academic_year_id).select('nombre year estado').lean(),
    Institution.findOne().select('modalidad').lean(),
    Enrollment.find({ group_id: grupo._id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } })
      .populate<{ student_id: DocentePoblado | null }>('student_id', 'nombre apellido numero_documento')
      .lean(),
    TeacherAssignment.find({
      group_id: grupo._id,
      academic_year_id: grupo.academic_year_id,
      tipo_asignacion: { $in: ['CLASE', 'DIRECCION_GRUPO'] },
      estado: ESTADO_ACTIVO,
    })
      .populate<{ docente_id: DocentePoblado | null }>('docente_id', 'nombre apellido numero_documento')
      .lean(),
    StudyPlan.findOne({ academic_year_id: grupo.academic_year_id }).select('grades').lean(),
    Horario.exists({ academic_year_id: grupo.academic_year_id, jornada_id: grupo.jornada_id?._id, estado: { $in: ['PUBLICADO', 'BORRADOR'] } }),
  ]);

  // --- Plan de estudios del grado (M06) con lo que este grupo personalizó ---
  const gradoPlan = plan?.grades.find((g) => String(g.grade_id) === String(grupo.grade_id?._id));
  const personalizacion = gradoPlan?.personalizaciones_grupo.find((p) => String(p.group_id) === String(grupo._id));
  const horas = new Map<string, { horas: number; origen: 'GRADO' | 'GRUPO'; personalizada: boolean }>();
  for (const a of gradoPlan?.asignaturas ?? []) {
    horas.set(String(a.subject_id), { horas: a.intensidad_horaria_semanal, origen: 'GRADO', personalizada: false });
  }
  for (const o of personalizacion?.intensidades_personalizadas ?? []) {
    const base = horas.get(String(o.subject_id));
    horas.set(String(o.subject_id), { horas: o.intensidad_horaria_semanal, origen: base?.origen ?? 'GRADO', personalizada: true });
  }
  for (const a of personalizacion?.asignaturas_agregadas ?? []) {
    horas.set(String(a.subject_id), { horas: a.intensidad_horaria_semanal, origen: 'GRUPO', personalizada: false });
  }

  const asignaturas = await Subject.find({ _id: { $in: [...horas.keys()] } })
    .populate<{ area_id: { _id: Types.ObjectId; nombre: string } | null }>('area_id', 'nombre')
    .lean();

  const docentePorAsignatura = new Map(
    asignaciones
      .filter((a) => a.tipo_asignacion === 'CLASE' && a.subject_id && a.docente_id)
      .map((a) => [String(a.subject_id), { ...aResumen(a.docente_id as DocentePoblado), teacher_assignment_id: String(a._id) }])
  );

  // --- Director: M08 manda; el campo del grupo es solo respaldo de datos anteriores ---
  const direccion = asignaciones.find((a) => a.tipo_asignacion === 'DIRECCION_GRUPO' && a.docente_id);
  let director: FichaGrupo['director'] = direccion
    ? { teacher_assignment_id: String(direccion._id), docente: aResumen(direccion.docente_id as DocentePoblado) }
    : null;
  if (!director && grupo.director_grupo_id) {
    const respaldo = await User.findById(grupo.director_grupo_id).select('nombre apellido numero_documento').lean<DocentePoblado | null>();
    if (respaldo) director = { teacher_assignment_id: null, docente: aResumen(respaldo) };
  }

  const aula = grupo.aula_id;
  const ordenadas = asignaturas
    .map((s) => {
      const h = horas.get(String(s._id)) as { horas: number; origen: 'GRADO' | 'GRUPO'; personalizada: boolean };
      return {
        subject_id: String(s._id),
        nombre: s.nombre,
        abreviatura: s.abreviatura,
        area: s.area_id ? { _id: String(s.area_id._id), nombre: s.area_id.nombre } : null,
        horas_semanales: h.horas,
        origen: h.origen,
        horas_personalizadas: h.personalizada,
        docente: docentePorAsignatura.get(String(s._id)) ?? null,
      };
    })
    .sort((a, b) => (a.area?.nombre ?? '').localeCompare(b.area?.nombre ?? '', 'es') || a.nombre.localeCompare(b.nombre, 'es'));

  return {
    grupo: {
      _id: String(grupo._id),
      nomenclatura: grupo.nomenclatura,
      estado: grupo.estado,
      max_capacity: grupo.max_capacity,
      cupos_ocupados: grupo.cupos_ocupados,
      grado: grupo.grade_id ? { _id: String(grupo.grade_id._id), nombre: grupo.grade_id.nombre, numero: grupo.grade_id.numero, nivel: grupo.grade_id.nivel } : null,
      jornada: grupo.jornada_id
        ? { _id: String(grupo.jornada_id._id), nombre: grupo.jornada_id.nombre, hora_inicio: grupo.jornada_id.hora_inicio, hora_fin: grupo.jornada_id.hora_fin }
        : null,
      sede: grupo.sede_id ? { _id: String(grupo.sede_id._id), nombre: grupo.sede_id.nombre } : null,
      anio: anio ? { _id: String(anio._id), nombre: anio.nombre, year: anio.year, estado: anio.estado } : null,
    },
    usa_espacios: institucion?.modalidad !== 'VIRTUAL',
    aula: aula
      ? {
          _id: String(aula._id),
          nombre: aula.nombre,
          capacidad: aula.capacidad,
          estado: aula.estado,
          piso_bloque: aula.piso_bloque ?? null,
          excede_aforo: grupo.max_capacity > aula.capacidad,
        }
      : null,
    director,
    estudiantes: matriculas
      .filter((m) => m.student_id)
      .map((m) => ({
        enrollment_id: String(m._id),
        estado: m.estado,
        tipo_ingreso: m.tipo_ingreso,
        estudiante: { ...aResumen(m.student_id as DocentePoblado) },
      }))
      .sort((a, b) => `${a.estudiante.apellido} ${a.estudiante.nombre}`.localeCompare(`${b.estudiante.apellido} ${b.estudiante.nombre}`, 'es')),
    asignaturas: ordenadas,
    horas_semanales_total: ordenadas.reduce((total, a) => total + a.horas_semanales, 0),
    horario: { disponible: Boolean(horarioExiste) },
  };
}

export interface HorarioDeGrupo {
  /** null = ninguna versión generada para la jornada de este grupo. */
  version: { _id: string; numero: number; estado: EstadoHorario } | null;
  /** Solo se pinta si el grupo aparece en la versión elegida. */
  malla: Awaited<ReturnType<typeof obtenerHorario>> | null;
  /** La versión elegida no es la publicada: es el último borrador. */
  es_borrador: boolean;
}

/**
 * El horario semanal de UN grupo: la versión publicada de su jornada o, si aún no hay, el último borrador completo (con
 * la advertencia de que no está publicado). Las sesiones de los demás grupos no viajan.
 */
export async function obtenerHorarioDeGrupo(groupId: string): Promise<HorarioDeGrupo> {
  const grupo = await Group.findById(groupId).select('academic_year_id jornada_id').lean();
  if (!grupo) throw new ApiError(404, 'Grupo no encontrado.');

  const contexto = { academic_year_id: grupo.academic_year_id, jornada_id: grupo.jornada_id };
  const elegido =
    (await Horario.findOne({ ...contexto, estado: 'PUBLICADO' }).select('version estado').lean()) ??
    (await Horario.findOne({ ...contexto, estado: 'BORRADOR' }).sort({ version: -1 }).select('version estado').lean());
  if (!elegido) return { version: null, malla: null, es_borrador: false };

  const malla = await obtenerHorario(String(elegido._id), (s) => String(s.group_id) === String(grupo._id));
  return {
    version: { _id: String(elegido._id), numero: elegido.version, estado: elegido.estado },
    malla: malla.horario.sesiones.length > 0 ? malla : null,
    es_borrador: elegido.estado !== 'PUBLICADO',
  };
}
