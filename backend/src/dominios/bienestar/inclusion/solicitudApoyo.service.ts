import { ClientSession, Types } from 'mongoose';
import { EstadoSolicitudApoyo, OrigenSolicitudApoyo, ResultadoSolicitudApoyo } from './inclusion.constants';
import { ROLES } from '../../../constants/roles';
import Group from '../../institucional/estructura/group.model';
import SolicitudApoyo, { SolicitudApoyoDocument } from './solicitudApoyo.model';
import { User, UserDocument } from '../../../models/user.model';
import ApiError from '../../../utils/ApiError';
import { alcanceDeInclusion, ROLES_BANDEJA_INCLUSION } from './permisosInclusion';
import runTransaction from '../../../utils/runTransaction';
import Enrollment from '../../../models/enrollment.model';
import { registrarEvento } from '../../../services/audit.service';
import { abrirExpediente } from './expedienteInclusion.service';
import { anioEnCurso, cargarContextoEstudiante, comoUsuarioInclusion, exigirPermiso } from './inclusionContexto.service';
import { enAlcanceDeSede } from '../comun/permisosConvivencia';

const NO_ENCONTRADA = 'Solicitud no encontrada.';
const ROLES_ORIENTACION: string[] = [ROLES.ADMIN, ROLES.ORIENTADOR];

export interface CrearSolicitudInput {
  student_id: string;
  motivo_declarado: string;
  observacion?: string;
}

const traducirDuplicado = (err: unknown): never => {
  if ((err as { code?: number }).code === 11000) throw new ApiError(409, 'Ya hay una solicitud de apoyo abierta para este estudiante en el año lectivo.');
  throw err;
};

/**
 * Un docente (que dicta clase o dirige el grupo) o personal autorizado reporta una necesidad de apoyo. Va con hechos
 * observados, sin diagnosticar ni rotular al estudiante: la valoración es de orientación.
 */
export async function crearSolicitud(input: CrearSolicitudInput, usuario: UserDocument, ip?: string | null): Promise<SolicitudApoyoDocument> {
  const anio = await anioEnCurso();
  const ctx = exigirPermiso(usuario, await cargarContextoEstudiante(usuario, input.student_id, anio._id), 'CREAR_SOLICITUD');
  if (!ctx.vigente) throw new ApiError(409, 'El estudiante no tiene una matrícula activa en el año en curso.');

  let solicitud: SolicitudApoyoDocument;
  try {
    solicitud = await SolicitudApoyo.create({
      student_id: input.student_id,
      academic_year_id: anio._id,
      sede_id: ctx.grupo.sede_id,
      origen: usuario.rol === ROLES.DOCENTE ? 'DOCENTE' : 'DIRECTO',
      motivo_declarado: input.motivo_declarado,
      observacion: input.observacion ?? '',
      solicitada_por: usuario._id,
    });
  } catch (err) {
    return traducirDuplicado(err);
  }
  await registrarEvento({ usuario_id: usuario._id, accion: 'INCLUSION_SOLICITUD_CREADA', entidad: 'SolicitudApoyo', entidad_id: solicitud._id, detalle: solicitud.origen, ip });
  return solicitud;
}

export interface SolicitudDesdeMatricula {
  student_id: Types.ObjectId | string;
  academic_year_id: Types.ObjectId | string;
  group_id: Types.ObjectId | string;
  origen: Extract<OrigenSolicitudApoyo, 'MATRICULA' | 'PREINSCRIPCION'>;
  motivo_declarado: string;
  aporta_soporte: boolean;
  observacion?: string;
  solicitada_por?: Types.ObjectId | string | null;
}

/**
 * Traspaso desde M04 (cambio mínimo en matrícula/preinscripción): lo declarado por la familia queda en la bandeja de orientación,
 * dentro de la misma transacción de la matrícula. Secretaría no valora ni rotula: solo transcribe. Idempotente si ya hay una abierta.
 */
export async function crearDesdeMatricula(input: SolicitudDesdeMatricula, session: ClientSession): Promise<void> {
  const grupo = await Group.findById(input.group_id).session(session);
  if (!grupo) throw new ApiError(404, 'Grupo no encontrado.');
  const abierta = await SolicitudApoyo.exists({
    student_id: input.student_id,
    academic_year_id: input.academic_year_id,
    estado: { $in: ['PENDIENTE', 'EN_VALORACION'] },
  }).session(session);
  if (abierta) return;
  await SolicitudApoyo.create(
    [
      {
        student_id: input.student_id,
        academic_year_id: input.academic_year_id,
        sede_id: grupo.sede_id,
        origen: input.origen,
        motivo_declarado: input.motivo_declarado,
        aporta_soporte: input.aporta_soporte,
        observacion: input.observacion ?? '',
        solicitada_por: input.solicitada_por ?? null,
      },
    ],
    { session }
  );
}

async function vistaSolicitudes(solicitudes: SolicitudApoyoDocument[], verContenido: boolean) {
  const personasIds = [...new Set(solicitudes.flatMap((s) => [String(s.student_id), ...(s.solicitada_por ? [String(s.solicitada_por)] : [])]))];
  const personas = await User.find({ _id: { $in: personasIds } }).select('nombre apellido numero_documento');
  const persona = new Map(personas.map((p) => [String(p._id), p]));
  const matriculas = await Enrollment.find({ student_id: { $in: solicitudes.map((s) => s.student_id) }, academic_year_id: { $in: solicitudes.map((s) => s.academic_year_id) } }).select('student_id group_id');
  const grupos = await Group.find({ _id: { $in: matriculas.map((m) => m.group_id) } }).select('nomenclatura');
  const nomenclatura = new Map(grupos.map((g) => [String(g._id), g.nomenclatura]));
  const grupoDe = new Map(matriculas.map((m) => [String(m.student_id), nomenclatura.get(String(m.group_id)) ?? '']));

  return solicitudes.map((s) => {
    const estudiante = persona.get(String(s.student_id));
    const reporta = s.solicitada_por ? persona.get(String(s.solicitada_por)) : null;
    return {
      _id: String(s._id),
      estado: s.estado,
      origen: s.origen,
      estudiante: { student_id: String(s.student_id), nombre: estudiante?.nombre ?? '', apellido: estudiante?.apellido ?? '', numero_documento: estudiante?.numero_documento ?? '' },
      grupo: grupoDe.get(String(s.student_id)) ?? '',
      // Coordinación ve la fila (que existe y en qué va), no lo declarado por la familia ni lo observado.
      ...(verContenido ? { motivo_declarado: s.motivo_declarado, observacion: s.observacion, aporta_soporte: s.aporta_soporte } : {}),
      solicitada_por: reporta ? `${reporta.nombre} ${reporta.apellido}` : null,
      resolucion: s.resolucion ? { resultado: s.resolucion.resultado, fecha: s.resolucion.fecha, ...(verContenido ? { motivo: s.resolucion.motivo } : {}) } : null,
      expediente_id: s.expediente_id ? String(s.expediente_id) : null,
      createdAt: s.createdAt,
    };
  });
}

/** Vista de una sola solicitud ya cargada. */
async function vistaDe(solicitud: SolicitudApoyoDocument) {
  const [vista] = await vistaSolicitudes([solicitud], true);
  return vista as NonNullable<typeof vista>;
}

export async function bandejaDeSolicitudes(
  usuario: UserDocument,
  { estado, pagina, limite }: { estado?: EstadoSolicitudApoyo; pagina: number; limite: number },
  ip?: string | null
) {
  if (!ROLES_BANDEJA_INCLUSION.includes(usuario.rol)) throw new ApiError(403, 'No tienes acceso a la bandeja de inclusión.');
  const alcance = alcanceDeInclusion(comoUsuarioInclusion(usuario));
  const filtro: Record<string, unknown> = {};
  if (alcance !== 'TODAS') filtro.sede_id = { $in: alcance };
  filtro.estado = estado ?? { $in: ['PENDIENTE', 'EN_VALORACION'] };
  const [total, datos] = await Promise.all([
    SolicitudApoyo.countDocuments(filtro),
    SolicitudApoyo.find(filtro)
      .sort({ createdAt: -1 })
      .skip((pagina - 1) * limite)
      .limit(limite),
  ]);
  await registrarEvento({ usuario_id: usuario._id, accion: 'INCLUSION_BANDEJA_CONSULTADA', entidad: 'SolicitudApoyo', detalle: `${datos.length} solicitud(es)`, ip });
  return { total, pagina, limite, data: await vistaSolicitudes(datos, ROLES_ORIENTACION.includes(usuario.rol)) };
}

/** El docente ve únicamente que su solicitud existe y en qué va; nunca el expediente ni lo que orientación resolvió. */
export async function misSolicitudes(usuario: UserDocument) {
  const datos = await SolicitudApoyo.find({ solicitada_por: usuario._id }).sort({ createdAt: -1 }).limit(100);
  const personas = await User.find({ _id: { $in: datos.map((s) => s.student_id) } }).select('nombre apellido');
  const persona = new Map(personas.map((p) => [String(p._id), p]));
  return datos.map((s) => ({
    _id: String(s._id),
    estado: s.estado,
    estudiante: `${persona.get(String(s.student_id))?.nombre ?? ''} ${persona.get(String(s.student_id))?.apellido ?? ''}`.trim(),
    createdAt: s.createdAt,
  }));
}

async function cargarParaOrientacion(id: string, usuario: UserDocument): Promise<SolicitudApoyoDocument> {
  const solicitud = Types.ObjectId.isValid(id) ? await SolicitudApoyo.findById(id) : null;
  const permitido = solicitud && ROLES_ORIENTACION.includes(usuario.rol) && enAlcanceDeSede(comoUsuarioInclusion(usuario), String(solicitud.sede_id));
  if (!solicitud || !permitido) throw new ApiError(404, NO_ENCONTRADA);
  return solicitud;
}

/** Orientación toma la solicitud (entrevista a la familia, valoración pedagógica). */
export async function valorarSolicitud(id: string, usuario: UserDocument, ip?: string | null) {
  const solicitud = await cargarParaOrientacion(id, usuario);
  if (solicitud.estado !== 'PENDIENTE') throw new ApiError(409, 'La solicitud ya está en valoración o fue atendida.');
  solicitud.estado = 'EN_VALORACION';
  solicitud.valoracion = { por: usuario._id, fecha: new Date() };
  await solicitud.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'INCLUSION_SOLICITUD_RESUELTA', entidad: 'SolicitudApoyo', entidad_id: solicitud._id, detalle: 'EN_VALORACION', ip });
  return vistaDe(solicitud);
}

export interface ResolverSolicitudInput {
  resultado: ResultadoSolicitudApoyo;
  motivo: string;
  copiar_anterior?: boolean;
}

/**
 * Cierra la valoración con una decisión y su motivo. ABRIR_PIAR / PLAN_APOYO crean el expediente en la misma transacción; las demás
 * (seguimiento psicosocial —que ya existe en M14/M15—, ruta de salud, descartar) cierran la solicitud sin expediente.
 */
export async function resolverSolicitud(id: string, input: ResolverSolicitudInput, usuario: UserDocument, ip?: string | null) {
  const solicitud = await cargarParaOrientacion(id, usuario);
  if (solicitud.estado === 'CONVERTIDA' || solicitud.estado === 'DESCARTADA') throw new ApiError(409, 'La solicitud ya fue atendida.');
  if (solicitud.estado === 'PENDIENTE') throw new ApiError(409, 'Toma la solicitud (valoración) antes de resolverla.');

  const crea = input.resultado === 'ABRIR_PIAR' || input.resultado === 'PLAN_APOYO';
  await runTransaction(async (session) => {
    if (crea) {
      const exp = await abrirExpediente(
        { student_id: String(solicitud.student_id), tipo: input.resultado === 'ABRIR_PIAR' ? 'PIAR' : 'PLAN_APOYO', solicitud_id: String(solicitud._id), copiar_anterior: input.copiar_anterior },
        usuario,
        ip,
        session
      );
      solicitud.estado = 'CONVERTIDA';
      solicitud.expediente_id = exp._id;
    } else {
      solicitud.estado = 'DESCARTADA';
    }
    solicitud.resolucion = { por: usuario._id, fecha: new Date(), resultado: input.resultado, motivo: input.motivo.trim() };
    await solicitud.save({ session });
  });
  await registrarEvento({ usuario_id: usuario._id, accion: 'INCLUSION_SOLICITUD_RESUELTA', entidad: 'SolicitudApoyo', entidad_id: solicitud._id, detalle: input.resultado, ip });
  return vistaDe(solicitud);
}

