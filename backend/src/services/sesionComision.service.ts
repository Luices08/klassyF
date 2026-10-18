import { Types } from 'mongoose';
import { DecisionCaso, DecisionDeCaso, DECISIONES_CASO, EstadoCompromiso, InstanciaSesion, NOMBRES_INSTANCIA, PREFIJO_ACTA, Representacion, ResponsableCompromiso, TipoCaso, Voto } from '../constants/comision';
import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { ResultadoPromocion } from '../constants/promocion';
import { ROLES } from '../constants/roles';
import Counter from '../models/counter.model';
import Enrollment from '../models/enrollment.model';
import EvaluacionPromocion from '../models/evaluacionPromocionEstudiante.model';
import Guardian from '../models/guardian.model';
import Group from '../models/group.model';
import SesionComision, { ICasoSesion, SesionComisionDocument } from '../models/sesionComision.model';
import StudentGuardian from '../models/studentGuardian.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { actaCompleta, contarVotos, firmantesRequeridos, MiembroParaFirma, quorumDeSesion } from '../utils/comision';
import { hashDeActa, quorumDeCaso } from '../utils/comiteConvivencia';
import runTransaction from '../utils/runTransaction';
import { asegurarAnioNoCerrado } from './academicYear.service';
import { registrarEvento } from './audit.service';
import { cargarAnio } from './configuracionRecuperaciones.service';
import { datosDeConfiguracion, obtenerConfiguracion } from './configuracionComision.service';
import { aplicarDecisionDeInstancia } from './evaluacionPromocion.service';
import { avisarSesionConvocada } from './notificacionesEventos.service';
import { decisionesValidasEn, puedeTratarseEn, registrarDecisionDeSesion } from './promocionAnticipada.service';
import { evaluarTitulacionDeMatriculas } from './titulacion.service';

const RESULTADO_DE_DECISION: Record<DecisionCaso, ResultadoPromocion> = {
  PROMOVER: 'PROMOVIDO',
  NO_PROMOVER: 'NO_PROMOVIDO',
  PROMOVER_CON_ARRASTRE: 'PROMOVIDO_CON_ARRASTRE',
  ENVIAR_A_RECUPERACION: 'PENDIENTE_RECUPERACION',
};

// --- Permisos ---

/** El Consejo Directivo lo gestiona el rector (ADMIN); la comisión y el Consejo Académico, también coordinación. */
function exigirGestion(usuario: UserDocument, instancia: InstanciaSesion): void {
  const permitidos = instancia === 'CONSEJO_DIRECTIVO' ? [ROLES.ADMIN] : [ROLES.ADMIN, ROLES.COORDINADOR];
  if (!permitidos.includes(usuario.rol)) throw new ApiError(403, `Solo ${instancia === 'CONSEJO_DIRECTIVO' ? 'el rector (administrador)' : 'rectoría y coordinación'} gestionan las sesiones del ${NOMBRES_INSTANCIA[instancia]}.`);
}

const esMiembro = (s: SesionComisionDocument, usuario: UserDocument): boolean => s.miembros.some((m) => m.user_id && String(m.user_id) === String(usuario._id));
const puedeVer = (s: SesionComisionDocument, usuario: UserDocument): boolean => usuario.rol === ROLES.ADMIN || usuario.rol === ROLES.COORDINADOR || esMiembro(s, usuario);

async function cargarSesion(id: string): Promise<SesionComisionDocument> {
  const s = Types.ObjectId.isValid(id) ? await SesionComision.findById(id) : null;
  if (!s) throw new ApiError(404, 'Sesión no encontrada.');
  return s;
}

/** «No existe» y «no es tuya» responden igual. */
async function cargarVisible(id: string, usuario: UserDocument): Promise<SesionComisionDocument> {
  const s = await cargarSesion(id);
  if (!puedeVer(s, usuario)) throw new ApiError(404, 'Sesión no encontrada.');
  return s;
}

function exigirAbierta(s: SesionComisionDocument, hasta: Array<SesionComisionDocument['estado']> = ['BORRADOR', 'CONVOCADA']): void {
  if (!hasta.includes(s.estado)) {
    throw new ApiError(409, s.estado === 'FIRMADA' ? 'El acta está firmada y es inmutable.' : s.estado === 'ANULADA' ? 'La sesión está anulada.' : `La sesión ya está ${s.estado}: no admite este cambio.`);
  }
}

// --- Lectura ---

export async function listarSesiones(filtros: { academic_year_id?: string; instancia?: InstanciaSesion; estado?: string }, usuario: UserDocument) {
  const consulta: Record<string, unknown> = {
    ...(filtros.academic_year_id ? { academic_year_id: filtros.academic_year_id } : {}),
    ...(filtros.instancia ? { instancia: filtros.instancia } : {}),
    ...(filtros.estado ? { estado: filtros.estado } : {}),
  };
  if (usuario.rol !== ROLES.ADMIN && usuario.rol !== ROLES.COORDINADOR) consulta['miembros.user_id'] = usuario._id;
  return SesionComision.find(consulta).sort({ fecha: -1, createdAt: -1 }).select('-miembros.firma -casos -compromisos -desarrollo -conclusiones -orden_del_dia');
}

export async function obtenerSesion(id: string, usuario: UserDocument) {
  return cargarVisible(id, usuario);
}

// --- Crear y editar ---

export interface EntradaMiembro {
  user_id?: string | null;
  nombre?: string;
  cargo: string;
  representa?: Representacion;
  es_presidente?: boolean;
}

async function armarMiembros(entrada: EntradaMiembro[]) {
  if (entrada.filter((m) => m.es_presidente).length > 1) throw new ApiError(400, 'Solo un integrante puede presidir.');
  const usuarios = await User.find({ _id: { $in: entrada.map((m) => m.user_id).filter(Boolean) } }).select('nombre apellido');
  const nombre = new Map(usuarios.map((u) => [String(u._id), `${u.nombre} ${u.apellido}`]));
  return entrada.map((m) => {
    const propio = m.user_id ? nombre.get(m.user_id) : undefined;
    if (m.user_id && !propio) throw new ApiError(400, 'Uno de los integrantes no es un usuario del sistema.');
    const etiqueta = propio ?? m.nombre?.trim();
    if (!etiqueta) throw new ApiError(400, 'Cada integrante sin usuario necesita su nombre.');
    return { user_id: m.user_id ?? null, nombre: etiqueta, cargo: m.cargo, representa: m.representa ?? 'OTRO', es_presidente: Boolean(m.es_presidente), asistio: false, firma: null };
  });
}

export interface EntradaSesion {
  instancia: InstanciaSesion;
  academic_year_id: string;
  periodo_numero?: number | null;
  grados_ids?: string[];
  fecha: string | Date;
  hora?: string;
  lugar?: string;
  orden_del_dia?: string;
  miembros: EntradaMiembro[];
}

export async function crearSesion(e: EntradaSesion, usuario: UserDocument, ip?: string | null) {
  exigirGestion(usuario, e.instancia);
  await asegurarAnioNoCerrado(e.academic_year_id);
  const anio = await cargarAnio(e.academic_year_id);
  if (e.periodo_numero && !anio.periodos.some((p) => p.numero === e.periodo_numero)) throw new ApiError(400, `El año ${anio.year} no tiene periodo ${e.periodo_numero}.`);
  const sesion = await SesionComision.create({
    instancia: e.instancia,
    academic_year_id: anio._id,
    anio: anio.year,
    alcance: { periodo_numero: e.periodo_numero ?? null, grados_ids: e.grados_ids ?? [] },
    fecha: new Date(e.fecha),
    hora: e.hora ?? '',
    lugar: e.lugar ?? '',
    orden_del_dia: e.orden_del_dia ?? '',
    miembros: await armarMiembros(e.miembros),
    creado_por: usuario._id,
  });
  await registrarEvento({ usuario_id: usuario._id, accion: 'COMISION_SESION_CREADA', entidad: 'SesionComision', entidad_id: sesion._id, detalle: `${e.instancia}, año ${anio.year}`, ip });
  return sesion;
}

export interface CambiosSesion {
  fecha?: string | Date;
  hora?: string;
  lugar?: string;
  orden_del_dia?: string;
  desarrollo?: string;
  conclusiones?: string;
  miembros?: EntradaMiembro[];
  asistencia?: Array<{ miembro_id: string; asistio: boolean }>;
}

export async function actualizarSesion(id: string, c: CambiosSesion, usuario: UserDocument) {
  const sesion = await cargarSesion(id);
  exigirGestion(usuario, sesion.instancia);
  exigirAbierta(sesion);
  if (c.miembros) {
    if (sesion.estado !== 'BORRADOR') throw new ApiError(409, 'Los integrantes se cambian antes de convocar.');
    sesion.set('miembros', await armarMiembros(c.miembros));
  }
  if (c.fecha) sesion.fecha = new Date(c.fecha);
  for (const campo of ['hora', 'lugar', 'orden_del_dia', 'desarrollo', 'conclusiones'] as const) if (c[campo] !== undefined) sesion[campo] = c[campo] as string;
  for (const a of c.asistencia ?? []) {
    const m = sesion.miembros.id(a.miembro_id);
    if (!m) throw new ApiError(400, 'Un integrante de la asistencia no pertenece a la sesión.');
    m.asistio = a.asistio;
  }
  await sesion.save();
  return sesion;
}

export async function convocar(id: string, usuario: UserDocument, ip?: string | null) {
  const sesion = await cargarSesion(id);
  exigirGestion(usuario, sesion.instancia);
  exigirAbierta(sesion, ['BORRADOR']);
  if (sesion.miembros.length === 0) throw new ApiError(409, 'Registra los integrantes antes de convocar.');
  if (!sesion.orden_del_dia.trim()) throw new ApiError(409, 'Escribe el orden del día antes de convocar.');
  sesion.estado = 'CONVOCADA';
  sesion.convocada_at = new Date();
  await sesion.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'COMISION_SESION_CONVOCADA', entidad: 'SesionComision', entidad_id: sesion._id, ip });
  await avisarSesionConvocada(sesion);
  return sesion;
}

// --- Casos ---

export async function agregarCaso(id: string, entrada: { student_id: string; tipo: TipoCaso; promocion_anticipada_id?: string }, usuario: UserDocument) {
  const sesion = await cargarSesion(id);
  exigirGestion(usuario, sesion.instancia);
  exigirAbierta(sesion);
  if (sesion.casos.some((c) => String(c.student_id) === entrada.student_id && c.tipo === entrada.tipo)) throw new ApiError(409, 'Ese estudiante ya está en la sesión.');

  const matricula = await Enrollment.findOne({ student_id: entrada.student_id, academic_year_id: sesion.academic_year_id, estado: { $in: ESTADOS_MATRICULA_ACTIVOS } });
  if (!matricula) throw new ApiError(404, 'El estudiante no tiene matrícula activa en el año de la sesión.');
  const grupo = await Group.findById(matricula.group_id).select('grade_id');
  if (sesion.alcance.grados_ids.length > 0 && !sesion.alcance.grados_ids.some((g) => String(g) === String(grupo?.grade_id))) {
    throw new ApiError(409, 'El grado del estudiante no está dentro del alcance de la sesión.');
  }
  let evaluacionId: Types.ObjectId | null = null;
  if (entrada.tipo === 'PROMOCION') {
    const cierre = await EvaluacionPromocion.findOne({ academic_year_id: sesion.academic_year_id, student_id: entrada.student_id, vigente: true }).select('_id');
    if (!cierre) throw new ApiError(409, 'El estudiante aún no tiene cierre de promoción (M19): primero se cierra su grupo.');
    evaluacionId = cierre._id;
  }
  let anticipadaId: Types.ObjectId | null = null;
  if (entrada.tipo === 'PROMOCION_ANTICIPADA') {
    if (!entrada.promocion_anticipada_id) throw new ApiError(400, 'Indica el trámite de promoción anticipada que se trata.');
    const tramite = await puedeTratarseEn(entrada.promocion_anticipada_id, sesion.instancia);
    if (String(tramite.student_id) !== entrada.student_id || String(tramite.academic_year_id) !== String(sesion.academic_year_id)) {
      throw new ApiError(409, 'El trámite no corresponde a ese estudiante o a ese año lectivo.');
    }
    anticipadaId = tramite._id;
  }

  // Conflicto de interés automático: quien es acudiente del estudiante, o el propio estudiante, no delibera ni vota su caso.
  const vinculos = await StudentGuardian.find({ student_id: entrada.student_id }).select('guardian_id');
  const acudientes = await Guardian.find({ _id: { $in: vinculos.map((v) => v.guardian_id) } }).select('user_id');
  const apartados = new Set([entrada.student_id, ...acudientes.map((a) => String(a.user_id ?? ''))].filter(Boolean));
  const recusados = sesion.miembros.filter((m) => m.user_id && apartados.has(String(m.user_id))).map((m) => m._id);

  sesion.casos.push({ student_id: entrada.student_id, enrollment_id: matricula._id, tipo: entrada.tipo, evaluacion_id: evaluacionId, anticipada_id: anticipadaId, recusados_ids: recusados } as unknown as ICasoSesion);
  await sesion.save();
  return sesion;
}

export interface CambiosCaso {
  deliberacion?: string;
  recusados_ids?: string[];
  votos?: Array<{ miembro_id: string; voto: Voto }>;
  decision?: { tipo: DecisionDeCaso; fundamento?: string } | null;
}

export async function actualizarCaso(id: string, casoId: string, c: CambiosCaso, usuario: UserDocument) {
  const sesion = await cargarSesion(id);
  exigirGestion(usuario, sesion.instancia);
  exigirAbierta(sesion);
  const caso = sesion.casos.id(casoId);
  if (!caso) throw new ApiError(404, 'Caso no encontrado en la sesión.');
  const esMiembroDeLaSesion = (mid: string) => sesion.miembros.some((m) => String(m._id) === mid);
  if (c.recusados_ids) {
    if (!c.recusados_ids.every(esMiembroDeLaSesion)) throw new ApiError(400, 'Un integrante recusado no pertenece a la sesión.');
    // Quien la ley o el sistema ya apartó no se reincorpora a mano: solo se pueden sumar apartados.
    const automaticos = caso.recusados_ids.map(String);
    caso.recusados_ids = [...new Set([...automaticos, ...c.recusados_ids])].map((x) => new Types.ObjectId(x));
  }
  if (c.deliberacion !== undefined) caso.deliberacion = c.deliberacion;
  if (c.votos) {
    if (!c.votos.every((v) => esMiembroDeLaSesion(v.miembro_id))) throw new ApiError(400, 'Un voto es de alguien que no integra la sesión.');
    if (new Set(c.votos.map((v) => v.miembro_id)).size !== c.votos.length) throw new ApiError(400, 'Cada integrante vota una sola vez por caso.');
    if (c.votos.some((v) => caso.recusados_ids.some((r) => String(r) === v.miembro_id))) throw new ApiError(409, 'Un integrante apartado del caso no puede votarlo.');
    caso.set('votos', c.votos.map((v) => ({ miembro_id: new Types.ObjectId(v.miembro_id), voto: v.voto })));
  }
  if (c.decision !== undefined) {
    if (c.decision) {
      const validas: readonly string[] = caso.tipo === 'PROMOCION' ? DECISIONES_CASO : caso.tipo === 'PROMOCION_ANTICIPADA' ? decisionesValidasEn(sesion.instancia) : [];
      if (validas.length === 0) throw new ApiError(400, 'Solo un caso de promoción lleva decisión; el de seguimiento se resuelve con compromisos.');
      if (!validas.includes(c.decision.tipo)) throw new ApiError(400, caso.tipo === 'PROMOCION_ANTICIPADA' ? `Esta instancia decide con: ${validas.join(', ')}.` : 'Decisión no válida.');
    }
    caso.set('decision', c.decision ? { tipo: c.decision.tipo, fundamento: c.decision.fundamento ?? '' } : null);
  }
  await sesion.save();
  return sesion;
}

export async function quitarCaso(id: string, casoId: string, usuario: UserDocument) {
  const sesion = await cargarSesion(id);
  exigirGestion(usuario, sesion.instancia);
  exigirAbierta(sesion);
  const caso = sesion.casos.id(casoId);
  if (!caso) throw new ApiError(404, 'Caso no encontrado en la sesión.');
  sesion.set('compromisos', sesion.compromisos.filter((k) => String(k.caso_id) !== casoId));
  caso.deleteOne();
  await sesion.save();
  return sesion;
}

// --- Compromisos ---

export interface EntradaCompromiso {
  student_id: string;
  caso_id?: string | null;
  responsable_tipo: ResponsableCompromiso;
  responsable_user_id?: string | null;
  responsable_nombre?: string;
  descripcion: string;
  fecha_limite: string | Date;
}

export async function agregarCompromiso(id: string, e: EntradaCompromiso, usuario: UserDocument) {
  const sesion = await cargarSesion(id);
  exigirGestion(usuario, sesion.instancia);
  exigirAbierta(sesion, ['BORRADOR', 'CONVOCADA', 'REALIZADA']);
  if (e.caso_id && !sesion.casos.id(e.caso_id)) throw new ApiError(400, 'El compromiso apunta a un caso que no está en la sesión.');
  if (!sesion.casos.some((c) => String(c.student_id) === e.student_id)) throw new ApiError(400, 'El compromiso es de un estudiante que no se trató en la sesión.');
  const limite = new Date(e.fecha_limite);
  if (limite.getTime() < sesion.fecha.getTime()) throw new ApiError(400, 'La fecha límite no puede ser anterior a la sesión.');
  const responsable = e.responsable_user_id ? await User.findById(e.responsable_user_id).select('nombre apellido') : null;
  const nombre = responsable ? `${responsable.nombre} ${responsable.apellido}` : e.responsable_nombre?.trim();
  if (!nombre) throw new ApiError(400, 'Indica quién responde por el compromiso.');
  sesion.compromisos.push({
    caso_id: e.caso_id ? new Types.ObjectId(e.caso_id) : null,
    student_id: new Types.ObjectId(e.student_id),
    responsable_tipo: e.responsable_tipo,
    responsable_user_id: responsable?._id ?? null,
    responsable_nombre: nombre,
    descripcion: e.descripcion,
    fecha_limite: limite,
    estado: 'PENDIENTE',
    seguimientos: [],
  } as never);
  await sesion.save();
  return sesion;
}

/** El seguimiento del compromiso sigue después de firmada el acta: lo hace coordinación o quien responde por él. */
export async function actualizarCompromiso(id: string, compromisoId: string, c: { estado?: EstadoCompromiso; seguimiento?: string }, usuario: UserDocument) {
  const sesion = await cargarVisible(id, usuario);
  const compromiso = sesion.compromisos.id(compromisoId);
  if (!compromiso) throw new ApiError(404, 'Compromiso no encontrado.');
  const gestiona = usuario.rol === ROLES.ADMIN || usuario.rol === ROLES.COORDINADOR;
  if (!gestiona && String(compromiso.responsable_user_id) !== String(usuario._id)) throw new ApiError(403, 'Solo coordinación o quien responde por el compromiso le hace seguimiento.');
  if (sesion.estado === 'ANULADA') throw new ApiError(409, 'La sesión está anulada.');
  if (c.estado) {
    if (!gestiona) throw new ApiError(403, 'Solo coordinación marca un compromiso como cumplido o incumplido.');
    compromiso.estado = c.estado;
  }
  if (c.seguimiento?.trim()) compromiso.seguimientos.push({ fecha: new Date(), texto: c.seguimiento.trim(), por: usuario._id });
  await sesion.save();
  return sesion;
}

// --- Realizar y firmar ---

const asistentesDe = (s: SesionComisionDocument) => s.miembros.map((m) => ({ miembro_id: String(m._id), asistio: m.asistio }));

const paraFirma = (s: SesionComisionDocument): MiembroParaFirma[] =>
  s.miembros.map((m) => ({ miembro_id: String(m._id), asistio: m.asistio, es_presidente: m.es_presidente, tiene_usuario: Boolean(m.user_id), firmo: Boolean(m.firma) }));

/**
 * Cierra la deliberación: verifica el quórum de la sesión, y por cada caso el quórum sin los recusados y la votación. Una decisión sin quórum o
 * sin mayoría queda registrada pero NO se aplicará. No se realiza una sesión que nadie puede firmar con el sistema.
 */
export async function realizar(id: string, usuario: UserDocument, ip?: string | null) {
  const sesion = await cargarSesion(id);
  exigirGestion(usuario, sesion.instancia);
  exigirAbierta(sesion, ['CONVOCADA']);
  const config = datosDeConfiguracion(await obtenerConfiguracion());
  const quorum = quorumDeSesion(sesion.miembros, config.quorum_porcentaje);
  if (!quorum.alcanzado) throw new ApiError(409, `No hay quórum: asistieron ${quorum.presentes} de ${quorum.total_miembros} (se requiere ${config.quorum_porcentaje}%).`);
  if (!sesion.desarrollo.trim()) throw new ApiError(409, 'Escribe el desarrollo de la sesión antes de darla por realizada.');
  if (firmantesRequeridos(paraFirma(sesion), config.firmas_requeridas).length === 0) {
    throw new ApiError(409, 'Ningún asistente con usuario del sistema puede firmar el acta: marca la asistencia o ajusta quién preside.');
  }

  for (const caso of sesion.casos) {
    const recusados = caso.recusados_ids.map(String);
    const q = quorumDeCaso(asistentesDe(sesion), recusados, config.quorum_porcentaje);
    const habilitados = sesion.miembros.filter((m) => m.asistio && !recusados.includes(String(m._id))).map((m) => String(m._id));
    const v = contarVotos(caso.votos.map((x) => ({ miembro_id: String(x.miembro_id), voto: x.voto })), habilitados, config.mayoria);
    caso.resultado_votacion = { ...v, aprobada: v.aprobada && q.alcanzado, quorum: q.alcanzado };
  }
  sesion.quorum = quorum;
  sesion.estado = 'REALIZADA';
  await sesion.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'COMISION_SESION_REALIZADA', entidad: 'SesionComision', entidad_id: sesion._id, detalle: `${sesion.casos.length} casos`, ip });
  return sesion;
}

/** Lo que entra a la huella del acta: todo menos las firmas y el seguimiento de los compromisos (que sigue después). */
export function contenidoFirmable(s: SesionComisionDocument, codigo: string): unknown {
  return JSON.parse(
    JSON.stringify({
      codigo,
      instancia: s.instancia,
      academic_year_id: s.academic_year_id,
      anio: s.anio,
      alcance: s.alcance,
      fecha: s.fecha,
      hora: s.hora,
      lugar: s.lugar,
      orden_del_dia: s.orden_del_dia,
      miembros: s.miembros.map((m) => ({ id: m._id, user_id: m.user_id, nombre: m.nombre, cargo: m.cargo, representa: m.representa, es_presidente: m.es_presidente, asistio: m.asistio })),
      casos: s.casos.map((c) => ({ id: c._id, student_id: c.student_id, enrollment_id: c.enrollment_id, tipo: c.tipo, evaluacion_id: c.evaluacion_id, anticipada_id: c.anticipada_id ?? undefined, recusados_ids: c.recusados_ids, deliberacion: c.deliberacion, votos: c.votos, decision: c.decision, resultado_votacion: c.resultado_votacion })),
      compromisos: s.compromisos.map((k) => ({ id: k._id, caso_id: k.caso_id, student_id: k.student_id, responsable_tipo: k.responsable_tipo, responsable_user_id: k.responsable_user_id, responsable_nombre: k.responsable_nombre, descripcion: k.descripcion, fecha_limite: k.fecha_limite })),
      desarrollo: s.desarrollo,
      conclusiones: s.conclusiones,
      quorum: s.quorum,
    })
  );
}

/**
 * Firma de un integrante con su contraseña. Cuando firman todos los requeridos (según la configuración) el acta queda FIRMADA: recibe su
 * consecutivo anual (`ACE-2026-001`) y su huella SHA-256, y las decisiones aprobadas pasan a M19 como versiones nuevas del cierre.
 * Es una confirmación con contraseña, no una firma electrónica certificada (Ley 527/1999).
 */
export async function firmar(id: string, contrasena: string, usuario: UserDocument, ip?: string | null) {
  const sesion = await cargarVisible(id, usuario);
  exigirAbierta(sesion, ['REALIZADA']);
  const miembro = sesion.miembros.find((m) => m.user_id && String(m.user_id) === String(usuario._id));
  if (!miembro || !miembro.asistio) throw new ApiError(403, 'Solo firma quien integra la sesión y asistió.');
  if (miembro.firma) throw new ApiError(409, 'Ya firmaste esta acta.');
  const conClave = await User.findById(usuario._id).select('+password_hash');
  if (!conClave || !(await conClave.comparePassword(contrasena))) throw new ApiError(401, 'Contraseña incorrecta.');

  miembro.firma = { fecha: new Date() };
  const config = datosDeConfiguracion(await obtenerConfiguracion());
  if (!actaCompleta(paraFirma(sesion), config.firmas_requeridas)) {
    await sesion.save();
    return sesion;
  }

  const aplicadas: string[] = [];
  const firmada = await runTransaction(async (session) => {
    const prefijo = PREFIJO_ACTA[sesion.instancia];
    const contador = await Counter.findByIdAndUpdate(`ACTA-${prefijo}-${sesion.anio}`, { $inc: { seq: 1 } }, { new: true, upsert: true, session });
    const consecutivo = contador?.seq ?? 1;
    sesion.codigo = `${prefijo}-${sesion.anio}-${String(consecutivo).padStart(3, '0')}`;
    sesion.consecutivo = consecutivo;
    sesion.hash = hashDeActa(contenidoFirmable(sesion, sesion.codigo));
    sesion.estado = 'FIRMADA';
    sesion.firmada_at = new Date();
    await sesion.save({ session });

    aplicadas.length = 0;
    for (const caso of sesion.casos) {
      if (!caso.decision || !caso.resultado_votacion?.aprobada) continue;
      if (caso.tipo === 'PROMOCION_ANTICIPADA' && caso.anticipada_id && sesion.instancia !== 'CONSEJO_ACADEMICO') {
        // Lo que la mayoría decidió pasa al trámite: recomendar/aprobar lo adelanta; no recomendar/no aprobar lo rechaza.
        await registrarDecisionDeSesion(
          { tramiteId: String(caso.anticipada_id), instancia: sesion.instancia, aprobada: caso.decision.tipo === 'RECOMENDAR_ANTICIPADA' || caso.decision.tipo === 'APROBAR_ANTICIPADA', sesionId: String(sesion._id), codigoActa: sesion.codigo },
          session
        );
        continue;
      }
      if (caso.tipo !== 'PROMOCION') continue;
      const nueva = await aplicarDecisionDeInstancia(
        {
          anioId: String(sesion.academic_year_id),
          studentId: String(caso.student_id),
          resultado: RESULTADO_DE_DECISION[caso.decision.tipo as DecisionCaso],
          sesionId: String(sesion._id),
          codigoActa: sesion.codigo,
          instancia: NOMBRES_INSTANCIA[sesion.instancia],
          fundamento: caso.decision.fundamento,
        },
        usuario,
        session
      );
      aplicadas.push(String(nueva.enrollment_id));
    }
    return sesion;
  });
  // La titulación depende del resultado del cierre: se reevalúa fuera de la transacción (nunca rompe la firma).
  await evaluarTitulacionDeMatriculas(aplicadas, usuario);
  await registrarEvento({ usuario_id: usuario._id, accion: 'COMISION_SESION_FIRMADA', entidad: 'SesionComision', entidad_id: firmada._id, detalle: `${firmada.codigo}; ${aplicadas.length} decisión(es) aplicada(s) a M19`, ip });
  return firmada;
}

export async function anular(id: string, motivo: string, usuario: UserDocument, ip?: string | null) {
  if (usuario.rol !== ROLES.ADMIN) throw new ApiError(403, 'Solo el administrador anula una sesión.');
  const sesion = await cargarSesion(id);
  exigirAbierta(sesion, ['BORRADOR', 'CONVOCADA', 'REALIZADA']);
  sesion.estado = 'ANULADA';
  sesion.anulacion = { motivo, por: usuario._id, fecha: new Date() };
  await sesion.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'COMISION_SESION_ANULADA', entidad: 'SesionComision', entidad_id: sesion._id, ip });
  return sesion;
}

/** Recalcula la huella de un acta firmada: un cambio hecho directo en la base la delata. */
export async function verificarIntegridad(id: string, usuario: UserDocument): Promise<{ integra: boolean }> {
  const sesion = await cargarVisible(id, usuario);
  if (sesion.estado !== 'FIRMADA' || !sesion.codigo || !sesion.hash) throw new ApiError(409, 'Solo un acta firmada tiene huella.');
  return { integra: hashDeActa(contenidoFirmable(sesion, sesion.codigo)) === sesion.hash };
}

/** El detalle de la sesión para la pantalla: el documento más los nombres de los estudiantes de sus casos y compromisos (la sesión solo guarda sus ids). */
export async function detalleDeSesion(id: string, usuario: UserDocument) {
  const sesion = await cargarVisible(id, usuario);
  const ids = [...new Set([...sesion.casos.map((c) => String(c.student_id)), ...sesion.compromisos.map((k) => String(k.student_id))])];
  const usuarios = await User.find({ _id: { $in: ids } }).select('nombre apellido numero_documento');
  const estudiantes = Object.fromEntries(usuarios.map((u) => [String(u._id), { nombre: u.nombre, apellido: u.apellido, numero_documento: u.numero_documento }]));
  return { ...sesion.toObject(), estudiantes };
}
