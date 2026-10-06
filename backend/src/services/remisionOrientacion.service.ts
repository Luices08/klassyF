import { ClientSession, Types } from 'mongoose';
import { EstadoRemisionOrientacion, OrigenRemisionOrientacion } from '../constants/convivencia';
import { ROLES } from '../constants/roles';
import { CasoConvivenciaDocument } from '../models/casoConvivencia.model';
import Group from '../models/group.model';
import RemisionOrientacion, { RemisionOrientacionDocument } from '../models/remisionOrientacion.model';
import { User, UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { alcanceDeSedes, enAlcanceDeSede } from '../utils/permisosConvivencia';
import { claveDeRemision, involucradosARemitir } from '../utils/remisionOrientacion';
import { fechaDeClase, hoyColombia } from '../utils/tiempo';
import { registrarEvento } from './audit.service';

const NO_ENCONTRADA = 'Remisión no encontrada.';
const ROLES_ORIENTACION: string[] = [ROLES.ADMIN, ROLES.ORIENTADOR];

const comoUsuarioConvivencia = (u: UserDocument) => ({ id: String(u._id), rol: u.rol, sedes_ids: u.sedes_ids.map(String) });

// --- Lo que hace convivencia (M15): crear la remisión ---

type OrigenAutomatico = { tipo: Exclude<OrigenRemisionOrientacion, 'MANUAL'>; id: string; nombre: string };

/**
 * Remite a orientación a los afectados y presuntos responsables del caso porque una medida o un paso del protocolo, marcados
 * por el colegio, se aplicó o se cumplió. Es idempotente (índice por clave): repetirlo no duplica. Devuelve cuántas creó.
 */
export async function remitirAutomaticamente(caso: CasoConvivenciaDocument, origen: OrigenAutomatico, usuario: UserDocument, session: ClientSession): Promise<number> {
  let creadas = 0;
  for (const i of involucradosARemitir(caso.involucrados)) {
    const clave = claveDeRemision(String(caso._id), String(i.student_id), origen.tipo, origen.id);
    const resultado = await RemisionOrientacion.updateOne(
      { clave },
      {
        $setOnInsert: {
          caso_id: caso._id,
          caso_codigo: caso.codigo,
          sede_id: caso.sede_id,
          tipo_situacion: caso.tipo_situacion,
          hechos: caso.hechos,
          student_id: i.student_id,
          group_id: i.group_id,
          rol: i.rol,
          origen: origen.tipo,
          origen_detalle: origen.nombre,
          estado: 'PENDIENTE',
          remitida_por: usuario._id,
          atenciones: [],
          atendida: null,
        },
      },
      { upsert: true, session }
    );
    if (resultado.upsertedCount) creadas++;
  }
  return creadas;
}

/** Convivencia remite a mano a estudiantes del caso. No se repite una remisión manual que todavía está en curso. */
export async function remitirManualmente(caso: CasoConvivenciaDocument, studentIds: string[], motivo: string, usuario: UserDocument, session: ClientSession): Promise<number> {
  const ids = [...new Set(studentIds)];
  const involucrados = ids.map((id) => caso.involucrados.find((i) => String(i.student_id) === id));
  if (involucrados.some((i) => !i)) throw new ApiError(400, 'Solo se remite a estudiantes involucrados en el caso.');

  const enCurso = await RemisionOrientacion.exists({ caso_id: caso._id, origen: 'MANUAL', student_id: { $in: ids }, estado: { $ne: 'ATENDIDA' } }).session(session);
  if (enCurso) throw new ApiError(409, 'Alguno de los estudiantes ya tiene una remisión manual en curso en este caso.');

  await RemisionOrientacion.create(
    involucrados.map((i) => ({
      caso_id: caso._id,
      caso_codigo: caso.codigo,
      sede_id: caso.sede_id,
      tipo_situacion: caso.tipo_situacion,
      hechos: caso.hechos,
      student_id: i!.student_id,
      group_id: i!.group_id,
      rol: i!.rol,
      origen: 'MANUAL',
      origen_detalle: motivo.trim(),
      remitida_por: usuario._id,
    })),
    { session, ordered: true }
  );
  return ids.length;
}

export const auditarRemisionesCreadas = (usuario: UserDocument, caso: CasoConvivenciaDocument, cantidad: number, detalle: string, ip?: string | null) =>
  registrarEvento({
    usuario_id: usuario._id,
    accion: 'ORIENTACION_REMISION_CREADA',
    entidad: 'CasoConvivencia',
    entidad_id: caso._id,
    detalle: `${cantidad} remisión(es) a orientación: ${detalle}`,
    ip,
  });

/** Lo que convivencia ve de las remisiones de su caso: quién, por qué, en qué estado. Nunca lo que orientación escribió. */
export async function resumenDeRemisionesDelCaso(casoId: Types.ObjectId) {
  const remisiones = await RemisionOrientacion.find({ caso_id: casoId }).sort({ createdAt: 1 });
  const usuarios = await User.find({ _id: { $in: remisiones.map((r) => r.student_id) } }).select('nombre apellido');
  const nombre = new Map(usuarios.map((u) => [String(u._id), `${u.apellido} ${u.nombre}`]));
  return remisiones.map((r) => ({
    _id: String(r._id),
    student_id: String(r.student_id),
    estudiante: nombre.get(String(r.student_id)) ?? '',
    rol: r.rol,
    origen: r.origen,
    origen_detalle: r.origen_detalle,
    estado: r.estado,
    createdAt: r.createdAt,
    primera_atencion: r.atenciones[0]?.fecha ?? null,
    atendida: r.atendida?.fecha ?? null,
  }));
}

// --- Lo que hace orientación: su bandeja y sus atenciones ---

/** Solo orientación de la sede (y ADMIN). "No existe" y "no autorizado" responden igual. */
async function cargarRemision(id: string, usuario: UserDocument): Promise<RemisionOrientacionDocument> {
  const remision = ROLES_ORIENTACION.includes(usuario.rol) && Types.ObjectId.isValid(id) ? await RemisionOrientacion.findById(id) : null;
  if (!remision || !enAlcanceDeSede(comoUsuarioConvivencia(usuario), String(remision.sede_id))) throw new ApiError(404, NO_ENCONTRADA);
  return remision;
}

async function vistaRemisiones(remisiones: RemisionOrientacionDocument[], usuario: UserDocument) {
  const personasIds = [...new Set(remisiones.flatMap((r) => [String(r.student_id), ...r.atenciones.map((a) => String(a.por))]))];
  const [usuarios, grupos] = await Promise.all([
    User.find({ _id: { $in: personasIds } }).select('nombre apellido numero_documento'),
    Group.find({ _id: { $in: remisiones.map((r) => r.group_id) } }).select('nomenclatura'),
  ]);
  const persona = new Map(usuarios.map((u) => [String(u._id), u]));
  const grupo = new Map(grupos.map((g) => [String(g._id), g.nomenclatura]));

  return remisiones.map((r) => {
    const estudiante = persona.get(String(r.student_id));
    return {
      _id: String(r._id),
      estado: r.estado,
      caso_codigo: r.caso_codigo,
      tipo_situacion: r.tipo_situacion,
      hechos: r.hechos,
      rol: r.rol,
      origen: r.origen,
      origen_detalle: r.origen_detalle,
      student_id: String(r.student_id),
      estudiante: estudiante ? `${estudiante.apellido} ${estudiante.nombre}` : '',
      numero_documento: estudiante?.numero_documento ?? '',
      grupo: grupo.get(String(r.group_id)) ?? '',
      createdAt: r.createdAt,
      atendida: r.atendida?.fecha ?? null,
      // Lo que escribió otro orientador no se muestra: la sesión es confidencial de quien la hizo (un ADMIN sí la ve).
      atenciones: r.atenciones.map((a) => {
        const autor = persona.get(String(a.por));
        const visible = usuario.rol === ROLES.ADMIN || String(a.por) === String(usuario._id);
        return {
          _id: String(a._id),
          fecha: a.fecha,
          por_nombre: autor ? `${autor.nombre} ${autor.apellido}` : null,
          descripcion: visible ? a.descripcion : null,
        };
      }),
    };
  });
}

export interface FiltrosRemisiones {
  estado?: EstadoRemisionOrientacion;
}

export async function bandejaDeRemisiones(usuario: UserDocument, filtros: FiltrosRemisiones, { pagina, limite }: { pagina: number; limite: number }, ip?: string | null) {
  if (!ROLES_ORIENTACION.includes(usuario.rol)) throw new ApiError(403, 'Solo orientación atiende las remisiones.');
  const alcance = alcanceDeSedes(comoUsuarioConvivencia(usuario));
  const filtro = { ...(filtros.estado ? { estado: filtros.estado } : {}), ...(alcance === 'TODAS' ? {} : { sede_id: { $in: alcance } }) };
  const [total, datos] = await Promise.all([
    RemisionOrientacion.countDocuments(filtro),
    RemisionOrientacion.find(filtro)
      .sort({ createdAt: -1 })
      .skip((pagina - 1) * limite)
      .limit(limite),
  ]);
  await registrarEvento({ usuario_id: usuario._id, accion: 'ORIENTACION_BANDEJA_CONSULTADA', entidad: 'RemisionOrientacion', detalle: `${datos.length} remisión(es)`, ip });
  return { total, pagina, limite, data: await vistaRemisiones(datos, usuario) };
}

export async function obtenerRemision(id: string, usuario: UserDocument, ip?: string | null) {
  const remision = await cargarRemision(id, usuario);
  await registrarEvento({ usuario_id: usuario._id, accion: 'ORIENTACION_REMISION_CONSULTADA', entidad: 'RemisionOrientacion', entidad_id: remision._id, ip });
  return (await vistaRemisiones([remision], usuario))[0];
}

/** El contenido de la sesión no va a la auditoría. La primera atención pasa la remisión a EN_ATENCION. */
export async function registrarAtencion(id: string, datos: { fecha: string; descripcion: string }, usuario: UserDocument, ip?: string | null) {
  if (usuario.rol !== ROLES.ORIENTADOR) throw new ApiError(403, 'Solo orientación registra atenciones.');
  const remision = await cargarRemision(id, usuario);
  if (remision.estado === 'ATENDIDA') throw new ApiError(409, 'La remisión ya está atendida: no admite más atenciones.');
  const fecha = fechaDeClase(datos.fecha);
  if (fecha > hoyColombia()) throw new ApiError(400, 'La fecha de la atención no puede ser futura.');

  remision.atenciones.push({ fecha, descripcion: datos.descripcion.trim(), por: usuario._id });
  remision.estado = 'EN_ATENCION';
  await remision.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'ORIENTACION_ATENCION_REGISTRADA', entidad: 'RemisionOrientacion', entidad_id: remision._id, ip });
  return (await vistaRemisiones([remision], usuario))[0];
}

/** Orientación da por atendida la remisión (con al menos una atención registrada). */
export async function marcarAtendida(id: string, usuario: UserDocument, ip?: string | null) {
  if (usuario.rol !== ROLES.ORIENTADOR) throw new ApiError(403, 'Solo orientación da por atendida una remisión.');
  const remision = await cargarRemision(id, usuario);
  if (remision.estado === 'ATENDIDA') throw new ApiError(409, 'La remisión ya está atendida.');
  if (remision.atenciones.length === 0) throw new ApiError(409, 'Registra al menos una atención antes de darla por atendida.');

  remision.estado = 'ATENDIDA';
  remision.atendida = { por: usuario._id, fecha: new Date() };
  await remision.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'ORIENTACION_REMISION_ATENDIDA', entidad: 'RemisionOrientacion', entidad_id: remision._id, ip });
  return (await vistaRemisiones([remision], usuario))[0];
}
