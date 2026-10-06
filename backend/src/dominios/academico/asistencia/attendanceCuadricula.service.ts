import { HydratedDocument, Types } from 'mongoose';
import { EstadoJustificacion } from '../../../constants/enums';
import { ROLES } from '../../../constants/roles';
import Attendance from './attendance.model';
import AttendanceJustification from './attendanceJustification.model';
import { AttendanceStateDocument } from './attendanceState.model';
import Grade from '../../institucional/estructura/grade.model';
import { IGroup } from '../../institucional/estructura/group.model';
import TeacherAssignment from '../../curricular/carga-docente/teacherAssignment.model';
import { UserDocument } from '../../../models/user.model';
import ApiError from '../../../utils/ApiError';
import { hayEventoNoLectivo } from '../../institucional';
import { ESTADO_ACTIVO } from '../../../utils/filtroEstado';
import { diaIso } from '../../../utils/tiempo';
import { evaluarFechaEnContexto, matriculasActivas, obtenerGrupoYAsignatura } from './attendance.service';
import { listarEstados } from './attendanceState.service';
import { cargarContextoFechas, periodoDeFecha } from '../../institucional';

const ROLES_DE_CONSULTA_TOTAL: string[] = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];

export type PermisoClase = 'EDITAR' | 'LEER';

/**
 * Qué puede hacer el usuario con la planilla de un grupo+asignatura. Staff solo consulta (la asistencia la toma el
 * docente); el docente edita las clases que dicta (M08) y, si es director del grupo, además consulta las demás
 * asignaturas de ese grupo.
 */
export async function permisoSobreClase(
  usuario: UserDocument,
  grupo: HydratedDocument<IGroup>,
  subjectId: string
): Promise<PermisoClase> {
  if (ROLES_DE_CONSULTA_TOTAL.includes(usuario.rol)) return 'LEER';
  if (usuario.rol !== ROLES.DOCENTE) throw new ApiError(403, 'No tiene permisos sobre la asistencia de esta clase.');

  const claseDelGrupo = {
    group_id: grupo._id,
    subject_id: subjectId,
    academic_year_id: grupo.academic_year_id,
    tipo_asignacion: 'CLASE',
    estado: ESTADO_ACTIVO,
  };
  if (await TeacherAssignment.exists({ ...claseDelGrupo, docente_id: usuario._id })) return 'EDITAR';

  const esDirector = grupo.director_grupo_id && String(grupo.director_grupo_id) === String(usuario._id);
  if (esDirector && (await TeacherAssignment.exists(claseDelGrupo))) return 'LEER';

  throw new ApiError(403, 'No tiene una asignación académica activa para esta asignatura y grupo.');
}

export interface ClaseAccesible {
  group_id: string;
  subject_id: string;
  grupo: string;
  grado: string;
  asignatura: string;
  docente: string;
  /** El docente la dicta él mismo; si es false solo la consulta (director de grupo o staff). */
  editable: boolean;
}

interface AsignacionPoblada {
  docente_id: { _id: Types.ObjectId; nombre: string; apellido: string };
  group_id: { _id: Types.ObjectId; nomenclatura: string; grade_id: { nombre: string; numero: number } | null };
  subject_id: { _id: Types.ObjectId; nombre: string };
}

/** Las clases (grupo+asignatura) del año que el usuario puede abrir: las suyas y las de los grupos que dirige; staff, todas. */
export async function listarClases(
  consulta: { academic_year_id: string; group_id?: string },
  usuario: UserDocument
): Promise<ClaseAccesible[]> {
  const base = {
    academic_year_id: consulta.academic_year_id,
    tipo_asignacion: 'CLASE',
    estado: ESTADO_ACTIVO,
    group_id: consulta.group_id ?? { $ne: null },
    subject_id: { $ne: null },
  };

  let filtro: Record<string, unknown> = base;
  if (usuario.rol === ROLES.DOCENTE) {
    const dirigidos = await TeacherAssignment.find({
      academic_year_id: consulta.academic_year_id,
      tipo_asignacion: 'DIRECCION_GRUPO',
      docente_id: usuario._id,
      estado: ESTADO_ACTIVO,
    }).select('group_id');
    filtro = { ...base, $or: [{ docente_id: usuario._id }, { group_id: { $in: dirigidos.map((d) => d.group_id) } }] };
  } else if (!ROLES_DE_CONSULTA_TOTAL.includes(usuario.rol)) {
    throw new ApiError(403, 'No tiene permisos para consultar la asistencia.');
  }

  const asignaciones = await TeacherAssignment.find(filtro)
    .populate('docente_id', 'nombre apellido')
    .populate({ path: 'group_id', select: 'nomenclatura grade_id', populate: { path: 'grade_id', select: 'nombre numero' } })
    .populate('subject_id', 'nombre');

  return (asignaciones as unknown as Array<AsignacionPoblada & { docente_id: { _id: Types.ObjectId } }>)
    .filter((a) => a.group_id && a.subject_id && a.docente_id)
    .map((a) => ({
      group_id: String(a.group_id._id),
      subject_id: String(a.subject_id._id),
      grupo: `${a.group_id.grade_id?.nombre ?? ''} ${a.group_id.nomenclatura}`.trim(),
      grado: a.group_id.grade_id?.nombre ?? '',
      asignatura: a.subject_id.nombre,
      docente: `${a.docente_id.apellido} ${a.docente_id.nombre}`,
      editable: usuario.rol === ROLES.DOCENTE && String(a.docente_id._id) === String(usuario._id),
      orden: a.group_id.grade_id?.numero ?? 0,
    }))
    .sort((x, y) => x.orden - y.orden || x.grupo.localeCompare(y.grupo, 'es') || x.asignatura.localeCompare(y.asignatura, 'es'))
    .map(({ orden: _orden, ...clase }) => clase);
}

export interface CeldaCuadricula {
  state_id: string;
  novedad: string;
  registro_id: string;
  justificacion: EstadoJustificacion | null;
}

export interface DiaCuadricula {
  fecha: string;
  periodo_numero: number;
  /** Por qué no se puede editar ese día (futuro, periodo cerrado...); null si se puede. */
  bloqueo: string | null;
  attendance_id: string | null;
}

export interface TotalesEstudiante {
  asistencias: number;
  retardos: number;
  fallas: number;
  fallas_justificadas: number;
}

export interface Cuadricula {
  grupo: { _id: string; nomenclatura: string; grado: string };
  asignatura: { _id: string; nombre: string };
  docente: string | null;
  mes: string;
  editable: boolean;
  estados: AttendanceStateDocument[];
  estudiantes: Array<{ student_id: string; nombre: string; apellido: string; numero_documento: string }>;
  dias: DiaCuadricula[];
  /** estudiante -> fecha -> celda; una celda ausente es un día todavía sin registrar. */
  celdas: Record<string, Record<string, CeldaCuadricula>>;
  totales: Record<string, TotalesEstudiante>;
}

export interface ConsultaCuadricula {
  group_id: string;
  subject_id: string;
  mes: string;
  /** Recorta los días al rango (por ejemplo, a un periodo académico). */
  rango?: { desde: Date; hasta: Date };
}

const MS_DIA = 86_400_000;

/**
 * Planilla clásica del mes: estudiantes en filas y los días de clase en columnas. Los días salen de la jornada del
 * grupo y del calendario de M05 (nada de lunes a viernes fijos): se omiten recesos, vacaciones y días fuera de los
 * periodos. Los totales cuentan una falla como justificada si su estado ya lo es o tiene una excusa aprobada.
 */
export async function construirCuadricula(consulta: ConsultaCuadricula, usuario: UserDocument): Promise<Cuadricula> {
  const { grupo, asignatura } = await obtenerGrupoYAsignatura(consulta.group_id, consulta.subject_id);
  const permiso = await permisoSobreClase(usuario, grupo, consulta.subject_id);

  const [anio, mes] = consulta.mes.split('-').map(Number) as [number, number];
  const primero = new Date(Date.UTC(anio, mes - 1, 1));
  const ultimo = new Date(Date.UTC(anio, mes, 0));

  const contexto = await cargarContextoFechas(grupo);
  const dias: DiaCuadricula[] = [];
  for (let t = primero.getTime(); t <= ultimo.getTime(); t += MS_DIA) {
    const dia = new Date(t);
    if (consulta.rango && (dia < consulta.rango.desde || dia > consulta.rango.hasta)) continue;
    if (!contexto.jornada.dias_habiles.includes(diaIso(dia))) continue;
    if (hayEventoNoLectivo(dia, contexto.anio.eventos)) continue;
    const periodo = periodoDeFecha(contexto, dia);
    if (periodo === null) continue;
    dias.push({
      fecha: dia.toISOString().slice(0, 10),
      periodo_numero: periodo,
      bloqueo: evaluarFechaEnContexto(contexto, dia).bloqueo,
      attendance_id: null,
    });
  }

  const [matriculas, estados, planillas, titular] = await Promise.all([
    matriculasActivas(grupo._id),
    listarEstados(true),
    Attendance.find({ group_id: grupo._id, subject_id: asignatura._id, fecha: { $gte: primero, $lte: ultimo } }),
    TeacherAssignment.findOne({
      group_id: grupo._id,
      subject_id: asignatura._id,
      academic_year_id: grupo.academic_year_id,
      tipo_asignacion: 'CLASE',
      estado: ESTADO_ACTIVO,
    }).populate<{ docente_id: { nombre: string; apellido: string } | null }>('docente_id', 'nombre apellido'),
  ]);

  const aprobadas = await AttendanceJustification.find({ attendance_id: { $in: planillas.map((p) => p._id) } });
  const justificacionDe = new Map(
    aprobadas.filter((j) => j.estado !== 'RECHAZADA').map((j) => [String(j.registro_id), j.estado])
  );
  const estadoPorId = new Map(estados.map((e) => [String(e._id), e]));

  const idPlanilla = new Map(planillas.map((p) => [p.fecha.toISOString().slice(0, 10), String(p._id)]));
  dias.forEach((d) => {
    d.attendance_id = idPlanilla.get(d.fecha) ?? null;
  });

  const celdas: Cuadricula['celdas'] = {};
  const totales: Cuadricula['totales'] = {};
  for (const m of matriculas) {
    celdas[String(m.student_id._id)] = {};
    totales[String(m.student_id._id)] = { asistencias: 0, retardos: 0, fallas: 0, fallas_justificadas: 0 };
  }

  const diasVisibles = new Set(dias.map((d) => d.fecha));
  for (const planilla of planillas) {
    const fecha = planilla.fecha.toISOString().slice(0, 10);
    if (!diasVisibles.has(fecha)) continue;
    for (const registro of planilla.registros) {
      const studentId = String(registro.student_id);
      if (!celdas[studentId]) continue; // estudiante que ya no está matriculado en el grupo
      const justificacion = justificacionDe.get(String(registro._id)) ?? null;
      celdas[studentId][fecha] = {
        state_id: String(registro.state_id),
        novedad: registro.novedad,
        registro_id: String(registro._id),
        justificacion,
      };

      const estado = estadoPorId.get(String(registro.state_id));
      const total = totales[studentId] as TotalesEstudiante;
      if (estado?.cuenta_como_falla) {
        total.fallas += 1;
        if (estado.es_justificada || justificacion === 'APROBADA') total.fallas_justificadas += 1;
      } else if (estado?.es_retardo) {
        total.retardos += 1;
      } else {
        total.asistencias += 1;
      }
    }
  }

  return {
    grupo: { _id: String(grupo._id), nomenclatura: grupo.nomenclatura, grado: await nombreDelGrado(grupo) },
    asignatura: { _id: String(asignatura._id), nombre: asignatura.nombre },
    docente: titular?.docente_id ? `${titular.docente_id.nombre} ${titular.docente_id.apellido}` : null,
    mes: consulta.mes,
    editable: permiso === 'EDITAR',
    estados,
    estudiantes: matriculas.map((m) => ({
      student_id: String(m.student_id._id),
      nombre: m.student_id.nombre,
      apellido: m.student_id.apellido,
      numero_documento: m.student_id.numero_documento,
    })),
    dias,
    celdas,
    totales,
  };
}

export async function nombreDelGrado(grupo: HydratedDocument<IGroup>): Promise<string> {
  const grado = await Grade.findById(grupo.grade_id).select('nombre');
  return grado?.nombre ?? '';
}
