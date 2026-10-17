import { ClientSession, Types } from 'mongoose';
import { DEPENDENCIAS_PAZ_Y_SALVO_INICIALES } from '../constants/certificados';
import { ESTADOS_MATRICULA_ACTIVOS } from '../constants/enums';
import { AccionPazYSalvoSalida, EstadoPazYSalvoSalida } from '../constants/salidas';
import { AccionAuditoria } from '../models/auditLog.model';
import ConfiguracionCertificados from '../models/configuracionCertificados.model';
import Enrollment from '../models/enrollment.model';
import PazYSalvoSalida, { IDependenciaSalida, PazYSalvoSalidaDocument } from '../models/pazYSalvoSalida.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { runTransaction } from '../utils/runTransaction';
import { estadoGlobalDePazYSalvo, resolverAccionDependencia } from '../utils/salidas';
import { registrarEvento } from './audit.service';
import { liberarCupoDeSalida, politicaDeCupo } from './salidaCupo.service';

/**
 * Paz y salvo previo a los documentos de salida de quien se retira o se traslada (M26 sobre M04). Las dependencias que se verifican son
 * las que el colegio configuró para el paz y salvo (`ConfiguracionCertificados.paz_y_salvo`, ADMIN en «Firmas y sellos»): aquí se copian al abrirlo,
 * así renombrar o desactivar una después no reescribe lo que ya se verificó.
 */

const AUDITORIA: Record<Exclude<AccionPazYSalvoSalida, 'APERTURA'>, AccionAuditoria> = {
  APROBACION: 'PAZ_Y_SALVO_SALIDA_APROBADO',
  BLOQUEO: 'PAZ_Y_SALVO_SALIDA_BLOQUEADO',
  EXCEPCION: 'PAZ_Y_SALVO_SALIDA_EXCEPCION',
  ANULACION: 'PAZ_Y_SALVO_SALIDA_ANULADO',
};

/** Las dependencias activas hoy; sin configuración guardada rigen las de partida (lee, no crea). */
async function dependenciasActivas(): Promise<Array<{ clave: string; nombre: string }>> {
  const config = await ConfiguracionCertificados.findOne().select('paz_y_salvo').lean();
  const lista = config?.paz_y_salvo?.dependencias ?? DEPENDENCIAS_PAZ_Y_SALVO_INICIALES;
  return lista.filter((d) => d.activa).map((d) => ({ clave: d.clave, nombre: d.nombre }));
}

/**
 * Abre el paz y salvo de una salida con una línea PENDIENTE por dependencia activa. Si el colegio no activó ninguna no hay nada que verificar
 * y no se crea (el paz y salvo se considera aprobado). Va dentro de la transacción de la salida.
 */
export async function abrirPazYSalvoDeSalida(
  enrollment: { _id: Types.ObjectId; student_id: Types.ObjectId; academic_year_id: Types.ObjectId },
  actorId: Types.ObjectId | string,
  session: ClientSession
): Promise<PazYSalvoSalidaDocument | null> {
  const dependencias = await dependenciasActivas();
  if (dependencias.length === 0) return null;
  const ahora = new Date();
  const [creado] = await PazYSalvoSalida.create(
    [
      {
        enrollment_id: enrollment._id,
        student_id: enrollment.student_id,
        academic_year_id: enrollment.academic_year_id,
        dependencias: dependencias.map((d) => ({
          clave: d.clave,
          nombre: d.nombre,
          estado: 'PENDIENTE',
          historial: [{ accion: 'APERTURA', estado_resultante: 'PENDIENTE', por: new Types.ObjectId(String(actorId)), fecha: ahora, motivo: '' }],
        })),
      },
    ],
    { session }
  );
  return creado ?? null;
}

export interface DependenciaVista {
  clave: string;
  nombre: string;
  estado: EstadoPazYSalvoSalida;
  detalle: string;
  excepcion: { autorizada_por: string; fecha: Date; motivo: string } | null;
  revisado_por: string | null;
  fecha_revision: Date | null;
  historial: Array<{ accion: AccionPazYSalvoSalida; estado_resultante: EstadoPazYSalvoSalida; por: string | null; fecha: Date; motivo: string }>;
}

export interface PazYSalvoSalidaVista {
  estado: EstadoPazYSalvoSalida;
  /** Sin dependencias activas al registrar la salida no hubo nada que verificar. */
  sin_dependencias: boolean;
  dependencias: DependenciaVista[];
}

async function nombresDe(ids: Array<Types.ObjectId | null | undefined>): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((i): i is Types.ObjectId => Boolean(i)).map(String))];
  if (unicos.length === 0) return new Map();
  const usuarios = await User.find({ _id: { $in: unicos } }).select('nombre apellido').lean();
  return new Map(usuarios.map((u) => [String(u._id), `${u.nombre} ${u.apellido}`]));
}

export async function vistaPazYSalvoDeSalida(enrollmentId: Types.ObjectId | string): Promise<PazYSalvoSalidaVista> {
  const doc = await PazYSalvoSalida.findOne({ enrollment_id: enrollmentId }).lean();
  if (!doc) return { estado: 'APROBADO', sin_dependencias: true, dependencias: [] };
  const nombres = await nombresDe(doc.dependencias.flatMap((d) => [d.revisado_por, d.excepcion?.autorizada_por, ...d.historial.map((h) => h.por)]));
  const nombre = (id: Types.ObjectId | null | undefined) => (id ? nombres.get(String(id)) ?? null : null);
  return {
    estado: estadoGlobalDePazYSalvo(doc.dependencias),
    sin_dependencias: false,
    dependencias: doc.dependencias.map((d) => ({
      clave: d.clave,
      nombre: d.nombre,
      estado: d.estado,
      detalle: d.detalle,
      excepcion: d.excepcion ? { autorizada_por: nombre(d.excepcion.autorizada_por) ?? '', fecha: d.excepcion.fecha, motivo: d.excepcion.motivo } : null,
      revisado_por: nombre(d.revisado_por),
      fecha_revision: d.fecha_revision,
      historial: d.historial.map((h) => ({ accion: h.accion, estado_resultante: h.estado_resultante, por: nombre(h.por), fecha: h.fecha, motivo: h.motivo })),
    })),
  };
}

export interface ActuarSobreDependenciaInput {
  accion: Exclude<AccionPazYSalvoSalida, 'APERTURA'>;
  /** BLOQUEO: lo que se debe. EXCEPCION y ANULACION: el motivo. APROBACION: observación opcional. */
  motivo?: string;
}

/**
 * Aprueba, bloquea, autoriza una excepción o anula la aprobación de UNA dependencia. Todo deja una línea en su historial. Si la política del colegio
 * libera el cupo al aprobar el paz y salvo y este queda aprobado, el cupo se libera en la misma transacción.
 */
export async function actuarSobreDependencia(
  enrollmentId: string,
  clave: string,
  entrada: ActuarSobreDependenciaInput,
  usuario: UserDocument,
  ip?: string | null
): Promise<PazYSalvoSalidaVista> {
  const motivo = (entrada.motivo ?? '').trim();
  const liberoCupo = await runTransaction(async (session) => {
    const matricula = await Enrollment.findById(enrollmentId).session(session);
    if (!matricula?.salida) throw new ApiError(404, 'Esta matrícula no tiene una salida registrada.');
    const doc = await PazYSalvoSalida.findOne({ enrollment_id: matricula._id }).session(session);
    if (!doc) throw new ApiError(409, 'Esta salida no tiene dependencias por verificar: el paz y salvo ya está aprobado.');
    const dependencia = doc.dependencias.find((d) => d.clave === clave);
    if (!dependencia) throw new ApiError(404, 'La dependencia no existe en este paz y salvo.');

    const resultado = resolverAccionDependencia(dependencia.estado, { accion: entrada.accion, rol: usuario.rol, motivo });
    if ('error' in resultado) throw new ApiError(resultado.estatus, resultado.error);

    const ahora = new Date();
    dependencia.estado = resultado.estado;
    dependencia.revisado_por = usuario._id;
    dependencia.fecha_revision = ahora;
    if (entrada.accion === 'BLOQUEO') dependencia.detalle = motivo;
    if (resultado.estado === 'APROBADO' && !resultado.excepcion) dependencia.detalle = '';
    dependencia.excepcion = resultado.excepcion ? { autorizada_por: usuario._id, fecha: ahora, motivo } : null;
    dependencia.historial.push({ accion: entrada.accion, estado_resultante: resultado.estado, por: usuario._id, fecha: ahora, motivo } as IDependenciaSalida['historial'][number]);
    await doc.save({ session });

    const estadoGlobal = estadoGlobalDePazYSalvo(doc.dependencias);
    const politica = await politicaDeCupo(session);
    const libero = await liberarCupoDeSalida(matricula._id, matricula.group_id, politica, estadoGlobal, session);
    return libero;
  });

  await registrarEvento({
    usuario_id: usuario._id,
    accion: AUDITORIA[entrada.accion],
    entidad: 'PazYSalvoSalida',
    entidad_id: enrollmentId,
    // Nunca el texto de la deuda ni del motivo: solo qué dependencia.
    detalle: clave,
    ip,
  });
  if (liberoCupo) {
    await registrarEvento({ usuario_id: usuario._id, accion: 'SALIDA_CUPO_LIBERADO', entidad: 'Enrollment', entidad_id: enrollmentId, detalle: 'Al aprobarse el paz y salvo de salida', ip });
  }
  return vistaPazYSalvoDeSalida(enrollmentId);
}

/**
 * Compuerta de los documentos de salida (los tipos que encienden la fuente PAZ_Y_SALVO_SALIDA): con la matrícula retirada, no se expiden
 * mientras el paz y salvo de salida no esté aprobado. Una salida anterior a este módulo no tiene paz y salvo y no se bloquea.
 */
export async function exigirPazYSalvoDeSalidaAprobado(enrollmentId: Types.ObjectId | string, nombreDocumento: string): Promise<void> {
  const matricula = await Enrollment.findById(enrollmentId).select('estado').lean();
  if (!matricula || ESTADOS_MATRICULA_ACTIVOS.includes(matricula.estado) || matricula.estado === 'PREINSCRITO') return;
  const vista = await vistaPazYSalvoDeSalida(enrollmentId);
  if (vista.estado === 'APROBADO') return;
  const faltan = vista.dependencias.filter((d) => d.estado !== 'APROBADO').map((d) => `${d.nombre} (${d.estado === 'BLOQUEADO' ? 'bloqueada' : 'pendiente'})`);
  throw new ApiError(409, `«${nombreDocumento}» se expide con el paz y salvo de salida aprobado. Falta: ${faltan.join(', ')}.`);
}
