import { Types } from 'mongoose';
import { ROLES } from '../constants/roles';
import Group from '../models/group.model';
import SolicitudCaso, { SolicitudCasoDocument } from '../models/solicitudCaso.model';
import { User, UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { alcanceDeSedes, enAlcanceDeSede } from '../utils/permisosConvivencia';
import { registrarEvento } from './audit.service';

const ROLES_CONVIVENCIA: string[] = [ROLES.ADMIN, ROLES.COORDINADOR_CONVIVENCIA];
const NO_ENCONTRADA = 'Solicitud no encontrada.';

const comoUsuarioConvivencia = (u: UserDocument) => ({ id: String(u._id), rol: u.rol, sedes_ids: u.sedes_ids.map(String) });

export interface Paginacion {
  pagina: number;
  limite: number;
}

async function vistaSolicitudes(solicitudes: SolicitudCasoDocument[]) {
  const estudiantesIds = solicitudes.flatMap((s) => s.involucrados.map((i) => String(i.student_id)));
  const gruposIds = solicitudes.flatMap((s) => s.involucrados.map((i) => i.group_id));
  const personasIds = [...new Set([...estudiantesIds, ...solicitudes.map((s) => String(s.solicitada_por))])];
  const [usuarios, grupos] = await Promise.all([
    User.find({ _id: { $in: personasIds } }).select('nombre apellido numero_documento'),
    Group.find({ _id: { $in: gruposIds } }).select('nomenclatura'),
  ]);
  const persona = new Map(usuarios.map((u) => [String(u._id), u]));
  const grupo = new Map(grupos.map((g) => [String(g._id), g.nomenclatura]));

  return solicitudes.map((s) => {
    const reporta = persona.get(String(s.solicitada_por));
    return {
      _id: String(s._id),
      estado: s.estado,
      gravedad: s.gravedad,
      falta: s.falta,
      fecha_hecho: s.fecha_hecho,
      hechos: s.hechos,
      acciones_contencion: s.acciones_contencion,
      solicitada_por: reporta ? `${reporta.nombre} ${reporta.apellido}` : null,
      createdAt: s.createdAt,
      involucrados: s.involucrados.map((i) => {
        const u = persona.get(String(i.student_id));
        return {
          student_id: String(i.student_id),
          rol: i.rol,
          estudiante: u ? `${u.apellido} ${u.nombre}` : '',
          numero_documento: u?.numero_documento ?? '',
          grupo: grupo.get(String(i.group_id)) ?? '',
        };
      }),
      resolucion: s.resolucion ? { motivo: s.resolucion.motivo, fecha: s.resolucion.fecha } : null,
      caso_id: s.caso_id ? String(s.caso_id) : null,
    };
  });
}

/** Solicitudes pendientes de las sedes del usuario: lo que coordinación de convivencia tiene por atender. Cada consulta se audita. */
export async function bandejaDeSolicitudes(usuario: UserDocument, { pagina, limite }: Paginacion, ip?: string | null) {
  if (!ROLES_CONVIVENCIA.includes(usuario.rol)) throw new ApiError(403, 'Solo convivencia atiende las solicitudes de caso.');
  const alcance = alcanceDeSedes(comoUsuarioConvivencia(usuario));
  const filtro = { estado: 'PENDIENTE', ...(alcance === 'TODAS' ? {} : { sede_id: { $in: alcance } }) };
  const [total, datos] = await Promise.all([
    SolicitudCaso.countDocuments(filtro),
    SolicitudCaso.find(filtro)
      .sort({ createdAt: -1 })
      .skip((pagina - 1) * limite)
      .limit(limite),
  ]);
  await registrarEvento({
    usuario_id: usuario._id,
    accion: 'CONVIVENCIA_BANDEJA_CONSULTADA',
    entidad: 'SolicitudCaso',
    detalle: `${datos.length} solicitud(es)`,
    ip,
  });
  return { total, pagina, limite, data: await vistaSolicitudes(datos) };
}

/** Coordinación de convivencia decide que lo remitido no amerita caso (queda el motivo). La falta Tipo I sigue en el Observador. */
export async function descartarSolicitud(id: string, motivo: string, usuario: UserDocument, ip?: string | null) {
  const solicitud = Types.ObjectId.isValid(id) ? await SolicitudCaso.findById(id) : null;
  const permitido =
    solicitud && ROLES_CONVIVENCIA.includes(usuario.rol) && enAlcanceDeSede(comoUsuarioConvivencia(usuario), String(solicitud.sede_id));
  if (!solicitud || !permitido) throw new ApiError(404, NO_ENCONTRADA);
  if (solicitud.estado !== 'PENDIENTE') throw new ApiError(409, 'La solicitud ya fue atendida.');

  solicitud.estado = 'DESCARTADA';
  solicitud.resolucion = { por: usuario._id, fecha: new Date(), motivo: motivo.trim() };
  await solicitud.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'SOLICITUD_CASO_DESCARTADA', entidad: 'SolicitudCaso', entidad_id: solicitud._id, ip });
  return (await vistaSolicitudes([solicitud]))[0];
}
