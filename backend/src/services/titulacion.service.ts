import { Types } from 'mongoose';
import { EstadoTitulacion, TITULO_BACHILLER_INICIAL } from '../constants/titulacion';
import { ROLES } from '../constants/roles';
import Enrollment from '../models/enrollment.model';
import EvaluacionPromocion from '../models/evaluacionPromocionEstudiante.model';
import Grade from '../models/grade.model';
import Group, { GroupDocument } from '../models/group.model';
import Institution from '../models/institution.model';
import PazYSalvo from '../models/pazYSalvo.model';
import { CertificadoGradoExterno, RegistroSaber11, RegistroServicioSocial } from '../models/registrosTitulacion.model';
import Titulacion, { TitulacionDocument } from '../models/titulacion.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { conceptoOficial, PoliticaTitulacion } from '../utils/promocion';
import { estadoDeTitulacion, evaluarRequisitos, gradosSinCertificado } from '../utils/titulacion';
import { registrarEvento } from './audit.service';
import { datosDePolitica, obtenerPolitica } from './politicaPromocion.service';

const PUEDEN_REGISTRAR = [ROLES.ADMIN, ROLES.SECRETARIA];
const PUEDEN_CONSULTAR = [ROLES.ADMIN, ROLES.SECRETARIA, ROLES.COORDINADOR];

function exigir(usuario: UserDocument, roles: readonly string[], mensaje: string): void {
  if (!roles.includes(usuario.rol)) throw new ApiError(403, mensaje);
}

/** El ADMIN ve todo; los demás solo a estudiantes que alguna vez se matricularon en una de sus sedes («no existe» y «no es de tu sede» responden igual). */
async function exigirAlcance(usuario: UserDocument, studentId: string): Promise<void> {
  if (usuario.rol === ROLES.ADMIN) return;
  const matriculas = await Enrollment.find({ student_id: studentId }).populate<{ group_id: Pick<GroupDocument, 'sede_id'> }>('group_id', 'sede_id');
  const sedes = (usuario.sedes_ids ?? []).map(String);
  if (!matriculas.some((m) => m.group_id && sedes.includes(String(m.group_id.sede_id)))) throw new ApiError(404, 'Estudiante no encontrado.');
}

/** Los efectos secundarios (reevaluar la titulación) nunca rompen la acción de negocio que los origina. */
async function sinRomper(accion: () => Promise<unknown>): Promise<void> {
  try {
    await accion();
  } catch (err) {
    console.error('No se pudo reevaluar la titulación:', err);
  }
}

// --- Qué tiene el estudiante ---

interface Hechos {
  horas: number;
  saber11: boolean;
  pazYSalvo: boolean;
  conCertificado: Set<number>;
}

async function reunirHechos(studentId: Types.ObjectId | string, anioId: Types.ObjectId | string): Promise<Hechos> {
  const [servicio, saber, paz, externos, propios] = await Promise.all([
    RegistroServicioSocial.find({ student_id: studentId, estado: 'VIGENTE' }).select('horas').lean(),
    RegistroSaber11.exists({ student_id: studentId }),
    PazYSalvo.exists({ student_id: studentId, academic_year_id: anioId, estado: 'CONFIRMADO' }),
    CertificadoGradoExterno.find({ student_id: studentId }).select('grado_numero').lean(),
    // Un grado cursado aquí cuenta solo: su cierre de promoción vigente con un resultado de aprobación.
    EvaluacionPromocion.find({ student_id: studentId, vigente: true }).select('grado_id resultado').lean(),
  ]);
  const aprobados = propios.filter((c) => ['PROMOVIDO', 'PROMOVIDO_POR_RECUPERACION', 'PROMOVIDO_CON_ARRASTRE'].includes(c.resultado));
  const grados = await Grade.find({ _id: { $in: aprobados.map((c) => c.grado_id) } }).select('numero').lean();
  return {
    horas: servicio.reduce((suma, r) => suma + r.horas, 0),
    saber11: Boolean(saber),
    pazYSalvo: Boolean(paz),
    conCertificado: new Set([...externos.map((c) => c.grado_numero), ...grados.map((g) => g.numero)]),
  };
}

// --- Evaluar la titulación ---

/**
 * Evalúa (o reevalúa) la titulación de una matrícula a partir de su cierre de promoción vigente (M19). Solo aplica al grado de titulación
 * de la política y a quien lo aprobó. Guarda `Titulacion` y deja el cambio de estado en su historial. Idempotente.
 */
export async function evaluarTitulacionDeMatricula(enrollmentId: string | Types.ObjectId, motivo: string, usuario: UserDocument | null): Promise<TitulacionDocument | null> {
  const cierre = await EvaluacionPromocion.findOne({ enrollment_id: enrollmentId, vigente: true });
  if (!cierre) return null;
  const [grado, grupo] = await Promise.all([Grade.findById(cierre.grado_id).select('nombre numero'), Group.findById(cierre.group_id)]);
  if (!grado || !grupo) return null;

  const politica = datosDePolitica(await obtenerPolitica(String(cierre.academic_year_id))).titulacion;
  if (grado.numero !== politica.grado_titulacion) return null;

  const aprobo = conceptoOficial(cierre.resultado, grado.nombre, null)?.concepto === 'APROBO';
  const hechos = await reunirHechos(cierre.student_id, cierre.academic_year_id);
  const { pendientes } = evaluarRequisitos(
    {
      grado_numero: grado.numero,
      horas_servicio_social: hechos.horas,
      presento_saber_11: hechos.saber11,
      paz_y_salvo_confirmado: hechos.pazYSalvo,
      grados_sin_certificado: gradosSinCertificado(politica, hechos.conCertificado),
    },
    politica
  );

  const existente = await Titulacion.findOne({ student_id: cierre.student_id, academic_year_id: cierre.academic_year_id });
  const estado = estadoDeTitulacion(aprobo, pendientes, existente?.estado ?? null);
  if (estado === null) return null;

  const institucion = await Institution.findOne().select('titulo_bachiller_defecto');
  const titulo = grupo.titulo_bachiller ?? institucion?.titulo_bachiller_defecto ?? TITULO_BACHILLER_INICIAL;
  const entrada = { estado, fecha: new Date(), motivo, por: usuario?._id ?? null };

  if (!existente) {
    const creada = await Titulacion.create({
      student_id: cierre.student_id,
      academic_year_id: cierre.academic_year_id,
      enrollment_id: cierre.enrollment_id,
      group_id: cierre.group_id,
      titulo,
      estado,
      pendientes,
      historial: [entrada],
    });
    await registrarEvento({ usuario_id: usuario?._id ?? null, accion: 'TITULACION_ESTADO_CAMBIADO', entidad: 'Titulacion', entidad_id: creada._id, detalle: `Estado ${estado}` });
    return creada;
  }

  const cambio = existente.estado !== estado;
  existente.set({ titulo, estado, pendientes });
  if (cambio) existente.historial.push(entrada);
  await existente.save();
  if (cambio) await registrarEvento({ usuario_id: usuario?._id ?? null, accion: 'TITULACION_ESTADO_CAMBIADO', entidad: 'Titulacion', entidad_id: existente._id, detalle: `Estado ${estado}` });
  return existente;
}

/** Tras registrar un requisito: reevalúa las titulaciones del estudiante que aún no se gradúan (así el grado por ventanilla se habilita solo). */
export async function reevaluarPendientes(studentId: string, motivo: string, usuario: UserDocument | null): Promise<void> {
  const abiertas = await Titulacion.find({ student_id: studentId, estado: 'APROBO_NO_GRADUADO' }).select('enrollment_id');
  for (const t of abiertas) await sinRomper(() => evaluarTitulacionDeMatricula(t.enrollment_id, motivo, usuario));
}

/** Al cerrar el grupo (M19) se evalúa la titulación de quienes cursan el grado de titulación. */
export async function evaluarTitulacionDeMatriculas(enrollmentIds: Array<string | Types.ObjectId>, usuario: UserDocument | null): Promise<void> {
  for (const id of enrollmentIds) await sinRomper(() => evaluarTitulacionDeMatricula(id, 'Cierre de promoción', usuario));
}

export async function reevaluarTitulacion(studentId: string, anioId: string, usuario: UserDocument): Promise<TitulacionDocument> {
  exigir(usuario, PUEDEN_REGISTRAR, 'Solo Secretaría y el administrador reevalúan la titulación.');
  await exigirAlcance(usuario, studentId);
  const existente = await Titulacion.findOne({ student_id: studentId, academic_year_id: anioId });
  const matricula = existente?.enrollment_id ?? (await Enrollment.findOne({ student_id: studentId, academic_year_id: anioId }))?._id;
  const resultado = matricula ? await evaluarTitulacionDeMatricula(matricula, 'Reevaluación manual', usuario) : null;
  if (!resultado) throw new ApiError(409, 'El estudiante no tiene un cierre de promoción aprobado en el grado de titulación para ese año.');
  return resultado;
}

// --- Servicio social ---

export interface EntradaServicioSocial {
  student_id: string;
  horas: number;
  entidad: string;
  descripcion?: string;
  fecha_inicio?: Date | null;
  fecha_fin?: Date | null;
}

async function exigirEstudiante(studentId: string): Promise<void> {
  const u = await User.findById(studentId).select('rol roles');
  if (!u || !(u.roles ?? [u.rol]).includes('ESTUDIANTE')) throw new ApiError(404, 'Estudiante no encontrado.');
}

export async function registrarServicioSocial(entrada: EntradaServicioSocial, usuario: UserDocument, ip?: string | null) {
  exigir(usuario, PUEDEN_REGISTRAR, 'Solo Secretaría y el administrador registran el servicio social.');
  await exigirEstudiante(entrada.student_id);
  await exigirAlcance(usuario, entrada.student_id);
  const registro = await RegistroServicioSocial.create({ ...entrada, registrado_por: usuario._id });
  await registrarEvento({ usuario_id: usuario._id, accion: 'TITULACION_SERVICIO_SOCIAL_REGISTRADO', entidad: 'RegistroServicioSocial', entidad_id: registro._id, detalle: `${entrada.horas} horas`, ip });
  await reevaluarPendientes(entrada.student_id, 'Servicio social registrado', usuario);
  return registro;
}

export async function anularServicioSocial(id: string, motivo: string, usuario: UserDocument, ip?: string | null) {
  exigir(usuario, PUEDEN_REGISTRAR, 'Solo Secretaría y el administrador anulan el servicio social.');
  const registro = await RegistroServicioSocial.findById(id);
  if (!registro) throw new ApiError(404, 'Registro no encontrado.');
  await exigirAlcance(usuario, String(registro.student_id));
  if (registro.estado === 'ANULADO') throw new ApiError(409, 'El registro ya estaba anulado.');
  registro.estado = 'ANULADO';
  registro.anulacion = { motivo, por: usuario._id, fecha: new Date() };
  await registro.save();
  // Anular horas NO degrada a quien ya se graduó (el estado no retrocede); sirve para corregir antes de graduar.
  await registrarEvento({ usuario_id: usuario._id, accion: 'TITULACION_SERVICIO_SOCIAL_ANULADO', entidad: 'RegistroServicioSocial', entidad_id: registro._id, detalle: 'Registro anulado', ip });
  return registro;
}

// --- Saber 11 y carpeta ---

export async function registrarSaber11(studentId: string, codigo: string, fecha: Date | null, usuario: UserDocument, ip?: string | null) {
  exigir(usuario, PUEDEN_REGISTRAR, 'Solo Secretaría y el administrador registran las pruebas Saber 11.');
  await exigirEstudiante(studentId);
  await exigirAlcance(usuario, studentId);
  const registro = await RegistroSaber11.findOneAndUpdate(
    { student_id: studentId },
    { $set: { codigo_registro: codigo, fecha_presentacion: fecha, registrado_por: usuario._id } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await registrarEvento({ usuario_id: usuario._id, accion: 'TITULACION_SABER11_REGISTRADO', entidad: 'RegistroSaber11', entidad_id: registro._id, detalle: 'Presentación registrada', ip });
  await reevaluarPendientes(studentId, 'Saber 11 registrado', usuario);
  return registro;
}

export async function registrarCertificadoExterno(entrada: { student_id: string; grado_numero: number; institucion_origen: string; anio?: number | null }, usuario: UserDocument, ip?: string | null) {
  exigir(usuario, PUEDEN_REGISTRAR, 'Solo Secretaría y el administrador completan la carpeta académica.');
  await exigirEstudiante(entrada.student_id);
  await exigirAlcance(usuario, entrada.student_id);
  try {
    const registro = await CertificadoGradoExterno.create({ ...entrada, registrado_por: usuario._id });
    await registrarEvento({ usuario_id: usuario._id, accion: 'TITULACION_CERTIFICADO_EXTERNO_REGISTRADO', entidad: 'CertificadoGradoExterno', entidad_id: registro._id, detalle: `Grado ${entrada.grado_numero}`, ip });
    await reevaluarPendientes(entrada.student_id, 'Carpeta académica completada', usuario);
    return registro;
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw new ApiError(409, 'Ese grado ya tiene su certificado registrado.');
    throw err;
  }
}

// --- Consultas ---

export interface RequisitosDeEstudiante {
  estudiante_id: string;
  grado_numero: number | null;
  horas_servicio_social: number;
  horas_requeridas: number | null;
  saber_11: { codigo_registro: string; fecha_presentacion: Date | null } | null;
  paz_y_salvo_confirmado: boolean;
  grados_sin_certificado: number[];
  pendientes: Array<{ requisito: string; detalle: string }>;
  alertas: Array<{ requisito: string; detalle: string }>;
  titulaciones: Array<{ academic_year_id: string; titulo: string; estado: EstadoTitulacion; pendientes: Array<{ requisito: string; detalle: string }> }>;
}

/** Todo lo que Secretaría necesita ver de un estudiante antes de graduarlo: lo registrado, lo que falta y los avisos (p. ej. servicio social en 10°). */
export async function requisitosDeEstudiante(studentId: string, usuario: UserDocument): Promise<RequisitosDeEstudiante> {
  exigir(usuario, PUEDEN_CONSULTAR, 'No tienes acceso a la titulación.');
  await exigirEstudiante(studentId);
  await exigirAlcance(usuario, studentId);

  const matricula = await Enrollment.findOne({ student_id: studentId }).sort({ createdAt: -1 }).populate<{ group_id: { grade_id: Types.ObjectId } }>('group_id', 'grade_id');
  const grado = matricula?.group_id ? await Grade.findById(matricula.group_id.grade_id).select('numero') : null;
  const politica: PoliticaTitulacion | null = matricula ? datosDePolitica(await obtenerPolitica(String(matricula.academic_year_id))).titulacion : null;
  const hechos = await reunirHechos(studentId, matricula?.academic_year_id ?? new Types.ObjectId());
  const saber = await RegistroSaber11.findOne({ student_id: studentId });
  const titulaciones = await Titulacion.find({ student_id: studentId }).sort({ createdAt: -1 });

  const grados_sin_certificado = politica ? gradosSinCertificado(politica, hechos.conCertificado) : [];
  const { pendientes, alertas } =
    politica && grado
      ? evaluarRequisitos({ grado_numero: grado.numero, horas_servicio_social: hechos.horas, presento_saber_11: hechos.saber11, paz_y_salvo_confirmado: hechos.pazYSalvo, grados_sin_certificado }, politica)
      : { pendientes: [], alertas: [] };

  return {
    estudiante_id: studentId,
    grado_numero: grado?.numero ?? null,
    horas_servicio_social: hechos.horas,
    horas_requeridas: politica?.servicio_social.activo ? politica.servicio_social.horas_requeridas : null,
    saber_11: saber ? { codigo_registro: saber.codigo_registro, fecha_presentacion: saber.fecha_presentacion } : null,
    paz_y_salvo_confirmado: hechos.pazYSalvo,
    grados_sin_certificado,
    pendientes,
    alertas,
    titulaciones: titulaciones.map((t) => ({ academic_year_id: String(t.academic_year_id), titulo: t.titulo, estado: t.estado, pendientes: t.pendientes })),
  };
}

export async function listarTitulaciones(filtros: { academic_year_id: string; estado?: EstadoTitulacion }, usuario: UserDocument) {
  exigir(usuario, PUEDEN_CONSULTAR, 'No tienes acceso a la titulación.');
  const lista = await Titulacion.find({ academic_year_id: filtros.academic_year_id, ...(filtros.estado ? { estado: filtros.estado } : {}) })
    .populate('student_id', 'nombre apellido numero_documento')
    .sort({ estado: 1 })
    .lean();
  if (usuario.rol === ROLES.ADMIN) return lista;
  const sedes = (usuario.sedes_ids ?? []).map(String);
  const grupos = await Group.find({ _id: { $in: lista.map((t) => t.group_id) } }).select('sede_id');
  const permitidos = new Set(grupos.filter((g) => sedes.includes(String(g.sede_id))).map((g) => String(g._id)));
  return lista.filter((t) => permitidos.has(String(t.group_id)));
}
