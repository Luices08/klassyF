import { ClientSession, Types } from 'mongoose';
import { env } from '../config/env';
import { MomentoPromocion, ResultadoPromocion } from '../constants/promocion';
import { ROLES } from '../constants/roles';
import EvaluacionPromocion, { EvaluacionPromocionDocument } from '../models/evaluacionPromocionEstudiante.model';
import Group from '../models/group.model';
import PromocionAnticipada from '../models/promocionAnticipada.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { huellaDeEvaluacion } from '../utils/evaluacionPromocion';
import { evaluarPromocion, PoliticaPromocion, ResultadoMotor } from '../utils/promocion';
import runTransaction from '../utils/runTransaction';
import { cargarAnio } from './configuracionRecuperaciones.service';
import { registrarEvento } from './audit.service';
import { datosDePolitica, obtenerPolitica } from './politicaPromocion.service';
import { evaluarTitulacionDeMatriculas } from './titulacion.service';
import { construirEntradasDelGrupo, EntradaDeEstudiante } from './promocionContexto.service';

const PUEDEN_CONSULTAR = [ROLES.ADMIN, ROLES.COORDINADOR];

function exigirConsulta(usuario: UserDocument): void {
  if (!PUEDEN_CONSULTAR.includes(usuario.rol)) throw new ApiError(403, 'Solo coordinación y el administrador consultan la promoción.');
}

function claveDeHuella(): string {
  if (!env.certificadosSecret) throw new ApiError(503, 'El servidor no tiene definido CERT_HMAC_SECRET: no se pueden cerrar ni verificar cierres de promoción.');
  return env.certificadosSecret;
}

async function cargarGrupo(groupId: string, anioId: string) {
  const grupo = await Group.findById(groupId);
  if (!grupo) throw new ApiError(404, 'Grupo no encontrado.');
  if (String(grupo.academic_year_id) !== anioId) throw new ApiError(400, 'El grupo no pertenece al año lectivo indicado.');
  return grupo;
}

export interface FilaPromocion {
  student_id: string;
  enrollment_id: string;
  estudiante: { nombre: string; apellido: string; numero_documento: string };
  /** Versión vigente ya cerrada, si la hay. */
  cerrado: { version: number; momento: MomentoPromocion; resultado: ResultadoPromocion } | null;
  /** Lo que el motor decide hoy (solo para quien aún debe evaluarse en ese momento). */
  motor: ResultadoMotor | null;
}

/**
 * A quién le toca evaluar en ese momento: al CIERRE, a quien aún no está cerrado; tras la recuperación final, solo a quien quedó
 * PENDIENTE_RECUPERACION (los demás conservan su cierre).
 */
function leTocaEvaluar(vigente: EvaluacionPromocionDocument | undefined, momento: MomentoPromocion): boolean {
  if (momento === 'CIERRE') return !vigente;
  return vigente?.resultado === 'PENDIENTE_RECUPERACION' && vigente.momento === 'CIERRE';
}

async function prepararGrupo(anioId: string, groupId: string, momento: MomentoPromocion) {
  const anio = await cargarAnio(anioId);
  const grupo = await cargarGrupo(groupId, anioId);
  const politicaDoc = await obtenerPolitica(anioId);
  const politica = datosDePolitica(politicaDoc);
  const entradas = await construirEntradasDelGrupo(anio, grupo, momento);
  const vigentes = new Map((await EvaluacionPromocion.find({ academic_year_id: anio._id, group_id: grupo._id, vigente: true })).map((e) => [String(e.student_id), e]));
  return { anio, grupo, politica, entradas, vigentes };
}

/** Simulación (dry run): calcula sin guardar nada. Es lo que ve rectoría antes de cerrar. */
export async function simularGrupo(anioId: string, groupId: string, momento: MomentoPromocion, usuario: UserDocument): Promise<FilaPromocion[]> {
  exigirConsulta(usuario);
  const { politica, entradas, vigentes } = await prepararGrupo(anioId, groupId, momento);
  const usuarios = await User.find({ _id: { $in: entradas.map((e) => e.student_id) } }).select('nombre apellido numero_documento');
  const porId = new Map(usuarios.map((u) => [String(u._id), u]));

  return entradas
    .map((e): FilaPromocion => {
      const vigente = vigentes.get(e.student_id);
      const u = porId.get(e.student_id);
      return {
        student_id: e.student_id,
        enrollment_id: e.enrollment_id,
        estudiante: { nombre: u?.nombre ?? '', apellido: u?.apellido ?? '', numero_documento: u?.numero_documento ?? '' },
        cerrado: vigente ? { version: vigente.version, momento: vigente.momento, resultado: vigente.resultado } : null,
        motor: leTocaEvaluar(vigente, momento) ? evaluarPromocion(e.entrada, politica, momento) : null,
      };
    })
    .sort((a, b) => a.estudiante.apellido.localeCompare(b.estudiante.apellido, 'es') || a.estudiante.nombre.localeCompare(b.estudiante.nombre, 'es'));
}

async function confirmarAdmin(usuario: UserDocument, contrasena: string): Promise<void> {
  if (usuario.rol !== ROLES.ADMIN) throw new ApiError(403, 'Solo el administrador cierra la promoción.');
  const admin = await User.findById(usuario._id).select('+password_hash');
  if (!admin || !(await admin.comparePassword(contrasena))) throw new ApiError(401, 'Contraseña incorrecta.');
}

function contenidoDe(e: EntradaDeEstudiante, anioId: string, groupId: string, version: number, momento: MomentoPromocion, motor: ResultadoMotor, politica: PoliticaPromocion, motivo: string) {
  const { resultado, ...detalle } = motor;
  return {
    academic_year_id: anioId,
    student_id: e.student_id,
    enrollment_id: e.enrollment_id,
    group_id: groupId,
    version,
    momento,
    resultado,
    detalle,
    entrada: e.entrada,
    politica,
    motivo,
  };
}

interface DatosVersion {
  anioId: string;
  studentId: string;
  enrollmentId: string;
  groupId: string;
  gradoId: string;
  momento: MomentoPromocion;
  resultado: ResultadoPromocion;
  detalle: unknown;
  entrada: unknown;
  politica: unknown;
  motivo: string;
}

/** Guarda una versión nueva del cierre de un estudiante: la anterior deja de ser vigente y la nueva lleva su huella. */
async function persistirVersion(d: DatosVersion, anterior: EvaluacionPromocionDocument | undefined, usuario: UserDocument, session: ClientSession): Promise<EvaluacionPromocionDocument> {
  const version = (anterior?.version ?? 0) + 1;
  const huella = huellaDeEvaluacion(claveDeHuella(), {
    academic_year_id: d.anioId,
    student_id: d.studentId,
    enrollment_id: d.enrollmentId,
    group_id: d.groupId,
    version,
    momento: d.momento,
    resultado: d.resultado,
    detalle: d.detalle,
    entrada: d.entrada,
    politica: d.politica,
    motivo: d.motivo,
  });
  if (anterior) await EvaluacionPromocion.updateOne({ _id: anterior._id }, { $set: { vigente: false } }, { session });
  const [creada] = await EvaluacionPromocion.create(
    [
      {
        academic_year_id: d.anioId,
        student_id: d.studentId,
        enrollment_id: d.enrollmentId,
        group_id: d.groupId,
        grado_id: d.gradoId,
        version,
        vigente: true,
        momento: d.momento,
        resultado: d.resultado,
        detalle: d.detalle,
        entrada: d.entrada,
        politica: d.politica,
        motivo: d.motivo,
        calculado_por: usuario._id,
        huella,
      },
    ],
    { session }
  );
  return creada as EvaluacionPromocionDocument;
}

async function guardarVersion(
  e: EntradaDeEstudiante,
  anioId: string,
  groupId: string,
  momento: MomentoPromocion,
  motor: ResultadoMotor,
  politica: PoliticaPromocion,
  anterior: EvaluacionPromocionDocument | undefined,
  motivo: string,
  usuario: UserDocument,
  session: ClientSession
): Promise<EvaluacionPromocionDocument> {
  const contenido = contenidoDe(e, anioId, groupId, (anterior?.version ?? 0) + 1, momento, motor, politica, motivo);
  return persistirVersion(
    { anioId, studentId: e.student_id, enrollmentId: e.enrollment_id, groupId, gradoId: e.entrada.grado_id, momento, resultado: motor.resultado, detalle: contenido.detalle, entrada: e.entrada, politica, motivo },
    anterior,
    usuario,
    session
  );
}

export interface DecisionDeInstancia {
  anioId: string;
  studentId: string;
  resultado: ResultadoPromocion;
  sesionId: string;
  codigoActa: string;
  instancia: string;
  fundamento: string;
}

/**
 * Una decisión de la comisión o de un consejo (acta firmada, M20) pasa a M19 como una versión nueva del cierre del estudiante, con la
 * referencia del acta. Conserva las notas y la política con que se calculó el cierre anterior: lo único que cambia es el resultado y el porqué.
 * Corre en la transacción de la firma del acta.
 */
export async function aplicarDecisionDeInstancia(d: DecisionDeInstancia, usuario: UserDocument, session: ClientSession): Promise<EvaluacionPromocionDocument> {
  const vigente = await EvaluacionPromocion.findOne({ academic_year_id: d.anioId, student_id: d.studentId, vigente: true }).session(session);
  if (!vigente) throw new ApiError(409, 'El estudiante no tiene un cierre de promoción al cual aplicar la decisión.');
  const previo = vigente.detalle as ResultadoMotor & { decision_instancia?: unknown };
  const detalle = {
    ...previo,
    arrastres: d.resultado === 'PROMOVIDO_CON_ARRASTRE' ? previo.perdidas : [],
    a_recuperar: d.resultado === 'PENDIENTE_RECUPERACION' ? previo.perdidas : [],
    motivos: [...(previo.motivos ?? []), `Decisión de ${d.instancia} en el acta ${d.codigoActa}: ${d.fundamento || 'sin fundamento escrito'}`],
    decision_instancia: { sesion_id: d.sesionId, acta: d.codigoActa, instancia: d.instancia, resultado_anterior: vigente.resultado },
  };
  return persistirVersion(
    {
      anioId: d.anioId,
      studentId: d.studentId,
      enrollmentId: String(vigente.enrollment_id),
      groupId: String(vigente.group_id),
      gradoId: String(vigente.grado_id),
      momento: vigente.momento,
      resultado: d.resultado,
      detalle,
      entrada: vigente.entrada,
      politica: vigente.politica,
      motivo: `Decisión de ${d.instancia} (acta ${d.codigoActa})`,
    },
    vigente,
    usuario,
    session
  );
}

export interface ResumenCierre {
  momento: MomentoPromocion;
  cerrados: number;
  omitidos: number;
  por_resultado: Partial<Record<ResultadoPromocion, number>>;
  /** Estudiantes que quedan sin cierre hasta que se registre su nivelación; el resto del grupo sí se cerró. */
  bloqueados: Array<{ student_id: string; nivelaciones_pendientes: string[] }>;
}

/**
 * Cierre definitivo de un grupo (solo ADMIN, con su contraseña). Todo o nada: si algún estudiante que debe evaluarse queda INCOMPLETO
 * (le faltan notas anuales) no se cierra a nadie y el 409 dice a quiénes. Quien ya tiene su cierre en ese momento se omite (idempotente).
 */
export async function cerrarGrupo(anioId: string, groupId: string, momento: MomentoPromocion, contrasena: string, usuario: UserDocument, ip?: string | null): Promise<ResumenCierre> {
  await confirmarAdmin(usuario, contrasena);
  const { anio, politica, entradas, vigentes } = await prepararGrupo(anioId, groupId, momento);
  if (anio.estado !== 'EN_CURSO') throw new ApiError(409, 'Solo se cierra la promoción de un año lectivo en curso.');

  const porEvaluar = entradas.filter((e) => leTocaEvaluar(vigentes.get(e.student_id), momento));
  // Una nivelación pendiente (promoción anticipada) frena solo a ese estudiante: el resto del grupo se cierra y él queda para después.
  const conNivelacion = await nivelacionesPendientes(anioId, porEvaluar.map((e) => e.student_id));
  const bloqueados = porEvaluar.filter((e) => conNivelacion.has(e.student_id));
  const pendientes = porEvaluar.filter((e) => !conNivelacion.has(e.student_id));
  const calculados = pendientes.map((e) => ({ e, motor: evaluarPromocion(e.entrada, politica, momento) }));
  const incompletos = calculados.filter((c) => c.motor.resultado === 'INCOMPLETO');
  if (incompletos.length > 0) {
    throw new ApiError(409, `${incompletos.length} estudiante(s) no tienen todas sus notas anuales cerradas: no se puede cerrar el grupo.`, {
      estudiantes: incompletos.map((c) => ({ student_id: c.e.student_id, sin_nota: c.motor.sin_nota })),
    });
  }

  const por_resultado: Partial<Record<ResultadoPromocion, number>> = {};
  await runTransaction(async (session) => {
    for (const { e, motor } of calculados) {
      await guardarVersion(e, anioId, groupId, momento, motor, politica, vigentes.get(e.student_id), '', usuario, session);
      por_resultado[motor.resultado] = (por_resultado[motor.resultado] ?? 0) + 1;
    }
  });

  await evaluarTitulacionDeMatriculas(calculados.map((c) => c.e.enrollment_id), usuario);
  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'PROMOCION_CIERRE_GRUPO',
    entidad: 'Group',
    entidad_id: groupId,
    detalle: `Año ${anio.year}, ${momento}: ${calculados.length} cerrados, ${entradas.length - porEvaluar.length} omitidos, ${bloqueados.length} con nivelación pendiente`,
    ip,
  });
  return {
    momento,
    cerrados: calculados.length,
    omitidos: entradas.length - porEvaluar.length,
    por_resultado,
    bloqueados: bloqueados.map((b) => ({ student_id: b.student_id, nivelaciones_pendientes: conNivelacion.get(b.student_id) ?? [] })),
  };
}

/** Estudiantes con una promoción anticipada aplicada cuya nivelación aún no tiene nota → nombres de las asignaturas que faltan. */
async function nivelacionesPendientes(anioId: string, estudiantesIds: string[]): Promise<Map<string, string[]>> {
  const tramites = await PromocionAnticipada.find({ academic_year_id: anioId, student_id: { $in: estudiantesIds }, estado: 'APLICADA' }).select('student_id aplicacion.notas').lean();
  const pendientes = new Map<string, string[]>();
  for (const t of tramites) {
    const faltan = (t.aplicacion?.notas ?? []).filter((n) => n.modo === 'NIVELACION' && !n.nivelacion).map((n) => n.nombre);
    if (faltan.length > 0) pendientes.set(String(t.student_id), faltan);
  }
  return pendientes;
}

/**
 * Corrige el cierre de UN estudiante (p. ej. una reclamación aprobada por el Consejo Académico): recalcula con los datos de hoy y guarda
 * una versión nueva con el motivo. Los demás estudiantes del grupo no se tocan. Solo ADMIN, con contraseña.
 */
export async function reevaluarEstudiante(anioId: string, studentId: string, motivo: string, contrasena: string, usuario: UserDocument, ip?: string | null): Promise<EvaluacionPromocionDocument> {
  await confirmarAdmin(usuario, contrasena);
  const vigente = await EvaluacionPromocion.findOne({ academic_year_id: anioId, student_id: studentId, vigente: true });
  if (!vigente) throw new ApiError(404, 'Ese estudiante aún no tiene un cierre de promoción que corregir.');
  if ((vigente.detalle as { decision_instancia?: { acta?: string } }).decision_instancia) {
    throw new ApiError(409, `Este cierre es una decisión de una instancia colegiada (acta ${(vigente.detalle as { decision_instancia: { acta: string } }).decision_instancia.acta}): para cambiarla se necesita una nueva sesión, no un recálculo.`);
  }
  const anio = await cargarAnio(anioId);
  if (anio.estado !== 'EN_CURSO') throw new ApiError(409, 'El año lectivo ya no está en curso: la corrección debe pasar por la reapertura del año.');

  const { politica, entradas } = await prepararGrupo(anioId, String(vigente.group_id), vigente.momento);
  const entrada = entradas.find((e) => e.student_id === studentId);
  if (!entrada) throw new ApiError(409, 'El estudiante ya no tiene matrícula activa en ese grupo.');
  const motor = evaluarPromocion(entrada.entrada, politica, vigente.momento);
  if (motor.resultado === 'INCOMPLETO') throw new ApiError(409, `Faltan notas anuales: ${motor.sin_nota.join(', ')}.`);

  const nueva = await runTransaction((session) => guardarVersion(entrada, anioId, String(vigente.group_id), vigente.momento, motor, politica, vigente, motivo, usuario, session));
  await evaluarTitulacionDeMatriculas([nueva.enrollment_id], usuario);
  await registrarEvento({ usuario_id: usuario._id, accion: 'PROMOCION_REEVALUADA', entidad: 'EvaluacionPromocionEstudiante', entidad_id: nueva._id, detalle: `Versión ${nueva.version}, resultado ${nueva.resultado}`, ip });
  return nueva;
}

export interface FiltrosEvaluaciones {
  academic_year_id: string;
  group_id?: string;
  student_id?: string;
  resultado?: ResultadoPromocion;
  historial?: boolean;
}

export async function listarEvaluaciones(filtros: FiltrosEvaluaciones, usuario: UserDocument) {
  exigirConsulta(usuario);
  return EvaluacionPromocion.find({
    academic_year_id: filtros.academic_year_id,
    ...(filtros.group_id ? { group_id: filtros.group_id } : {}),
    ...(filtros.student_id ? { student_id: filtros.student_id } : {}),
    ...(filtros.resultado ? { resultado: filtros.resultado } : {}),
    ...(filtros.historial ? {} : { vigente: true }),
  })
    .sort({ student_id: 1, version: -1 })
    .populate('student_id', 'nombre apellido numero_documento')
    .lean();
}

/** Recalcula la huella de un cierre para detectar cambios hechos directo en la base. */
export async function verificarIntegridad(id: string, usuario: UserDocument): Promise<{ integra: boolean }> {
  exigirConsulta(usuario);
  const e = await EvaluacionPromocion.findById(id);
  if (!e) throw new ApiError(404, 'Cierre no encontrado.');
  const contenido = {
    academic_year_id: String(e.academic_year_id),
    student_id: String(e.student_id),
    enrollment_id: String(e.enrollment_id),
    group_id: String(e.group_id),
    version: e.version,
    momento: e.momento,
    resultado: e.resultado,
    detalle: e.detalle,
    entrada: e.entrada,
    politica: e.politica,
    motivo: e.motivo,
  };
  return { integra: huellaDeEvaluacion(claveDeHuella(), contenido) === e.huella };
}

/** El cierre vigente de una matrícula: lo que leerán M26 (certificado de estudio) y M17 (boletín final). Null si el grupo aún no se cerró. */
export async function obtenerCierreVigente(matriculaId: string | Types.ObjectId): Promise<EvaluacionPromocionDocument | null> {
  return EvaluacionPromocion.findOne({ enrollment_id: matriculaId, vigente: true });
}
