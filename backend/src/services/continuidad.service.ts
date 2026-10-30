import { Types } from 'mongoose';
import { ESTADOS_MATRICULA_ACTIVOS, ESTADOS_MATRICULA_VIVOS } from '../constants/enums';
import { ROLES } from '../constants/roles';
import AcademicYear, { AcademicYearDocument } from '../models/academicYear.model';
import ConfirmacionContinuidad, { CanalContinuidad, ConfirmacionContinuidadDocument, DecisionContinuidad } from '../models/confirmacionContinuidad.model';
import Enrollment from '../models/enrollment.model';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { registrarEvento } from './audit.service';
async function anioDestinoContinuidad(): Promise<Types.ObjectId | null> {
  const enCurso = await AcademicYear.findOne({ estado: 'EN_CURSO' }).select('year');
  if (enCurso) {
    const siguiente = await AcademicYear.findOne({ estado: { $ne: 'CERRADO' }, year: { $gt: enCurso.year } }).sort({ year: 1 }).select('_id');
    if (siguiente) return siguiente._id;
  }
  const planificacion = await AcademicYear.findOne({ estado: 'PLANIFICACION' }).sort({ year: -1 }).select('_id');
  return planificacion?._id ?? null;
}

/**
 * Continuidad de los estudiantes antiguos (M04): la familia o secretaría registra si el estudiante piensa seguir el año siguiente. La respuesta no crea
 * matrícula ni reserva cupo; M19 la usa al simular y ejecutar el rollover.
 */

const PUEDEN_REGISTRAR = [ROLES.ADMIN, ROLES.SECRETARIA];
const PUEDEN_CONSULTAR = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];

export type EstadoDeContinuidad = DecisionContinuidad | 'SIN_RESPUESTA';

export interface FiltrosContinuidad {
  sede_id?: string;
  grade_id?: string;
  group_id?: string;
  decision?: EstadoDeContinuidad;
}

export interface FilaContinuidad {
  student_id: string;
  enrollment_id: string;
  estudiante: { nombre: string; apellido: string; numero_documento: string };
  grupo: { id: string; nombre: string };
  grado: string;
  grado_numero: number;
  sede_id: string;
  decision: EstadoDeContinuidad;
  canal: CanalContinuidad | null;
  motivo: string;
  fecha: Date | null;
  /** El grado siguiente proyectado si continúa; null en el último grado. */
  grado_proyectado: string | null;
  /** Ya tiene matrícula en el año siguiente: la respuesta ya no cambia nada. */
  ya_matriculado: boolean;
}

export interface VistaContinuidad {
  origen: { id: string; year: number };
  destino: { id: string; year: number };
  filas: FilaContinuidad[];
  /** Cuenta a todos los del alcance (sede), no solo a los que deja pasar el filtro de respuesta. */
  resumen: { total: number; continuan: number; no_continuan: number; sin_respuesta: number };
}

/** Las sedes que puede ver quien consulta: la secretaría solo las suyas (sin sedes no ve nada). */
const alcanceDeSedes = (usuario: UserDocument): 'TODAS' | string[] => (usuario.rol === ROLES.SECRETARIA ? usuario.sedes_ids.map(String) : 'TODAS');

/** El año que termina respecto del de destino: el de número inmediatamente anterior (el más reciente si el número se repite). */
async function anioDeOrigen(destino: AcademicYearDocument): Promise<AcademicYearDocument> {
  const origen = await AcademicYear.findOne({ year: { $lt: destino.year } }).sort({ year: -1, createdAt: -1 });
  if (!origen) throw new ApiError(409, `No hay un año anterior a ${destino.year} del cual renovar matrículas.`);
  return origen;
}

async function cargarDestino(anioId: string): Promise<AcademicYearDocument> {
  const destino = await AcademicYear.findById(anioId);
  if (!destino) throw new ApiError(404, 'Año lectivo no encontrado.');
  if (destino.estado === 'CERRADO') throw new ApiError(409, `El año ${destino.year} ya está cerrado.`);
  return destino;
}

/** El grado siguiente al de un grupo, o null si cursa el último. */
async function gradoSiguienteDe(gradeId: Types.ObjectId): Promise<{ _id: Types.ObjectId; nombre: string } | null> {
  const actual = await Grade.findById(gradeId).select('numero');
  return actual ? Grade.findOne({ numero: actual.numero + 1, estado: { $ne: 'inactivo' } }).select('nombre') : null;
}

/** Quién renueva y cómo respondió. Lee las matrículas activas del año que termina (la secretaría, solo de sus sedes). */
export async function listarContinuidad(destinoId: string, filtros: FiltrosContinuidad, usuario: UserDocument): Promise<VistaContinuidad> {
  if (!PUEDEN_CONSULTAR.includes(usuario.rol)) throw new ApiError(403, 'Solo coordinación, secretaría y el administrador consultan la continuidad.');
  const destino = await cargarDestino(destinoId);
  const origen = await anioDeOrigen(destino);
  const alcance = alcanceDeSedes(usuario);
  if (alcance !== 'TODAS' && filtros.sede_id && !alcance.includes(filtros.sede_id)) throw new ApiError(403, 'Esa sede no está entre las que tienes asignadas.');

  const grupos = await Group.find({
    academic_year_id: origen._id,
    ...(filtros.sede_id ? { sede_id: filtros.sede_id } : {}),
    ...(filtros.grade_id ? { grade_id: filtros.grade_id } : {}),
    ...(filtros.group_id ? { _id: filtros.group_id } : {}),
    ...(alcance !== 'TODAS' && !filtros.sede_id ? { sede_id: { $in: alcance } } : {}),
  }).select('nomenclatura sede_id grade_id');
  const grupoPorId = new Map(grupos.map((g) => [String(g._id), g]));

  const matriculas = await Enrollment.find({ academic_year_id: origen._id, group_id: { $in: grupos.map((g) => g._id) }, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } }).select('student_id group_id');
  const estudiantesIds = matriculas.map((m) => m.student_id);
  const [usuarios, grados, respuestas, yaMatriculados] = await Promise.all([
    User.find({ _id: { $in: estudiantesIds } }).select('nombre apellido numero_documento'),
    Grade.find().select('nombre numero estado'),
    ConfirmacionContinuidad.find({ academic_year_id: destino._id, student_id: { $in: estudiantesIds } }),
    Enrollment.distinct('student_id', { academic_year_id: destino._id, student_id: { $in: estudiantesIds }, estado: { $in: ESTADOS_MATRICULA_VIVOS } }),
  ]);
  const usuarioPorId = new Map(usuarios.map((u) => [String(u._id), u]));
  const gradoPorId = new Map(grados.map((g) => [String(g._id), g]));
  const gradoPorNumero = new Map(grados.filter((g) => g.estado !== 'inactivo').map((g) => [g.numero, g]));
  const respuestaPorId = new Map(respuestas.map((r) => [String(r.student_id), r]));
  const matriculados = new Set(yaMatriculados.map(String));

  const todas: FilaContinuidad[] = matriculas.map((m) => {
    const g = grupoPorId.get(String(m.group_id))!;
    const grado = gradoPorId.get(String(g.grade_id));
    const u = usuarioPorId.get(String(m.student_id));
    const r = respuestaPorId.get(String(m.student_id));
    return {
      student_id: String(m.student_id),
      enrollment_id: String(m._id),
      estudiante: { nombre: u?.nombre ?? '', apellido: u?.apellido ?? '', numero_documento: u?.numero_documento ?? '' },
      grupo: { id: String(g._id), nombre: `${grado?.nombre ?? ''} ${g.nomenclatura}`.trim() },
      grado: grado?.nombre ?? '—',
      grado_numero: grado?.numero ?? 0,
      sede_id: String(g.sede_id),
      decision: r?.decision ?? 'SIN_RESPUESTA',
      canal: r?.canal ?? null,
      motivo: r?.motivo ?? '',
      fecha: r?.updatedAt ?? null,
      grado_proyectado: grado ? (gradoPorNumero.get(grado.numero + 1)?.nombre ?? null) : null,
      ya_matriculado: matriculados.has(String(m.student_id)),
    };
  });
  const resumen = {
    total: todas.length,
    continuan: todas.filter((f) => f.decision === 'CONTINUA').length,
    no_continuan: todas.filter((f) => f.decision === 'NO_CONTINUA').length,
    sin_respuesta: todas.filter((f) => f.decision === 'SIN_RESPUESTA').length,
  };
  const filas = (filtros.decision ? todas.filter((f) => f.decision === filtros.decision) : todas).sort(
    (a, b) =>
      a.grado_numero - b.grado_numero ||
      a.grupo.nombre.localeCompare(b.grupo.nombre, 'es', { numeric: true }) ||
      a.estudiante.apellido.localeCompare(b.estudiante.apellido, 'es') ||
      a.estudiante.nombre.localeCompare(b.estudiante.nombre, 'es')
  );
  return { origen: { id: String(origen._id), year: origen.year }, destino: { id: String(destino._id), year: destino.year }, filas, resumen };
}

export interface RespuestaDeContinuidad {
  /** null borra la respuesta (vuelve a «sin respuesta»). */
  decision: DecisionContinuidad | null;
  motivo?: string;
}

/**
 * Guarda (o borra) la respuesta de continuidad de un estudiante para el año de destino. La usan secretaría (desde la lista) y el portal del acudiente
 * (`canal`). El registro conserva la proyección de grado, sede y jornada, pero no aparta cupo ni matrícula.
 */
export async function registrarContinuidad(
  destinoId: string,
  studentId: string,
  respuesta: RespuestaDeContinuidad,
  actor: { usuario: UserDocument; canal: CanalContinuidad },
  ip?: string | null
): Promise<{ decision: EstadoDeContinuidad }> {
  const { usuario, canal } = actor;
  if (canal === 'SECRETARIA' && !PUEDEN_REGISTRAR.includes(usuario.rol)) throw new ApiError(403, 'Solo el administrador y la secretaría registran la continuidad.');
  const destino = await cargarDestino(destinoId);
  const origen = await anioDeOrigen(destino);

  const matricula = await Enrollment.findOne({ student_id: studentId, academic_year_id: origen._id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } });
  if (!matricula) throw new ApiError(409, `El estudiante no tiene matrícula activa en ${origen.year}: no hay nada que renovar.`);
  const grupo = await Group.findById(matricula.group_id).select('sede_id jornada_id grade_id');
  if (!grupo) throw new ApiError(409, 'No se encontró el grupo de su matrícula actual.');
  if (canal === 'SECRETARIA' && usuario.rol === ROLES.SECRETARIA && !usuario.sedes_ids.map(String).includes(String(grupo.sede_id))) {
    throw new ApiError(403, 'Ese estudiante es de una sede que no tienes asignada.');
  }
  if (await Enrollment.exists({ student_id: studentId, academic_year_id: destino._id, estado: { $in: ESTADOS_MATRICULA_VIVOS } })) {
    throw new ApiError(409, `El estudiante ya tiene matrícula en ${destino.year}: su respuesta ya no cambia nada.`);
  }

  if (respuesta.decision === null) {
    const borrada = await ConfirmacionContinuidad.findOneAndDelete({ student_id: studentId, academic_year_id: destino._id });
    if (borrada) {
      await registrarEvento({ usuario_id: usuario._id, accion: 'CONTINUIDAD_RETIRADA', entidad: 'Enrollment', entidad_id: matricula._id, detalle: `Año ${destino.year}: respuesta retirada (${canal})`, ip });
    }
    return { decision: 'SIN_RESPUESTA' };
  }

  let gradoProyectado: Types.ObjectId | null = null;
  if (respuesta.decision === 'CONTINUA') {
    const siguiente = await gradoSiguienteDe(grupo.grade_id);
    if (!siguiente) throw new ApiError(409, 'Cursa el último grado: lo que sigue es su titulación, no una renovación.');
    gradoProyectado = siguiente._id;
  }
  const motivo = respuesta.decision === 'NO_CONTINUA' ? (respuesta.motivo ?? '').trim() : '';

  const guardada: ConfirmacionContinuidadDocument = await ConfirmacionContinuidad.findOneAndUpdate(
    { student_id: studentId, academic_year_id: destino._id },
    {
      $set: {
        enrollment_id: matricula._id,
        decision: respuesta.decision,
        grade_id: gradoProyectado,
        sede_id: grupo.sede_id,
        jornada_id: grupo.jornada_id ?? null,
        motivo,
        canal,
        registrada_por: usuario._id,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'CONTINUIDAD_REGISTRADA',
    entidad: 'Enrollment',
    entidad_id: matricula._id,
    detalle: `Año ${destino.year}: ${guardada.decision === 'CONTINUA' ? 'continúa' : 'no continúa'} (${canal})`,
    ip,
  });
  return { decision: guardada.decision };
}

// --- Portal del acudiente ---

export interface ContinuidadDelHijo {
  anio_destino: { id: string; year: number } | null;
  /** No tiene matrícula en el año siguiente y puede registrar o cambiar su respuesta. */
  puede_responder: boolean;
  decision: EstadoDeContinuidad;
  /** El grado al que pasaría si continúa; null en el último grado. */
  grado_proyectado: string | null;
  motivo: string;
}

/** Lo que el acudiente ve en el portal sobre la continuidad de UN hijo (el vínculo ya lo comprobó quien llama). */
export async function continuidadDelHijo(studentId: string, _ahora: Date = new Date()): Promise<ContinuidadDelHijo> {
  const sinProceso: ContinuidadDelHijo = { anio_destino: null, puede_responder: false, decision: 'SIN_RESPUESTA', grado_proyectado: null, motivo: '' };
  const anioId = await anioDestinoContinuidad();
  if (!anioId) return sinProceso;
  const destino = await AcademicYear.findById(anioId).select('year');
  const origen = destino ? await AcademicYear.findOne({ year: { $lt: destino.year } }).sort({ year: -1, createdAt: -1 }).select('_id') : null;
  if (!destino || !origen) return sinProceso;
  const conAnio = { ...sinProceso, anio_destino: { id: String(destino._id), year: destino.year } };

  const matricula = await Enrollment.findOne({ student_id: studentId, academic_year_id: origen._id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } }).select('group_id');
  if (!matricula) return conAnio;
  const [grupo, respuesta, yaMatriculado] = await Promise.all([
    Group.findById(matricula.group_id).select('grade_id'),
    ConfirmacionContinuidad.findOne({ student_id: studentId, academic_year_id: destino._id }),
    Enrollment.exists({ student_id: studentId, academic_year_id: destino._id, estado: { $in: ESTADOS_MATRICULA_VIVOS } }),
  ]);
  const siguiente = grupo ? await gradoSiguienteDe(grupo.grade_id) : null;
  return {
    ...conAnio,
    puede_responder: !yaMatriculado,
    decision: respuesta?.decision ?? 'SIN_RESPUESTA',
    grado_proyectado: siguiente?.nombre ?? null,
    motivo: respuesta?.motivo ?? '',
  };
}

/** El acudiente responde por su hijo sobre el año destino disponible. La respuesta no aparta cupo ni matrícula. */
export async function responderContinuidadDelHijo(usuario: UserDocument, studentId: string, respuesta: RespuestaDeContinuidad, ip?: string | null, _ahora: Date = new Date()) {
  const anioId = await anioDestinoContinuidad();
  if (!anioId) throw new ApiError(409, 'No hay un año lectivo de destino disponible para registrar la respuesta de continuidad.');
  return registrarContinuidad(String(anioId), studentId, respuesta, { usuario, canal: 'PORTAL' }, ip);
}
