import { ClientSession, Types } from 'mongoose';
import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { DECISIONES_ANTICIPADA_COMISION, DECISIONES_ANTICIPADA_CONSEJO, EstadoAnticipada, MedioConsentimiento, PREFIJO_RESOLUCION_ANTICIPADA, TipoAnticipada } from '../constants/promocionAnticipada';
import { ROLES } from '../constants/roles';
import { AcademicYearDocument } from '../models/academicYear.model';
import Counter from '../models/counter.model';
import Enrollment, { EnrollmentDocument } from '../models/enrollment.model';
import EvaluacionPromocion from '../models/evaluacionPromocionEstudiante.model';
import Grade from '../models/grade.model';
import Group from '../models/group.model';
import Guardian from '../models/guardian.model';
import PromocionAnticipada, { PromocionAnticipadaDocument } from '../models/promocionAnticipada.model';
import StudentGuardian from '../models/studentGuardian.model';
import StudentProfile from '../models/studentProfile.model';
import Subject from '../models/subject.model';
import TeacherAssignment from '../models/teacherAssignment.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { hashDeActa } from '../utils/comiteConvivencia';
import { escalaEfectiva, validarNotaDentroDeEscala } from '../utils/escalaEvaluacion';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { criterioDe, evaluarCriterio, NotaDeAsignatura, planDeNotasNoCursadas, requisitosPendientes, tramiteAbierto, ventanaAbierta } from '../utils/promocionAnticipada';
import { redondear } from '../utils/recuperaciones';
import runTransaction from '../utils/runTransaction';
import { asegurarAnioNoCerrado } from './academicYear.service';
import { registrarEvento } from './audit.service';
import { cargarAnio } from './configuracionRecuperaciones.service';
import { datosDeConfiguracion, obtenerConfiguracion } from './configuracionPromocionAnticipada.service';
import { cambiarGrupo } from './enrollment.service';
import { asentarNovedadEnObservador } from './novedadInstitucional.service';
import { cargarContextoNotas, clave } from './recuperacion.service';

const GESTIONAN = [ROLES.ADMIN, ROLES.COORDINADOR];

function exigirGestion(usuario: UserDocument): void {
  if (!GESTIONAN.includes(usuario.rol)) throw new ApiError(403, 'Solo rectoría y coordinación gestionan la promoción anticipada.');
}

export const exigirGestionDeTramites = exigirGestion;

function exigirAdmin(usuario: UserDocument, accion: string): void {
  if (usuario.rol !== ROLES.ADMIN) throw new ApiError(403, `Solo el administrador (rector) ${accion}.`);
}

async function confirmarAdmin(usuario: UserDocument, contrasena: string): Promise<void> {
  exigirAdmin(usuario, 'emite la resolución');
  const admin = await User.findById(usuario._id).select('+password_hash');
  if (!admin || !(await admin.comparePassword(contrasena))) throw new ApiError(401, 'Contraseña incorrecta.');
}

async function cargar(id: string): Promise<PromocionAnticipadaDocument> {
  const t = Types.ObjectId.isValid(id) ? await PromocionAnticipada.findById(id) : null;
  if (!t) throw new ApiError(404, 'Trámite de promoción anticipada no encontrado.');
  return t;
}

function exigirAbierto(t: PromocionAnticipadaDocument): void {
  if (!tramiteAbierto(t.estado)) throw new ApiError(409, `El trámite está ${t.estado}: ya no admite este paso.`);
}

const avanceDe = (t: PromocionAnticipadaDocument) => ({
  concepto_favorable: t.concepto_comision?.favorable ?? null,
  consentimiento_otorgado: t.consentimiento?.otorgado ?? null,
  decision_aprobada: t.decision_consejo?.aprobada ?? null,
});

/** Recalcula si el trámite ya reúne los pasos que el colegio exigía cuando lo abrió. */
function actualizarEstado(t: PromocionAnticipadaDocument): void {
  if (!tramiteAbierto(t.estado)) return;
  t.estado = requisitosPendientes(t.reglas.exige, avanceDe(t)).length === 0 ? 'LISTA_PARA_RESOLUCION' : 'SOLICITADA';
}

function cerrar(t: PromocionAnticipadaDocument, estado: 'RECHAZADA' | 'ANULADA', motivo: string, por: Types.ObjectId | null): void {
  t.estado = estado;
  t.cierre = { estado, motivo, por, fecha: new Date() };
}

// --- Notas (solo lectura de M12/M18) ---

interface NotasDeAsignatura {
  subject_id: string;
  nombre: string;
  porPeriodo: Map<number, number>;
}

/** Notas cerradas por periodo del estudiante en cada clase de un grupo. */
async function notasCerradas(anio: AcademicYearDocument, grupoId: Types.ObjectId, estudianteId: Types.ObjectId): Promise<NotasDeAsignatura[]> {
  const asignaciones = await TeacherAssignment.find({ academic_year_id: anio._id, group_id: grupoId, tipo_asignacion: 'CLASE', estado: ESTADO_ACTIVO }).select('_id subject_id');
  const asignaturas = await Subject.find({ _id: { $in: asignaciones.map((a) => a.subject_id) } }).select('nombre');
  const nombre = new Map(asignaturas.map((s) => [String(s._id), s.nombre]));
  const ctx = await cargarContextoNotas(anio, asignaciones.map((a) => a._id));
  return asignaciones.map((a) => ({
    subject_id: String(a.subject_id),
    nombre: nombre.get(String(a.subject_id)) ?? 'Asignatura',
    porPeriodo: ctx.notas.get(clave(a._id, estudianteId))?.cerradas ?? new Map<number, number>(),
  }));
}

/** Promedio de los periodos 1..hasta si TODOS tienen nota cerrada; si falta alguno no hay nota que copiar. */
function notaHasta(porPeriodo: Map<number, number>, hasta: number, decimales: number): number | null {
  const notas = Array.from({ length: hasta }, (_, i) => porPeriodo.get(i + 1));
  if (notas.some((n) => n === undefined)) return null;
  return redondear((notas as number[]).reduce((s, n) => s + n, 0) / hasta, decimales);
}

// --- Solicitar ---

async function esReiniciante(matricula: EnrollmentDocument, gradoId: Types.ObjectId): Promise<boolean> {
  if (matricula.tipo_ingreso === 'REPITENTE') return true;
  return Boolean(await EvaluacionPromocion.exists({ student_id: matricula.student_id, academic_year_id: { $ne: matricula.academic_year_id }, grado_id: gradoId, vigente: true, resultado: 'NO_PROMOVIDO' }));
}

async function gradoSiguiente(grado: { numero: number }) {
  return Grade.findOne({ numero: grado.numero + 1, estado: ESTADO_ACTIVO });
}

export interface EntradaSolicitud {
  enrollment_id: string;
  tipo: TipoAnticipada;
  motivo?: string;
}

/**
 * Abre el trámite. El estudiante debe cumplir el criterio de notas del colegio con las notas CERRADAS del periodo de evaluación (sin todas
 * las notas no se decide) y la solicitud debe llegar dentro de la ventana. Si no cumple, el 409 dice por qué: los criterios son del colegio.
 */
export async function solicitar(e: EntradaSolicitud, usuario: UserDocument, ip?: string | null): Promise<PromocionAnticipadaDocument> {
  exigirGestion(usuario);
  const config = datosDeConfiguracion(await obtenerConfiguracion());
  if (!config.activa) throw new ApiError(409, 'La promoción anticipada está desactivada en la configuración del colegio.');
  const criterio = criterioDe(config, e.tipo);
  if (!criterio.activo) throw new ApiError(409, `El colegio no admite la promoción anticipada por ${e.tipo === 'REINICIANTE' ? 'reiniciante' : 'rendimiento excepcional'}.`);

  const matricula = await Enrollment.findById(e.enrollment_id);
  if (!matricula) throw new ApiError(404, 'Matrícula no encontrada.');
  if (!ESTADOS_MATRICULA_ACTIVOS.includes(matricula.estado)) throw new ApiError(409, 'La matrícula del estudiante no está activa.');
  const anio = await cargarAnio(String(matricula.academic_year_id));
  if (anio.estado !== 'EN_CURSO') throw new ApiError(409, 'La promoción anticipada solo se tramita en el año lectivo en curso.');

  const grupo = await Group.findById(matricula.group_id);
  const grado = grupo ? await Grade.findById(grupo.grade_id) : null;
  if (!grupo || !grado) throw new ApiError(404, 'No se encontró el grupo o el grado de la matrícula.');
  if (config.grados_excluidos_ids && config.grados_excluidos_ids.some((id) => String(id) === String(grado._id))) {
    throw new ApiError(409, `El grado ${grado.nombre} está excluido de la promoción anticipada según el SIEE.`);
  }
  if (!(await gradoSiguiente(grado))) throw new ApiError(409, `No existe un grado activo después de ${grado.nombre}.`);
  if (await EvaluacionPromocion.exists({ academic_year_id: anio._id, student_id: matricula.student_id, vigente: true })) {
    throw new ApiError(409, 'El estudiante ya tiene cierre de promoción del año: la anticipada solo aplica antes de él.');
  }

  const periodo = anio.periodos.find((p) => p.numero === config.periodo_evaluacion);
  if (!periodo) throw new ApiError(409, `El año ${anio.year} no tiene el periodo ${config.periodo_evaluacion} que el colegio fijó para evaluar la promoción anticipada.`);
  if (!ventanaAbierta(periodo.fecha_fin, config.dias_ventana_tras_cierre, new Date())) {
    throw new ApiError(409, `Venció el plazo para solicitar la promoción anticipada (${config.dias_ventana_tras_cierre} días después de cerrar el periodo ${periodo.numero}).`);
  }
  if (e.tipo === 'REINICIANTE' && !(await esReiniciante(matricula, grado._id))) {
    throw new ApiError(409, 'El estudiante no es reiniciante: no ingresó como repitente ni no fue promovido en este grado el año anterior.');
  }

  let asignaturasReprobadasPreviamente: Set<string> | undefined;
  if (e.tipo === 'REINICIANTE' && criterio.nota_minima_asignaturas_reprobadas != null) {
    asignaturasReprobadasPreviamente = new Set<string>();
    const evalPrevia = await EvaluacionPromocion.findOne({
      student_id: matricula.student_id,
      grado_id: grado._id,
      academic_year_id: { $ne: matricula.academic_year_id },
      vigente: true,
      resultado: 'NO_PROMOVIDO',
    }).sort({ createdAt: -1 });

    if (evalPrevia && typeof evalPrevia.detalle === 'object' && evalPrevia.detalle !== null) {
      const perdidas = (evalPrevia.detalle as { perdidas?: Array<{ id?: string; nombre?: string; tipo?: string }> }).perdidas ?? [];
      for (const p of perdidas) {
        if (p.id) asignaturasReprobadasPreviamente.add(String(p.id));
        if (p.nombre) asignaturasReprobadasPreviamente.add(p.nombre.trim().toLowerCase());
      }
    }
  }

  const decimales = escalaEfectiva(anio.escala_evaluacion).precision_decimales;
  const notas: NotaDeAsignatura[] = (await notasCerradas(anio, matricula.group_id, matricula.student_id)).map((n) => ({ subject_id: n.subject_id, nombre: n.nombre, nota: n.porPeriodo.get(periodo.numero) ?? null }));
  const resultado = evaluarCriterio(notas, criterio, decimales, asignaturasReprobadasPreviamente);
  if (!resultado.cumple) throw new ApiError(409, `El estudiante no cumple el criterio del colegio: ${resultado.motivos.join(' ')}`, { motivos: resultado.motivos });

  let tramite: PromocionAnticipadaDocument;
  try {
    tramite = await PromocionAnticipada.create({
      academic_year_id: anio._id,
      anio: anio.year,
      student_id: matricula.student_id,
      enrollment_id: matricula._id,
      grupo_origen_id: grupo._id,
      grado_origen_id: grado._id,
      tipo: e.tipo,
      motivo_solicitud: e.motivo ?? '',
      reglas: { exige: config.exige, tratamiento_notas: config.tratamiento_notas, periodo_evaluacion: config.periodo_evaluacion },
      evaluacion: { periodo: periodo.numero, promedio: resultado.promedio, cumple: true, motivos: [], notas },
      solicitada_por: usuario._id,
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new ApiError(409, 'El estudiante ya tiene un trámite de promoción anticipada vigente en este año.');
    throw err;
  }
  await registrarEvento({ usuario_id: usuario._id, accion: 'PROMOCION_ANTICIPADA_SOLICITADA', entidad: 'PromocionAnticipada', entidad_id: tramite._id, detalle: `${e.tipo}, año ${anio.year}`, ip });
  return tramite;
}

// --- Lectura ---

export interface FiltrosTramites {
  academic_year_id?: string;
  estado?: EstadoAnticipada;
  tipo?: TipoAnticipada;
  student_id?: string;
}

export async function listar(filtros: FiltrosTramites, usuario: UserDocument) {
  exigirGestion(usuario);
  return PromocionAnticipada.find({
    ...(filtros.academic_year_id ? { academic_year_id: filtros.academic_year_id } : {}),
    ...(filtros.estado ? { estado: filtros.estado } : {}),
    ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
    ...(filtros.student_id ? { student_id: filtros.student_id } : {}),
  })
    .sort({ createdAt: -1 })
    .populate('student_id', 'nombre apellido numero_documento')
    .lean();
}

/** El trámite con lo que aún le falta: los pasos pendientes antes de la resolución y las nivelaciones sin nota después de aplicarlo. */
export async function obtener(id: string, usuario: UserDocument) {
  exigirGestion(usuario);
  const t = await cargar(id);
  return {
    ...t.toObject(),
    requisitos_pendientes: tramiteAbierto(t.estado) ? requisitosPendientes(t.reglas.exige, avanceDe(t)) : [],
    nivelaciones_pendientes: (t.aplicacion?.notas ?? []).filter((n) => n.modo === 'NIVELACION' && !n.nivelacion).map((n) => ({ subject_id: n.subject_id, nombre: n.nombre, motivo: n.motivo })),
  };
}

// --- Pasos del trámite ---

export interface EntradaConsentimiento {
  otorgado: boolean;
  medio: MedioConsentimiento;
  /** Acudiente vinculado que responde; si es el propio estudiante mayor de edad, se omite y se pone `por_el_estudiante`. */
  guardian_id?: string | null;
  por_el_estudiante?: boolean;
  observaciones?: string;
}

const MAYORIA_DE_EDAD = 18;

/** Consentimiento (o negativa) de los padres. Quien consiente debe ser un acudiente vinculado al estudiante, o él mismo si ya es mayor de edad. */
export async function registrarConsentimiento(id: string, c: EntradaConsentimiento, usuario: UserDocument, ip?: string | null) {
  exigirGestion(usuario);
  const t = await cargar(id);
  exigirAbierto(t);
  if (t.consentimiento) throw new ApiError(409, 'El consentimiento ya quedó registrado.');

  let otorgadoPor: { guardian_id: Types.ObjectId | null; nombre: string; documento: string };
  if (c.por_el_estudiante) {
    const [estudiante, perfil] = await Promise.all([User.findById(t.student_id).select('nombre apellido numero_documento'), StudentProfile.findOne({ user_id: t.student_id }).select('fecha_nacimiento')]);
    const edad = perfil ? (Date.now() - perfil.fecha_nacimiento.getTime()) / (365.25 * 86_400_000) : 0;
    if (!estudiante || edad < MAYORIA_DE_EDAD) throw new ApiError(409, 'El estudiante es menor de edad: consiente su acudiente.');
    otorgadoPor = { guardian_id: null, nombre: `${estudiante.nombre} ${estudiante.apellido}`, documento: estudiante.numero_documento };
  } else {
    if (!c.guardian_id) throw new ApiError(400, 'Indica el acudiente que responde.');
    const vinculo = await StudentGuardian.findOne({ student_id: t.student_id, guardian_id: c.guardian_id });
    const acudiente = vinculo ? await Guardian.findById(c.guardian_id).select('nombre apellido numero_documento estado') : null;
    if (!acudiente || acudiente.estado === 'inactivo') throw new ApiError(409, 'Ese acudiente no está vinculado al estudiante.');
    otorgadoPor = { guardian_id: acudiente._id, nombre: `${acudiente.nombre} ${acudiente.apellido}`, documento: acudiente.numero_documento };
  }

  t.consentimiento = { otorgado: c.otorgado, medio: c.medio, otorgado_por: otorgadoPor, observaciones: c.observaciones ?? '', fecha: new Date(), registrado_por: usuario._id };
  if (!c.otorgado) cerrar(t, 'RECHAZADA', `La familia no autoriza la promoción anticipada (${otorgadoPor.nombre}).`, usuario._id);
  else actualizarEstado(t);
  await t.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'PROMOCION_ANTICIPADA_CONSENTIMIENTO_REGISTRADO', entidad: 'PromocionAnticipada', entidad_id: t._id, detalle: c.otorgado ? 'Otorgado' : 'No otorgado', ip });
  return t;
}

/**
 * ¿Puede este trámite entrar al orden del día de una sesión de esa instancia? La comisión da su concepto primero; el Consejo Directivo decide
 * después (si el colegio exige el concepto, solo con uno favorable). Lo usa M20 al agregar el caso.
 */
export async function puedeTratarseEn(id: string, instancia: 'COMISION_EVALUACION' | 'CONSEJO_ACADEMICO' | 'CONSEJO_DIRECTIVO'): Promise<PromocionAnticipadaDocument> {
  const t = await cargar(id);
  exigirAbierto(t);
  if (instancia === 'CONSEJO_ACADEMICO') throw new ApiError(400, 'La promoción anticipada la recomienda la comisión y la decide el Consejo Directivo, no el Consejo Académico.');
  if (instancia === 'COMISION_EVALUACION' && t.concepto_comision) throw new ApiError(409, 'La comisión ya emitió su concepto sobre este trámite.');
  if (instancia === 'CONSEJO_DIRECTIVO') {
    if (t.decision_consejo) throw new ApiError(409, 'El Consejo Directivo ya decidió este trámite.');
    if (t.reglas.exige.concepto_comision && t.concepto_comision?.favorable !== true) throw new ApiError(409, 'Falta el concepto favorable de la comisión antes de que lo decida el Consejo Directivo.');
  }
  return t;
}

export const decisionesValidasEn = (instancia: string): readonly string[] =>
  instancia === 'COMISION_EVALUACION' ? DECISIONES_ANTICIPADA_COMISION : instancia === 'CONSEJO_DIRECTIVO' ? DECISIONES_ANTICIPADA_CONSEJO : [];

export interface DecisionDeSesion {
  tramiteId: string;
  instancia: 'COMISION_EVALUACION' | 'CONSEJO_DIRECTIVO';
  aprobada: boolean;
  sesionId: string;
  codigoActa: string;
}

/**
 * Una decisión aprobada por la mayoría de una sesión firmada (M20) queda en el trámite con la referencia del acta. Una recomendación negativa o
 * una no aprobación cierran el trámite. Corre en la transacción de la firma del acta; si el trámite ya no está abierto no hace nada.
 */
export async function registrarDecisionDeSesion(d: DecisionDeSesion, session: ClientSession): Promise<void> {
  const t = await PromocionAnticipada.findById(d.tramiteId).session(session);
  if (!t || !tramiteAbierto(t.estado)) return;
  const ref = { sesion_id: new Types.ObjectId(d.sesionId), acta: d.codigoActa, fecha: new Date() };
  if (d.instancia === 'COMISION_EVALUACION') {
    t.concepto_comision = { ...ref, favorable: d.aprobada };
    if (!d.aprobada) cerrar(t, 'RECHAZADA', `La Comisión de Evaluación y Promoción no recomienda la promoción anticipada (acta ${d.codigoActa}).`, null);
  } else {
    t.decision_consejo = { ...ref, aprobada: d.aprobada };
    if (!d.aprobada) cerrar(t, 'RECHAZADA', `El Consejo Directivo no aprueba la promoción anticipada (acta ${d.codigoActa}).`, null);
  }
  actualizarEstado(t);
  await t.save({ session });
}

// --- Resolución rectoral ---

/** Lo que entra a la huella de la resolución: todo lo que la respalda. */
export function contenidoDeResolucion(t: PromocionAnticipadaDocument, codigo: string, fecha: Date, fundamento: string): unknown {
  return JSON.parse(
    JSON.stringify({
      codigo,
      fecha,
      fundamento,
      anio: t.anio,
      tipo: t.tipo,
      student_id: t.student_id,
      enrollment_id: t.enrollment_id,
      grupo_origen_id: t.grupo_origen_id,
      grado_origen_id: t.grado_origen_id,
      reglas: t.reglas,
      evaluacion: t.evaluacion,
      concepto_comision: t.concepto_comision,
      consentimiento: t.consentimiento && { otorgado: t.consentimiento.otorgado, medio: t.consentimiento.medio, otorgado_por: t.consentimiento.otorgado_por, fecha: t.consentimiento.fecha },
      decision_consejo: t.decision_consejo,
    })
  );
}

/** El rector emite la resolución cuando están cumplidos los pasos que el colegio exige. Consecutivo anual sin huecos y huella SHA-256. */
export async function emitirResolucion(id: string, fundamento: string, contrasena: string, usuario: UserDocument, ip?: string | null) {
  await confirmarAdmin(usuario, contrasena);
  const t = await cargar(id);
  if (t.estado === 'SOLICITADA') throw new ApiError(409, 'Aún no se cumplen los pasos exigidos.', { pendientes: requisitosPendientes(t.reglas.exige, avanceDe(t)) });
  if (t.estado !== 'LISTA_PARA_RESOLUCION') throw new ApiError(409, `El trámite está ${t.estado}: no admite una resolución.`);
  await asegurarAnioNoCerrado(String(t.academic_year_id));
  if (await EvaluacionPromocion.exists({ academic_year_id: t.academic_year_id, student_id: t.student_id, vigente: true })) {
    throw new ApiError(409, 'El estudiante ya tiene cierre de promoción del año: la resolución ya no procede.');
  }

  const resuelta = await runTransaction(async (session) => {
    const contador = await Counter.findByIdAndUpdate(`RESOLUCION-${PREFIJO_RESOLUCION_ANTICIPADA}-${t.anio}`, { $inc: { seq: 1 } }, { new: true, upsert: true, session });
    const consecutivo = contador?.seq ?? 1;
    const codigo = `${PREFIJO_RESOLUCION_ANTICIPADA}-${t.anio}-${String(consecutivo).padStart(3, '0')}`;
    const fecha = new Date();
    t.resolucion = { codigo, consecutivo, fecha, fundamento, emitida_por: usuario._id, hash: hashDeActa(contenidoDeResolucion(t, codigo, fecha, fundamento)) };
    t.estado = 'RESUELTA';
    await t.save({ session });
    return t;
  });
  await registrarEvento({ usuario_id: usuario._id, accion: 'PROMOCION_ANTICIPADA_RESOLUCION_EMITIDA', entidad: 'PromocionAnticipada', entidad_id: t._id, detalle: resuelta.resolucion?.codigo, ip });
  return resuelta;
}

/** Recalcula la huella de la resolución: un cambio hecho directo en la base la delata. */
export async function verificarIntegridad(id: string, usuario: UserDocument): Promise<{ integra: boolean }> {
  exigirGestion(usuario);
  const t = await cargar(id);
  if (!t.resolucion) throw new ApiError(409, 'Solo un trámite con resolución tiene huella.');
  return { integra: hashDeActa(contenidoDeResolucion(t, t.resolucion.codigo, t.resolucion.fecha, t.resolucion.fundamento)) === t.resolucion.hash };
}

// --- Aplicar: el estudiante pasa al grupo del grado siguiente ---

/**
 * Mueve la matrícula al grupo del grado siguiente (M04 `cambiarGrupo`: conserva folio, checklist e historial; nunca crea otra matrícula) y deja
 * resuelta, asignatura por asignatura, la situación de los periodos que el estudiante no cursó en el grado nuevo. Solo el rector, con la
 * resolución emitida. Si la matrícula ya está en el grupo destino (reintento tras un fallo) no la vuelve a mover.
 */
export async function aplicar(id: string, grupoDestinoId: string, usuario: UserDocument, ip?: string | null) {
  exigirAdmin(usuario, 'aplica la promoción anticipada');
  const t = await cargar(id);
  if (t.estado !== 'RESUELTA') throw new ApiError(409, t.estado === 'APLICADA' ? 'La promoción anticipada ya se aplicó.' : 'Primero se emite la resolución rectoral.');
  const anio = await cargarAnio(String(t.academic_year_id));
  if (anio.estado !== 'EN_CURSO') throw new ApiError(409, 'Solo se aplica en el año lectivo en curso.');
  if (await EvaluacionPromocion.exists({ academic_year_id: t.academic_year_id, student_id: t.student_id, vigente: true })) {
    throw new ApiError(409, 'El estudiante ya tiene cierre de promoción del año: ya no se puede aplicar.');
  }

  const [origen, destino, gradoOrigen] = await Promise.all([Group.findById(t.grupo_origen_id), Group.findById(grupoDestinoId), Grade.findById(t.grado_origen_id)]);
  if (!origen || !destino || !gradoOrigen) throw new ApiError(404, 'Grupo o grado no encontrado.');
  if (String(destino.academic_year_id) !== String(t.academic_year_id)) throw new ApiError(400, 'El grupo destino no es del mismo año lectivo.');
  if (String(destino.sede_id) !== String(origen.sede_id)) throw new ApiError(409, 'El grupo destino debe ser de la misma sede del estudiante.');
  const gradoDestino = await Grade.findById(destino.grade_id);
  if (!gradoDestino || gradoDestino.numero !== gradoOrigen.numero + 1) throw new ApiError(409, `El grupo destino debe ser del grado siguiente a ${gradoOrigen.nombre}.`);

  const asignaciones = await TeacherAssignment.find({ academic_year_id: anio._id, group_id: destino._id, tipo_asignacion: 'CLASE', estado: ESTADO_ACTIVO }).select('subject_id');
  if (asignaciones.length === 0) throw new ApiError(409, 'El grupo destino aún no tiene asignaturas con docente: arma primero su carga académica.');
  const asignaturas = await Subject.find({ _id: { $in: asignaciones.map((a) => a.subject_id) } }).select('nombre');
  const nuevas = asignaturas.map((s) => ({ subject_id: String(s._id), nombre: s.nombre }));

  const decimales = escalaEfectiva(anio.escala_evaluacion).precision_decimales;
  const deOrigen = (await notasCerradas(anio, origen._id, t.student_id)).map((n) => ({ subject_id: n.subject_id, nombre: n.nombre, nota: notaHasta(n.porPeriodo, t.reglas.periodo_evaluacion, decimales) }));
  const plan = planDeNotasNoCursadas(t.reglas.tratamiento_notas, nuevas, deOrigen);

  const matricula = await Enrollment.findById(t.enrollment_id);
  if (!matricula || !ESTADOS_MATRICULA_ACTIVOS.includes(matricula.estado)) throw new ApiError(409, 'La matrícula del estudiante ya no está activa.');
  if (String(matricula.group_id) !== String(destino._id)) await cambiarGrupo(matricula._id, destino._id, { id: usuario._id });

  // Soporte legal en el historial de la matrícula; el filtro por referencia evita duplicarlo si se reintenta tras un fallo.
  const codigoResolucion = t.resolucion?.codigo ?? '';
  const textoNovedad = `Promovido anticipadamente de ${gradoOrigen.nombre} a ${gradoDestino.nombre} según Resolución No. ${codigoResolucion}.`;
  await Enrollment.updateOne(
    { _id: matricula._id, 'novedades.referencia': { $ne: codigoResolucion } },
    { $push: { novedades: { tipo: 'PROMOCION_ANTICIPADA', texto: textoNovedad, referencia: codigoResolucion, fecha: new Date(), por: usuario._id } } }
  );
  // Y la misma novedad en el Observador, visible para el estudiante y su familia.
  const ahora = new Date();
  const periodoActual = anio.periodos.find((p) => p.fecha_inicio <= ahora && ahora <= p.fecha_fin)?.numero ?? null;
  await asentarNovedadEnObservador({ student_id: t.student_id, enrollment_id: matricula._id, group_id: destino._id, sede_id: destino.sede_id, academic_year_id: t.academic_year_id, periodo_numero: periodoActual, texto: textoNovedad, por: usuario._id });

  t.aplicacion = {
    fecha: new Date(),
    grupo_destino_id: destino._id,
    grado_destino_id: gradoDestino._id,
    por: usuario._id,
    notas: plan.map((p) => ({ subject_id: new Types.ObjectId(p.subject_id), nombre: p.nombre, modo: p.modo, nota: p.nota, motivo: p.motivo, nivelacion: null })),
  };
  t.estado = 'APLICADA';
  await t.save();
  const nivelaciones = plan.filter((p) => p.modo === 'NIVELACION').length;
  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'PROMOCION_ANTICIPADA_APLICADA',
    entidad: 'PromocionAnticipada',
    entidad_id: t._id,
    detalle: `${gradoOrigen.nombre} -> ${gradoDestino.nombre}; ${t.reglas.tratamiento_notas}; ${nivelaciones} nivelación(es) pendiente(s)`,
    ip,
  });
  return { tramite: t, nivelaciones_pendientes: nivelaciones };
}

// --- Nivelación ---

/**
 * La nota de nivelación de una asignatura del grado nuevo: la registra el docente que la dicta en el grupo destino, o coordinación/rector. Pasa
 * por la escala del año. Se puede corregir mientras el año esté abierto; cada registro queda en la auditoría.
 */
export async function registrarNivelacion(id: string, subjectId: string, nota: number, usuario: UserDocument, ip?: string | null) {
  const t = await cargar(id);
  if (t.estado !== 'APLICADA' || !t.aplicacion) throw new ApiError(409, 'La nivelación se registra cuando la promoción anticipada ya está aplicada.');
  await asegurarAnioNoCerrado(String(t.academic_year_id));
  const entrada = t.aplicacion.notas.find((n) => String(n.subject_id) === subjectId);
  if (!entrada || entrada.modo !== 'NIVELACION') throw new ApiError(404, 'Esa asignatura no tiene una nivelación pendiente en este trámite.');
  if (!GESTIONAN.includes(usuario.rol)) {
    const dicta = await TeacherAssignment.exists({ docente_id: usuario._id, group_id: t.aplicacion.grupo_destino_id, subject_id: subjectId, tipo_asignacion: 'CLASE', estado: ESTADO_ACTIVO });
    if (!dicta) throw new ApiError(403, 'Solo el docente que dicta la asignatura en el grupo, coordinación o el rector registran la nivelación.');
  }
  const anio = await cargarAnio(String(t.academic_year_id));
  validarNotaDentroDeEscala(nota, anio.escala_evaluacion);
  entrada.nivelacion = { nota, fecha: new Date(), por: usuario._id };
  await t.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'PROMOCION_ANTICIPADA_NIVELACION_REGISTRADA', entidad: 'PromocionAnticipada', entidad_id: t._id, detalle: `Asignatura ${subjectId}`, ip });
  return t;
}

// --- Cerrar sin aplicar ---

/** Rectoría o coordinación anulan un trámite abierto; una vez emitida la resolución solo el rector. Uno ya aplicado no se anula: se corrige con «Cambiar grupo». */
export async function anular(id: string, motivo: string, usuario: UserDocument, ip?: string | null) {
  exigirGestion(usuario);
  const t = await cargar(id);
  if (t.estado === 'APLICADA') throw new ApiError(409, 'La promoción ya se aplicó: para revertirla se cambia al estudiante de grupo desde su matrícula.');
  if (t.estado === 'RECHAZADA' || t.estado === 'ANULADA') throw new ApiError(409, `El trámite ya está ${t.estado}.`);
  if (t.estado === 'RESUELTA') exigirAdmin(usuario, 'anula un trámite con resolución emitida');
  cerrar(t, 'ANULADA', motivo, usuario._id);
  await t.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'PROMOCION_ANTICIPADA_ANULADA', entidad: 'PromocionAnticipada', entidad_id: t._id, ip });
  return t;
}
