import { Types } from 'mongoose';
import {
  MODULOS_AUDITORIA,
  ModuloAuditoria,
  accionesDeModulo,
  enlaceDeEntidad,
  etiquetaDeAccion,
  moduloDeAccion,
  nombreDeModulo,
} from '../constants/auditoria';
import { ACCIONES_AUDITORIA, AccionAuditoria, AuditLog, IAuditLog } from '../models/auditLog.model';
import AdmissionRequest from '../models/admissionRequest.model';
import CertificadoEmitido from '../models/certificadoEmitido.model';
import Enrollment from '../models/enrollment.model';
import Institution from '../models/institution.model';
import PazYSalvo from '../models/pazYSalvo.model';
import PazYSalvoSalida from '../models/pazYSalvoSalida.model';
import TrasladoExtemporaneo from '../models/trasladoExtemporaneo.model';
import ApiError from '../utils/ApiError';
import { finDelDia, inicioDelDia } from '../utils/calendarioAcademico';
import { ReporteTabular, nombreDeArchivo } from '../utils/reporteTabular';
import { registrarEvento } from './audit.service';

export interface FiltrosHistorial {
  modulo?: ModuloAuditoria;
  accion?: AccionAuditoria;
  usuario_id?: string;
  entidad?: string;
  entidad_id?: string;
  /** Días de calendario `YYYY-MM-DD`, en hora de Colombia y ambos inclusive. */
  desde?: string;
  hasta?: string;
  /** Busca dentro del detalle del evento. */
  texto?: string;
  page?: number;
  limit?: number;
}

/** Lo que más filas puede traer una exportación: la bitácora crece sin tope y un Excel de cientos de miles de filas no sirve. */
export const MAX_FILAS_EXPORTACION = 10_000;
/** Eventos que se muestran en la línea de tiempo de una matrícula. */
const MAX_EVENTOS_MATRICULA = 500;

interface UsuarioPoblado {
  _id: Types.ObjectId;
  nombre: string;
  apellido: string;
  numero_documento: string;
  roles: string[];
}

type EventoPlano = Omit<IAuditLog, 'usuario_id'> & { _id: Types.ObjectId; usuario_id: UsuarioPoblado | Types.ObjectId | null };

export function vistaEvento(e: EventoPlano) {
  const usuario = e.usuario_id && 'nombre' in e.usuario_id ? e.usuario_id : null;
  const modulo = moduloDeAccion(e.accion);
  const entidadId = e.entidad_id ? String(e.entidad_id) : null;
  return {
    _id: String(e._id),
    fecha: e.createdAt,
    accion: e.accion,
    etiqueta: etiquetaDeAccion(e.accion),
    modulo,
    modulo_nombre: nombreDeModulo(modulo),
    entidad: e.entidad,
    entidad_id: entidadId,
    detalle: e.detalle,
    ip: e.ip,
    // Un evento sin usuario lo hizo el sistema o alguien sin sesión (p. ej. la solicitud pública de admisión).
    usuario: usuario
      ? { _id: String(usuario._id), nombre: usuario.nombre, apellido: usuario.apellido, numero_documento: usuario.numero_documento, roles: usuario.roles }
      : null,
    enlace: enlaceDeEntidad(e.entidad, entidadId),
  };
}
export type VistaEvento = ReturnType<typeof vistaEvento>;

const escaparRegex = (texto: string): string => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const diaUtc = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

export function filtroDeHistorial(f: FiltrosHistorial): Record<string, unknown> {
  const filtro: Record<string, unknown> = {};
  if (f.modulo) {
    const delModulo = accionesDeModulo(f.modulo);
    filtro.accion = f.accion ? (delModulo.includes(f.accion) ? f.accion : { $in: [] }) : { $in: delModulo };
  } else if (f.accion) {
    filtro.accion = f.accion;
  }
  if (f.usuario_id) filtro.usuario_id = new Types.ObjectId(f.usuario_id);
  if (f.entidad) filtro.entidad = f.entidad;
  if (f.entidad_id) filtro.entidad_id = new Types.ObjectId(f.entidad_id);
  if (f.desde || f.hasta) {
    const rango: Record<string, Date> = {};
    if (f.desde) rango.$gte = inicioDelDia(diaUtc(f.desde));
    if (f.hasta) rango.$lte = finDelDia(diaUtc(f.hasta));
    if (rango.$gte && rango.$lte && rango.$gte > rango.$lte) throw new ApiError(400, 'La fecha «desde» no puede ser posterior a «hasta».');
    filtro.createdAt = rango;
  }
  const texto = f.texto?.trim();
  if (texto) filtro.detalle = { $regex: escaparRegex(texto), $options: 'i' };
  return filtro;
}

const POBLAR_USUARIO = { path: 'usuario_id', select: 'nombre apellido numero_documento roles' };

export async function listarHistorial(f: FiltrosHistorial) {
  const filtro = filtroDeHistorial(f);
  const page = Math.max(1, f.page ?? 1);
  const limit = Math.min(100, Math.max(1, f.limit ?? 25));
  const [eventos, total] = await Promise.all([
    AuditLog.find(filtro).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate(POBLAR_USUARIO).lean<EventoPlano[]>(),
    AuditLog.countDocuments(filtro),
  ]);
  return { data: eventos.map(vistaEvento), total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}

/** Módulos y acciones con su nombre en pantalla: así el frontend no repite la lista. */
export function catalogoHistorial() {
  return {
    modulos: MODULOS_AUDITORIA.map((m) => ({ clave: m.clave, nombre: m.nombre })),
    acciones: ACCIONES_AUDITORIA.map((a) => ({ accion: a, etiqueta: etiquetaDeAccion(a), modulo: moduloDeAccion(a) })),
  };
}

const FORMATO_FECHA_HORA = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'medium' });

export async function exportarHistorial(f: FiltrosHistorial, usuarioId: Types.ObjectId, ip?: string | null): Promise<ReporteTabular> {
  const filtro = filtroDeHistorial(f);
  const [eventos, total, institucion] = await Promise.all([
    AuditLog.find(filtro).sort({ createdAt: -1, _id: -1 }).limit(MAX_FILAS_EXPORTACION).populate(POBLAR_USUARIO).lean<EventoPlano[]>(),
    AuditLog.countDocuments(filtro),
    Institution.findOne().select('nombre').lean(),
  ]);
  const ahora = new Date();
  const filas = eventos.map(vistaEvento).map((e) => ({
    fecha: FORMATO_FECHA_HORA.format(new Date(e.fecha)),
    usuario: e.usuario ? `${e.usuario.apellido}, ${e.usuario.nombre}` : 'Sistema',
    documento: e.usuario?.numero_documento ?? '',
    modulo: e.modulo_nombre,
    accion: e.etiqueta,
    detalle: e.detalle ?? '',
    ip: e.ip ?? '',
  }));
  await registrarEvento({ usuario_id: usuarioId, accion: 'HISTORIAL_EXPORTADO', entidad: 'AuditLog', detalle: `${filas.length} de ${total} evento(s)`, ip });
  const alcance = [
    f.modulo ? nombreDeModulo(f.modulo) : 'Todos los módulos',
    f.accion ? etiquetaDeAccion(f.accion) : null,
    f.desde || f.hasta ? `del ${f.desde ?? 'inicio'} al ${f.hasta ?? 'hoy'}` : null,
    f.texto ? `con «${f.texto}»` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    titulo: 'Historial de acciones',
    institucion: institucion?.nombre ?? 'Klassy',
    anio: ahora.getFullYear(),
    generado_en: ahora,
    alcance,
    leyenda: total > filas.length ? `Se exportan los ${filas.length} eventos más recientes de ${total}: acota las fechas para ver el resto.` : 'Bitácora de solo escritura: ningún evento se modifica ni se elimina.',
    resumen: [['Eventos', total]],
    columnas: [
      { clave: 'fecha', titulo: 'Fecha y hora', ancho: 18 },
      { clave: 'usuario', titulo: 'Usuario', ancho: 26 },
      { clave: 'documento', titulo: 'Documento', ancho: 14, texto: true },
      { clave: 'modulo', titulo: 'Módulo', ancho: 24 },
      { clave: 'accion', titulo: 'Acción', ancho: 30 },
      { clave: 'detalle', titulo: 'Detalle', ancho: 60 },
      { clave: 'ip', titulo: 'IP', ancho: 16 },
    ],
    filas,
    mensaje_vacio: 'No hay eventos con esos filtros.',
    nombre_archivo: nombreDeArchivo('historial-de-acciones', ahora.toISOString().slice(0, 10)),
  };
}

/**
 * Historial completo de una matrícula: lo que se hizo sobre ella y sobre lo que nació de ella (la solicitud de admisión que la creó,
 * sus certificados, su traslado y su paz y salvo, de fin de año y de salida), y las demás matrículas del mismo estudiante.
 */
export async function historialDeMatricula(enrollmentId: string) {
  const matricula = Types.ObjectId.isValid(enrollmentId) ? await Enrollment.findById(enrollmentId).select('student_id academic_year_id').lean() : null;
  if (!matricula) throw new ApiError(404, 'Matrícula no encontrada.');
  const [admisiones, certificados, traslados, salidas, pazYSalvo] = await Promise.all([
    AdmissionRequest.find({ enrollment_id: matricula._id }).select('_id').lean(),
    CertificadoEmitido.find({ enrollment_id: matricula._id }).select('_id').lean(),
    TrasladoExtemporaneo.find({ enrollment_id: matricula._id }).select('_id').lean(),
    PazYSalvoSalida.find({ enrollment_id: matricula._id }).select('_id').lean(),
    PazYSalvo.find({ student_id: matricula.student_id, academic_year_id: matricula.academic_year_id }).select('_id').lean(),
  ]);
  const ids = [matricula._id, ...[...admisiones, ...certificados, ...traslados, ...salidas, ...pazYSalvo].map((d) => d._id)];
  const [eventos, otras] = await Promise.all([
    AuditLog.find({ entidad_id: { $in: ids } }).sort({ createdAt: -1, _id: -1 }).limit(MAX_EVENTOS_MATRICULA).populate(POBLAR_USUARIO).lean<EventoPlano[]>(),
    Enrollment.find({ student_id: matricula.student_id, _id: { $ne: matricula._id } })
      .select('estado folio_matricula tipo_ingreso fecha_matricula academic_year_id group_id')
      .populate({ path: 'academic_year_id', select: 'year' })
      .populate({ path: 'group_id', select: 'nomenclatura grade_id', populate: { path: 'grade_id', select: 'nombre' } })
      .lean(),
  ]);
  const matriculas = otras
    .map((m) => {
      const anio = m.academic_year_id as unknown as { year?: number } | null;
      const grupo = m.group_id as unknown as { nomenclatura?: string; grade_id?: { nombre?: string } } | null;
      return {
        _id: String(m._id),
        anio: anio?.year ?? null,
        grado: grupo?.grade_id?.nombre ?? null,
        grupo: grupo?.nomenclatura ?? null,
        estado: m.estado,
        tipo_ingreso: m.tipo_ingreso,
        folio_matricula: m.folio_matricula ?? null,
        fecha_matricula: m.fecha_matricula ?? null,
      };
    })
    .sort((a, b) => (b.anio ?? 0) - (a.anio ?? 0));
  return { eventos: eventos.map(vistaEvento), matriculas_del_estudiante: matriculas };
}
