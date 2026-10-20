import { Types } from 'mongoose';
import { NOMBRES_DOCUMENTO_MATRICULA } from '../constants/matriculaChecklist';
import { ROLES } from '../constants/roles';
import CertificadoEmitido from '../models/certificadoEmitido.model';
import Enrollment from '../models/enrollment.model';
import ExpedienteInclusion from '../models/expedienteInclusion.model';
import PazYSalvo from '../models/pazYSalvo.model';
import { RegistroServicioSocial } from '../models/registrosTitulacion.model';
import TrasladoExtemporaneo from '../models/trasladoExtemporaneo.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { registrarEvento } from './audit.service';
import { nombresDeTipos } from './tipoCertificado.service';

export type CategoriaExpediente = 'MATRICULA' | 'SALIDA' | 'TRASLADO' | 'PAZ_Y_SALVO' | 'SERVICIO_SOCIAL' | 'INCLUSION' | 'CERTIFICADO';

export interface ItemExpediente {
  categoria: CategoriaExpediente;
  titulo: string;
  /** Lo que ayuda a ubicarlo: el grupo o el año, el estado, el código del documento. */
  detalle: string | null;
  anio: number | null;
  fecha: string | null;
  estado: string | null;
  /** Solo certificados expedidos: su consecutivo y la clave corta de verificación. */
  codigo?: string;
  huella?: string;
  /**
   * La ruta de la API que sirve el archivo (con sesión y con el permiso de su módulo), o null si quien consulta no puede bajarlo. Nunca es una ruta
   * de disco: el expediente solo indexa lo que cada módulo ya guarda, no mueve ni copia ningún archivo.
   */
  descarga: string | null;
}

const PUEDEN_CONSULTAR = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];

/**
 * El expediente digital del estudiante (M29): una vista que junta, por llave de estudiante, lo que cada módulo ya guarda: documentos de matrícula (M04),
 * soportes de retiro (M04), traslados y homologaciones, paz y salvo de fin de año, servicio social (M19), soportes del PIAR (M16, solo con su permiso) y
 * los certificados y diplomas expedidos (M26). No hay una tabla propia ni se mueven archivos: cada descarga sigue pasando por el endpoint de su módulo.
 */
export async function expedienteDelEstudiante(studentId: string, usuario: UserDocument, ip?: string | null): Promise<{ estudiante: { _id: string; nombre: string; apellido: string; numero_documento: string }; items: ItemExpediente[] }> {
  if (!PUEDEN_CONSULTAR.includes(usuario.rol)) throw new ApiError(403, 'No tienes acceso al expediente digital.');
  const estudiante = Types.ObjectId.isValid(studentId) ? await User.findOne({ _id: studentId, roles: ROLES.ESTUDIANTE }).select('nombre apellido numero_documento') : null;
  if (!estudiante) throw new ApiError(404, 'Estudiante no encontrado.');

  const matriculas = await Enrollment.find({ student_id: studentId })
    .populate<{ academic_year_id: { year: number } }>('academic_year_id', 'year')
    .populate<{ group_id: { nomenclatura: string; sede_id: Types.ObjectId } }>('group_id', 'nomenclatura sede_id')
    .sort({ createdAt: -1 });

  // Quien no es ADMIN solo ve a estudiantes que alguna vez estuvieron en una de sus sedes («no existe» y «no es de tu sede» responden igual).
  const sedes = (usuario.sedes_ids ?? []).map(String);
  if (usuario.rol !== ROLES.ADMIN && !matriculas.some((m) => m.group_id && sedes.includes(String(m.group_id.sede_id)))) throw new ApiError(404, 'Estudiante no encontrado.');

  const items: ItemExpediente[] = [];
  const anioDe = (m: (typeof matriculas)[number]): number | null => m.academic_year_id?.year ?? null;
  const dondeEstaba = (m: (typeof matriculas)[number]): string => `${anioDe(m) ?? ''} · grupo ${m.group_id?.nomenclatura ?? ''}`.trim();

  for (const m of matriculas) {
    for (const d of m.checklist) {
      if (!d.archivo_path) continue;
      items.push({
        categoria: 'MATRICULA',
        titulo: d.nombre_personalizado || NOMBRES_DOCUMENTO_MATRICULA[d.tipo_documento] || d.tipo_documento,
        detalle: dondeEstaba(m),
        anio: anioDe(m),
        fecha: d.fecha_carga ? d.fecha_carga.toISOString() : null,
        estado: d.estado,
        descarga: `/enrollments/${m._id}/checklist/${d.tipo_documento}/archivo`,
      });
    }
    for (const s of m.salida?.soportes ?? []) {
      items.push({ categoria: 'SALIDA', titulo: s.nombre, detalle: `${m.salida?.tipo === 'TRASLADO' ? 'Traslado' : 'Retiro'} · ${dondeEstaba(m)}`, anio: anioDe(m), fecha: s.fecha ? s.fecha.toISOString() : null, estado: null, descarga: `/salidas/${m._id}/soportes/${s._id}` });
    }
  }

  const traslados = await TrasladoExtemporaneo.find({ enrollment_id: { $in: matriculas.map((m) => m._id) } });
  for (const t of traslados) {
    const m = matriculas.find((x) => String(x._id) === String(t.enrollment_id));
    for (const s of t.soportes) {
      items.push({ categoria: 'TRASLADO', titulo: s.nombre, detalle: `Ingreso por traslado${m ? ` · ${dondeEstaba(m)}` : ''}`, anio: m ? anioDe(m) : null, fecha: s.fecha ? s.fecha.toISOString() : null, estado: null, descarga: `/traslados/${t._id}/soportes/${s._id}` });
    }
  }

  const anios = new Map(matriculas.map((m) => [String(m.academic_year_id && (m.academic_year_id as unknown as { _id: Types.ObjectId })._id), anioDe(m)]));
  for (const p of await PazYSalvo.find({ student_id: studentId, archivo_path: { $ne: null } })) {
    items.push({ categoria: 'PAZ_Y_SALVO', titulo: 'Paz y salvo de fin de año', detalle: null, anio: anios.get(String(p.academic_year_id)) ?? null, fecha: p.fecha_carga ? p.fecha_carga.toISOString() : null, estado: p.estado, descarga: `/paz-y-salvo/${p._id}/archivo` });
  }

  for (const r of await RegistroServicioSocial.find({ student_id: studentId, 'soporte.nombre': { $exists: true, $ne: null }, estado: 'VIGENTE' })) {
    items.push({ categoria: 'SERVICIO_SOCIAL', titulo: `Servicio social · ${r.entidad}`, detalle: `${r.horas} horas`, anio: null, fecha: r.createdAt.toISOString(), estado: r.verificacion, descarga: `/titulacion/servicio-social/${r._id}/soporte` });
  }

  // Los soportes del PIAR son datos sensibles de salud: solo los lista quien tiene acceso al módulo de inclusión (hoy, el administrador).
  if (usuario.rol === ROLES.ADMIN) {
    for (const e of await ExpedienteInclusion.find({ student_id: studentId }).select('academic_year_id soportes').populate<{ academic_year_id: { year: number } }>('academic_year_id', 'year')) {
      for (const s of e.soportes) {
        items.push({ categoria: 'INCLUSION', titulo: s.nombre, detalle: 'Soporte del expediente de inclusión', anio: e.academic_year_id?.year ?? null, fecha: null, estado: null, descarga: `/inclusion/expedientes/${e._id}/soportes/${s._id}/archivo` });
      }
    }
  }

  const certificados = await CertificadoEmitido.find(usuario.rol === ROLES.ADMIN ? { student_id: studentId } : { student_id: studentId, sede_id: { $in: usuario.sedes_ids ?? [] } }).sort({ createdAt: -1 });
  const nombres = await nombresDeTipos(certificados.map((c) => c.tipo));
  // Los certificados los baja Secretaría y el administrador (M26): coordinación ve que existen pero no los descarga desde aquí.
  const puedeBajarCertificados = usuario.rol === ROLES.ADMIN || usuario.rol === ROLES.SECRETARIA;
  for (const c of certificados) {
    items.push({
      categoria: 'CERTIFICADO',
      titulo: nombres.get(c.tipo) ?? c.tipo,
      detalle: c.estado === 'ANULADO' ? 'Anulado' : null,
      anio: c.anio_emision,
      fecha: c.createdAt.toISOString(),
      estado: c.estado,
      codigo: c.codigo,
      huella: c.hash.slice(0, 12).toUpperCase(),
      descarga: puedeBajarCertificados ? `/certificados/${c._id}/pdf` : null,
    });
  }

  await registrarEvento({ usuario_id: usuario._id, accion: 'EXPEDIENTE_DIGITAL_CONSULTADO', entidad: 'User', entidad_id: estudiante._id, detalle: `${items.length} documentos`, ip });
  items.sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''));
  return { estudiante: { _id: String(estudiante._id), nombre: estudiante.nombre, apellido: estudiante.apellido, numero_documento: estudiante.numero_documento }, items };
}
