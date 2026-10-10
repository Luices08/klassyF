import { Types } from 'mongoose';
import {
  CERTIFICADOS,
  ClaveCertificado,
  DefinicionCertificado,
  ElementoAutenticacion,
  MAX_MOTIVO_ANULACION,
  codigoDeCertificado,
  definicionCertificado,
} from '../constants/certificados';
import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import { env } from '../config/env';
import CertificadoEmitido, { CertificadoEmitidoDocument } from '../models/certificadoEmitido.model';
import Counter from '../models/counter.model';
import Enrollment, { EnrollmentDocument } from '../models/enrollment.model';
import Institution from '../models/institution.model';
import StudentGuardian from '../models/studentGuardian.model';
import StudentProfile from '../models/studentProfile.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import {
  SnapshotCertificado,
  claveCorta,
  generarTokenVerificacion,
  huellaDeCertificado,
  resolverDestinatario,
  resolverElementos,
} from '../utils/certificados';
import { runTransaction } from '../utils/runTransaction';
import { registrarEvento } from './audit.service';
import { entradaDeElementos, obtenerConfiguracion, presenciaDeImagenes } from './certificadoConfiguracion.service';
import { datosDeEstudios, obtenerPromocion } from './certificadoEstudios.service';
import { plantillaVigente, resolverContenido } from './certificadoPlantilla.service';
import { congelarEscudo } from './encabezadoInstitucional.service';

const PUEDEN_EXPEDIR: Rol[] = [ROLES.ADMIN, ROLES.SECRETARIA];

function exigirSecretaria(usuario: UserDocument): void {
  if (!PUEDEN_EXPEDIR.includes(usuario.rol)) throw new ApiError(403, 'Solo Secretaría y el administrador expiden certificados.');
}

/** El ADMIN ve todas las sedes; secretaría solo las que tiene asignadas (sin ninguna, no ve nada). */
export function puedeVerSede(usuario: UserDocument, sedeId: Types.ObjectId | string | null | undefined): boolean {
  if (usuario.rol === ROLES.ADMIN) return true;
  return Boolean(sedeId) && (usuario.sedes_ids ?? []).some((s) => String(s) === String(sedeId));
}

export function claveDeHuella(): string {
  if (!env.certificadosSecret) {
    throw new ApiError(503, 'El servidor no tiene definido CERT_HMAC_SECRET: no se pueden expedir ni verificar certificados.');
  }
  return env.certificadosSecret;
}

const MOTIVO_SIN_PROMOCION = 'Solo vista previa: falta el concepto de promoción (M19), que aún no está disponible.';

const noEncontrado = () => new ApiError(404, 'Certificado no encontrado.');

// --- Qué se puede expedir ---

type MatriculaCompleta = Omit<EnrollmentDocument, 'student_id' | 'group_id' | 'academic_year_id'> & {
  student_id: { _id: Types.ObjectId; nombre: string; apellido: string; tipo_documento: string; numero_documento: string };
  group_id: {
    _id: Types.ObjectId;
    nomenclatura: string;
    sede_id: { _id: Types.ObjectId; nombre: string };
    jornada_id: { nombre: string; hora_inicio: string; hora_fin: string };
    grade_id: { _id: Types.ObjectId; nombre: string; nivel: string };
  };
  academic_year_id: { _id: Types.ObjectId; year: number };
};

async function cargarMatricula(enrollmentId: string): Promise<MatriculaCompleta> {
  const matricula = Types.ObjectId.isValid(enrollmentId)
    ? await Enrollment.findById(enrollmentId)
        .populate('student_id', 'nombre apellido tipo_documento numero_documento rol')
        .populate({ path: 'group_id', select: 'nomenclatura sede_id jornada_id grade_id', populate: [{ path: 'sede_id', select: 'nombre' }, { path: 'jornada_id', select: 'nombre hora_inicio hora_fin' }, { path: 'grade_id', select: 'nombre nivel' }] })
        .populate('academic_year_id', 'year')
    : null;
  const completa = matricula as unknown as MatriculaCompleta | null;
  if (!completa || !completa.student_id || !completa.group_id || !completa.academic_year_id) throw new ApiError(404, 'Matrícula no encontrada.');
  return completa;
}

/** Matrículas del estudiante con los documentos que cada una permite: la expedición solo ofrece lo que aplica. */
export async function matriculasExpedibles(studentId: string, usuario: UserDocument) {
  exigirSecretaria(usuario);
  const estudiante = Types.ObjectId.isValid(studentId) ? await User.findOne({ _id: studentId, rol: ROLES.ESTUDIANTE }).select('nombre apellido numero_documento') : null;
  if (!estudiante) throw new ApiError(404, 'Estudiante no encontrado.');
  const matriculas = await Enrollment.find({ student_id: estudiante._id, estado: { $in: ['MATRICULADO_CONDICIONAL', 'MATRICULADO_DEFINITIVO', 'RETIRADO'] } })
    .populate<{ academic_year_id: { year: number } }>('academic_year_id', 'year')
    .populate<{ group_id: { nomenclatura: string; sede_id: Types.ObjectId; grade_id: { nombre: string } } }>({ path: 'group_id', select: 'nomenclatura grade_id sede_id', populate: { path: 'grade_id', select: 'nombre' } })
    .sort({ createdAt: -1 });
  return {
    estudiante: { _id: String(estudiante._id), nombre: estudiante.nombre, apellido: estudiante.apellido, numero_documento: estudiante.numero_documento },
    matriculas: await Promise.all(
      matriculas
        .filter((m) => m.academic_year_id && m.group_id && puedeVerSede(usuario, m.group_id.sede_id))
        .map(async (m) => {
          const tipos = CERTIFICADOS.filter((c) => c.estados_matricula.includes(m.estado));
          // Documentos que dependen de un módulo aún sin datos: se ofrecen, pero solo como vista previa y con el motivo a la vista.
          const restricciones: Partial<Record<ClaveCertificado, string>> = {};
          for (const c of tipos) {
            if (c.requiere?.includes('PROMOCION') && (await obtenerPromocion(String(m._id))) === null) restricciones[c.clave] = MOTIVO_SIN_PROMOCION;
          }
          return {
            _id: String(m._id),
            anio: m.academic_year_id.year,
            grado: m.group_id.grade_id?.nombre ?? '',
            grupo: m.group_id.nomenclatura,
            estado: m.estado,
            folio_matricula: m.folio_matricula,
            tipos: tipos.map((c) => c.clave),
            restricciones,
          };
        })
    ),
  };
}

export interface EntradaExpedicion {
  enrollment_id: string;
  tipo: ClaveCertificado;
  /** Lo elegido en el selector de destinatario/motivo del documento (`otro` es el texto cuando elige «Otro»). */
  destinatario?: { clave: string; otro?: string | null } | null;
  /** Solo paz y salvo: las dependencias confirmadas sin pendientes. */
  dependencias?: string[];
  firmas?: Partial<Record<ElementoAutenticacion, boolean>>;
}

/** El paz y salvo certifica que no hay pendientes: cada dependencia que el colegio exige se confirma al expedirlo. */
function dependenciasConfirmadas(configuradas: Array<{ clave: string; nombre: string; activa: boolean }>, confirmadas: string[], usuario: UserDocument): { dependencias: string[]; verificado_por: string } {
  const activas = configuradas.filter((d) => d.activa);
  if (activas.length === 0) throw new ApiError(409, 'El administrador no ha activado ninguna dependencia para el paz y salvo (Firmas y sellos).');
  const desconocidas = confirmadas.filter((c) => !configuradas.some((d) => d.clave === c));
  if (desconocidas.length > 0) throw new ApiError(400, 'Hay dependencias que no existen en la configuración del paz y salvo.');
  const faltan = activas.filter((d) => !confirmadas.includes(d.clave));
  if (faltan.length > 0) throw new ApiError(409, `Falta confirmar que no hay pendientes en: ${faltan.map((d) => d.nombre).join(', ')}.`);
  return { dependencias: activas.map((d) => d.nombre), verificado_por: `${usuario.nombre} ${usuario.apellido}` };
}

/** El responsable legal de la matrícula (M03): quien está marcado como principal. */
async function acudientePrincipal(studentId: Types.ObjectId): Promise<SnapshotCertificado['acudiente']> {
  const vinculo = await StudentGuardian.findOne({ student_id: studentId, es_principal: true }).populate<{
    guardian_id: { nombre: string; apellido: string; tipo_documento: string; numero_documento: string } | null;
  }>('guardian_id', 'nombre apellido tipo_documento numero_documento');
  const g = vinculo?.guardian_id;
  return g ? { nombre: `${g.nombre} ${g.apellido}`, tipo_documento: g.tipo_documento, numero_documento: g.numero_documento, parentesco: vinculo.parentesco } : null;
}

async function prepararDocumento(entrada: EntradaExpedicion, usuario: UserDocument): Promise<{ def: DefinicionCertificado; matricula: MatriculaCompleta; snapshot: SnapshotCertificado }> {
  exigirSecretaria(usuario);
  const def = definicionCertificado(entrada.tipo);
  const matricula = await cargarMatricula(entrada.enrollment_id);
  if (!puedeVerSede(usuario, matricula.group_id.sede_id._id)) throw new ApiError(404, 'Matrícula no encontrada.');
  if (!def.estados_matricula.includes(matricula.estado)) {
    throw new ApiError(409, `«${def.nombre}» no se puede expedir con la matrícula en estado ${matricula.estado}.`);
  }

  const [institucion, config] = await Promise.all([Institution.findOne(), obtenerConfiguracion()]);
  if (!institucion) throw new ApiError(409, 'Configura primero la institución antes de expedir certificados.');

  const { aplicados, errores } = resolverElementos(entradaDeElementos(config, def.clave, usuario, await presenciaDeImagenes(config)), entrada.firmas ?? {});
  if (errores.length > 0) throw new ApiError(409, errores.join(' '));

  const plantilla = await plantillaVigente(def.clave);
  const destino = resolverDestinatario({ nombre: def.nombre, destinatarios: plantilla.destinatarios, frase_otro: plantilla.frase_otro }, entrada.destinatario);
  if ('error' in destino) throw new ApiError(400, destino.error);

  const pazYSalvo = def.clave === 'PAZ_SALVO' ? dependenciasConfirmadas(config.paz_y_salvo.dependencias, entrada.dependencias ?? [], usuario) : undefined;
  const estudios = def.clave === 'CERTIFICADO_ESTUDIOS' ? { ...(await datosDeEstudios(matricula, usuario)), promocion: await obtenerPromocion(String(matricula._id)) } : undefined;

  const [perfil, acudiente] = await Promise.all([
    StudentProfile.findOne({ user_id: matricula.student_id._id }).select('lugar_expedicion'),
    def.clave === 'CERTIFICADO_MATRICULA' ? acudientePrincipal(matricula.student_id._id) : null,
  ]);

  const nombres = async (id: Types.ObjectId | null) => {
    const u = id ? await User.findById(id).select('nombre apellido') : null;
    return u ? `${u.nombre} ${u.apellido}` : null;
  };
  const [nombreRector, nombreSecretaria] = await Promise.all([nombres(config.rectoria.usuario_id), nombres(config.secretaria.usuario_id)]);

  const grupo = matricula.group_id;
  const anio = matricula.academic_year_id.year;
  const snapshot: SnapshotCertificado = {
    version_formato: 1,
    tipo: def.clave,
    encabezado: {
      institucion: institucion.nombre,
      codigo_dane: institucion.codigo_dane,
      nit: institucion.nit,
      resolucion_aprobacion: institucion.resolucion_aprobacion,
      sede: grupo.sede_id.nombre,
      jornada: grupo.jornada_id.nombre,
      anio,
      ciudad: institucion.ciudad,
      departamento: institucion.departamento,
      escudo: await congelarEscudo(institucion.logo_url),
    },
    estudiante: {
      nombre: matricula.student_id.nombre,
      apellido: matricula.student_id.apellido,
      tipo_documento: matricula.student_id.tipo_documento,
      numero_documento: matricula.student_id.numero_documento,
      lugar_expedicion: perfil?.lugar_expedicion ?? null,
    },
    acudiente,
    matricula: {
      estado: matricula.estado,
      grado: grupo.grade_id.nombre,
      grupo: grupo.nomenclatura,
      anio,
      folio_matricula: matricula.folio_matricula,
      numero_libro: matricula.numero_libro,
      numero_folio: matricula.numero_folio,
      fecha_matricula: matricula.fecha_matricula.toISOString(),
      nivel: grupo.grade_id.nivel,
      tipo_ingreso: matricula.tipo_ingreso,
      horario: { inicio: grupo.jornada_id.hora_inicio, fin: grupo.jornada_id.hora_fin },
    },
    destinatario: destino.etiqueta,
    destino: { clave: destino.clave, frase: destino.frase },
    fecha_expedicion: new Date().toISOString(),
    paz_y_salvo: pazYSalvo,
    estudios,
    firmas: {
      rectoria: { aplicada: aplicados.rectoria, nombre: nombreRector, cargo: config.rectoria.cargo, usuario_id: config.rectoria.usuario_id ? String(config.rectoria.usuario_id) : null, imagen: aplicados.rectoria ? config.rectoria.imagen : null },
      secretaria: { aplicada: aplicados.secretaria, nombre: nombreSecretaria, cargo: config.secretaria.cargo, usuario_id: config.secretaria.usuario_id ? String(config.secretaria.usuario_id) : null, imagen: aplicados.secretaria ? config.secretaria.imagen : null },
      sello: { aplicado: aplicados.sello, imagen: aplicados.sello ? config.sello.imagen : null },
    },
  };
  // El texto sale de la plantilla vigente y se congela ya resuelto: editarla después no cambia lo expedido.
  snapshot.contenido = resolverContenido(snapshot, plantilla);
  return { def, matricula, snapshot: JSON.parse(JSON.stringify(snapshot)) as SnapshotCertificado };
}

/** El snapshot de una vista previa: lo mismo que se expedirá, sin consecutivo, huella ni registro. */
export async function prepararVistaPrevia(entrada: EntradaExpedicion, usuario: UserDocument): Promise<SnapshotCertificado> {
  return (await prepararDocumento(entrada, usuario)).snapshot;
}

// --- Expedir ---

export async function expedirCertificado(entrada: EntradaExpedicion, usuario: UserDocument, ip?: string | null): Promise<CertificadoEmitidoDocument> {
  const clave = claveDeHuella();
  const { def, matricula, snapshot } = await prepararDocumento(entrada, usuario);
  // Lo expedido se congela: con un dato ausente no se emite un documento oficial (habría que anularlo para corregirlo).
  if (def.requiere?.includes('PROMOCION') && !snapshot.estudios?.promocion) throw new ApiError(409, MOTIVO_SIN_PROMOCION.replace('Solo vista previa: falta', 'No se puede expedir como oficial: falta'));
  if (def.clave === 'CERTIFICADO_ESTUDIOS' && !snapshot.estudios?.completo) throw new ApiError(409, 'Hay asignaturas con periodos sin cerrar: el certificado de estudio solo se expide con las valoraciones completas.');
  const anio = new Date().getFullYear();

  const certificado = await runTransaction(async (session) => {
    const contador = await Counter.findByIdAndUpdate(`CERT-${def.prefijo}-${anio}`, { $inc: { seq: 1 } }, { new: true, upsert: true, session });
    const consecutivo = contador?.seq ?? 0;
    const codigo = codigoDeCertificado(def.clave, anio, consecutivo);
    const [creado] = await CertificadoEmitido.create(
      [
        {
          tipo: def.clave,
          codigo,
          consecutivo,
          anio_emision: anio,
          student_id: matricula.student_id._id,
          sede_id: matricula.group_id.sede_id._id,
          enrollment_id: matricula._id,
          academic_year_id: matricula.academic_year_id._id,
          snapshot,
          hash: huellaDeCertificado(clave, { tipo: def.clave, codigo, snapshot }),
          token_verificacion: generarTokenVerificacion(),
          emitido_por: usuario._id,
          fecha_emision: new Date(snapshot.fecha_expedicion),
        },
      ],
      { session }
    );
    if (!creado) throw new ApiError(500, 'No se pudo expedir el documento.');
    return creado;
  });
  const usadas = ['rectoria', 'secretaria'].filter((e) => snapshot.firmas[e as 'rectoria' | 'secretaria'].aplicada).concat(snapshot.firmas.sello.aplicado ? ['sello'] : []);
  await registrarEvento({ usuario_id: usuario._id, accion: 'CERTIFICADO_EMITIDO', entidad: 'CertificadoEmitido', entidad_id: certificado._id, detalle: `${certificado.codigo}; estampado: ${usadas.join(', ') || 'ninguno'}`, ip });
  return certificado;
}

// --- Consultar ---

export const vistaCertificado = (c: CertificadoEmitidoDocument, extra: { estudiante?: string; documento?: string; emitido_por?: string } = {}) => {
  const s = c.snapshot as SnapshotCertificado;
  return {
    _id: String(c._id),
    tipo: c.tipo,
    nombre_tipo: definicionCertificado(c.tipo).nombre,
    codigo: c.codigo,
    estado: c.estado,
    student_id: String(c.student_id),
    estudiante: extra.estudiante ?? `${s.estudiante.apellido} ${s.estudiante.nombre}`,
    documento: extra.documento ?? s.estudiante.numero_documento,
    grado: s.matricula.grado,
    anio: s.matricula.anio,
    destinatario: s.destinatario,
    firmas: { rectoria: s.firmas.rectoria.aplicada, secretaria: s.firmas.secretaria.aplicada, sello: s.firmas.sello.aplicado },
    fecha_emision: c.fecha_emision,
    emitido_por: extra.emitido_por ?? null,
    huella: claveCorta(c.hash),
    anulacion: c.anulacion ? { fecha: c.anulacion.fecha, motivo: c.anulacion.motivo } : null,
  };
};

export interface FiltroCertificados {
  student_id?: string;
  tipo?: ClaveCertificado;
  estado?: 'VIGENTE' | 'ANULADO';
  pagina: number;
  limite: number;
}

export async function listarCertificados(filtro: FiltroCertificados, usuario: UserDocument) {
  exigirSecretaria(usuario);
  const consulta: Record<string, unknown> = {};
  if (usuario.rol !== ROLES.ADMIN) consulta.sede_id = { $in: usuario.sedes_ids ?? [] };
  if (filtro.student_id) consulta.student_id = filtro.student_id;
  if (filtro.tipo) consulta.tipo = filtro.tipo;
  if (filtro.estado) consulta.estado = filtro.estado;
  const [total, filas] = await Promise.all([
    CertificadoEmitido.countDocuments(consulta),
    CertificadoEmitido.find(consulta)
      .sort({ fecha_emision: -1 })
      .skip((filtro.pagina - 1) * filtro.limite)
      .limit(filtro.limite),
  ]);
  const usuarios = await User.find({ _id: { $in: filas.map((f) => f.emitido_por) } }).select('nombre apellido');
  const nombre = new Map(usuarios.map((u) => [String(u._id), `${u.nombre} ${u.apellido}`]));
  return {
    data: filas.map((c) => vistaCertificado(c, { emitido_por: nombre.get(String(c.emitido_por)) })),
    total,
    page: filtro.pagina,
    pages: Math.max(1, Math.ceil(total / filtro.limite)),
  };
}

export async function cargarCertificado(id: string, usuario: UserDocument): Promise<CertificadoEmitidoDocument> {
  exigirSecretaria(usuario);
  const certificado = Types.ObjectId.isValid(id) ? await CertificadoEmitido.findById(id) : null;
  // «No existe» y «no es de tu sede» responden igual.
  if (!certificado || !puedeVerSede(usuario, certificado.sede_id)) throw noEncontrado();
  return certificado;
}

export const huellaActual = (c: Pick<CertificadoEmitidoDocument, 'tipo' | 'codigo' | 'snapshot'>): string => huellaDeCertificado(claveDeHuella(), c);

/** Recalcula la huella con el secreto del servidor y la compara con la sellada al expedir. */
export async function verificarIntegridad(id: string, usuario: UserDocument) {
  const certificado = await cargarCertificado(id, usuario);
  const actual = huellaActual(certificado);
  return { codigo: certificado.codigo, estado: certificado.estado, integro: actual === certificado.hash };
}

export async function anularCertificado(id: string, motivo: string, usuario: UserDocument, ip?: string | null) {
  if (usuario.rol !== ROLES.ADMIN) throw new ApiError(403, 'Solo el administrador anula certificados.');
  const certificado = await cargarCertificado(id, usuario);
  if (certificado.estado === 'ANULADO') throw new ApiError(409, 'El certificado ya está anulado.');
  const limpio = motivo.trim().slice(0, MAX_MOTIVO_ANULACION);
  if (!limpio) throw new ApiError(400, 'El motivo de la anulación es obligatorio.');
  certificado.estado = 'ANULADO';
  certificado.anulacion = { por: usuario._id, fecha: new Date(), motivo: limpio };
  await certificado.save();
  // El detalle de la auditoría no lleva el motivo: queda en el registro.
  await registrarEvento({ usuario_id: usuario._id, accion: 'CERTIFICADO_ANULADO', entidad: 'CertificadoEmitido', entidad_id: certificado._id, detalle: certificado.codigo, ip });
  return vistaCertificado(certificado);
}
