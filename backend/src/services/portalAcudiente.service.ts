import { Types } from 'mongoose';
import { EstadoMatricula, TipoDocumentoMatricula } from '../constants/enums';
import { ESTADOS_MATRICULA_EXPEDIBLES, MAX_CERTIFICADOS_AUTOSERVICIO_POR_DIA } from '../constants/certificados';
import { INDICACIONES_DOCUMENTO_MATRICULA } from '../constants/matriculaChecklist';
import AcademicYear from '../models/academicYear.model';
import CertificadoEmitido from '../models/certificadoEmitido.model';
import Enrollment from '../models/enrollment.model';
import Guardian, { GuardianDocument } from '../models/guardian.model';
import StudentGuardian from '../models/studentGuardian.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { opcionesDeDestinatario } from '../utils/certificados';
import { documentosObligatoriosPendientes } from '../utils/documentosMatricula';
import { matriculaVigente } from '../utils/portalAcudiente';
import { listarInasistencias } from './attendance.service';
import { expedirCertificado, vistaCertificado, vistaCompleta } from './certificado.service';
import { dibujarCertificadoEmitido } from './certificadoPdf.service';
import { plantillaVigente } from './certificadoPlantilla.service';
import { guardarArchivoDeDocumento } from './documentoMatriculaArchivo.service';
import { cargarDocumento } from './enrollment.service';
import { misNotas } from './notasEstudiante.service';
import { observadorDelEstudianteParaAcudiente } from './observacion.service';
import { ESTADOS_QUE_ADMITEN_DOCUMENTOS, construirDetalle } from './preinscripcionPublica.service';
import { nombresDeTipos, tipoPorClave, tiposActivos } from './tipoCertificado.service';

/**
 * Portal del acudiente (M27). No guarda nada propio: junta lo que otros módulos son dueños de guardar, siempre para UN estudiante a la vez
 * (el que el acudiente eligió en el selector) y solo si está vinculado a él en M03 (`StudentGuardian`). Las reglas de cada dato no se
 * repiten aquí: notas (M12), inasistencias (M13), observador (M14), documentos de matrícula (M04) y certificados (M26).
 */

const noEncontrado = () => new ApiError(404, 'Estudiante no encontrado.');

/** El acudiente activo (M03) al que se le habilitó este usuario para el portal. */
async function acudienteDelUsuario(usuario: UserDocument): Promise<GuardianDocument> {
  const guardian = await Guardian.findOne({ user_id: usuario._id, estado: { $ne: 'inactivo' } });
  if (!guardian) throw new ApiError(403, 'Tu usuario no está vinculado a un acudiente activo. Pide a secretaría que revise tu registro.');
  return guardian;
}

/**
 * Comprueba que el estudiante es hijo (o acudido) de quien consulta. «No existe» y «no es tuyo» responden igual (404): el portal no
 * confirma que un documento de identidad o un id pertenece a un estudiante ajeno.
 */
export async function exigirAcudienteDe(usuario: UserDocument, studentId: string): Promise<{ guardian: GuardianDocument; estudiante: UserDocument }> {
  if (!Types.ObjectId.isValid(studentId)) throw noEncontrado();
  const guardian = await acudienteDelUsuario(usuario);
  const vinculo = await StudentGuardian.exists({ guardian_id: guardian._id, student_id: studentId });
  const estudiante = vinculo ? await User.findById(studentId) : null;
  if (!estudiante) throw noEncontrado();
  return { guardian, estudiante };
}

export interface HijoDelPortal {
  student_id: string;
  nombre: string;
  apellido: string;
  numero_documento: string;
  parentesco: string;
  es_principal: boolean;
  matricula: {
    enrollment_id: string;
    estado: EstadoMatricula;
    anio: number;
    grado: string;
    grupo: string;
    sede: string;
    jornada: string;
  } | null;
  /** Documentos obligatorios de la matrícula que aún no están aprobados (solo mientras la matrícula admite cargarlos). */
  documentos_pendientes: number;
}

interface GrupoConDetalle {
  nomenclatura: string;
  grade_id?: { nombre: string };
  sede_id?: { nombre: string };
  jornada_id?: { nombre: string };
}

/** Los estudiantes a cargo del acudiente: lo que alimenta el selector global del portal. */
export async function listarHijos(usuario: UserDocument): Promise<HijoDelPortal[]> {
  const guardian = await acudienteDelUsuario(usuario);
  const vinculos = await StudentGuardian.find({ guardian_id: guardian._id }).populate<{
    student_id: { _id: Types.ObjectId; nombre: string; apellido: string; numero_documento: string } | null;
  }>('student_id', 'nombre apellido numero_documento');
  const ids = vinculos.flatMap((v) => (v.student_id ? [v.student_id._id] : []));

  const matriculas = await Enrollment.find({ student_id: { $in: ids } })
    .sort({ createdAt: -1 })
    .populate({
      path: 'group_id',
      populate: [
        { path: 'grade_id', select: 'nombre' },
        { path: 'sede_id', select: 'nombre' },
        { path: 'jornada_id', select: 'nombre' },
      ],
    })
    .populate<{ academic_year_id: { year: number } }>('academic_year_id', 'year');

  const hijos = vinculos.flatMap((v): HijoDelPortal[] => {
    const est = v.student_id;
    if (!est) return [];
    const propias = matriculas.filter((m) => String(m.student_id) === String(est._id));
    const m = matriculaVigente(propias);
    const grupo = m ? (m.group_id as unknown as GrupoConDetalle) : null;
    return [
      {
        student_id: String(est._id),
        nombre: est.nombre,
        apellido: est.apellido,
        numero_documento: est.numero_documento,
        parentesco: v.parentesco,
        es_principal: v.es_principal,
        matricula:
          m && grupo
            ? {
                enrollment_id: String(m._id),
                estado: m.estado,
                anio: (m.academic_year_id as unknown as { year: number }).year,
                grado: grupo.grade_id?.nombre ?? '—',
                grupo: grupo.nomenclatura,
                sede: grupo.sede_id?.nombre ?? '—',
                jornada: grupo.jornada_id?.nombre ?? '—',
              }
            : null,
        documentos_pendientes: m && ESTADOS_QUE_ADMITEN_DOCUMENTOS.includes(m.estado) ? documentosObligatoriosPendientes(m.checklist).length : 0,
      },
    ];
  });
  return hijos.sort((a, b) => `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`, 'es'));
}

// --- Notas, inasistencias y convivencia ---

export async function notasDelHijo(usuario: UserDocument, studentId: string, periodoNumero: number, academicYearId?: string) {
  const { estudiante } = await exigirAcudienteDe(usuario, studentId);
  return misNotas(estudiante, periodoNumero, academicYearId);
}

/** El año que se muestra si el acudiente no elige otro: la vigencia activa o, si no hay, el más reciente sin cerrar. */
async function anioPorDefecto(academicYearId?: string) {
  const anio = academicYearId
    ? await AcademicYear.findById(academicYearId)
    : ((await AcademicYear.findOne({ estado: 'EN_CURSO' })) ?? (await AcademicYear.findOne({ estado: { $ne: 'CERRADO' } }).sort({ year: -1, createdAt: -1 })));
  if (!anio) throw new ApiError(academicYearId ? 404 : 409, academicYearId ? 'Año lectivo no encontrado.' : 'No hay un año lectivo en curso.');
  return anio;
}

export async function inasistenciasDelHijo(usuario: UserDocument, studentId: string, periodoNumero?: number, academicYearId?: string) {
  const { estudiante } = await exigirAcudienteDe(usuario, studentId);
  const anio = await anioPorDefecto(academicYearId);
  const filas = await listarInasistencias(
    { student_id: String(estudiante._id), academic_year_id: String(anio._id), ...(periodoNumero ? { periodo_numero: periodoNumero } : {}) },
    usuario
  );
  // Una falla cuenta como justificada si su estado ya lo es o si tiene una excusa aprobada (misma regla que las estadísticas de M13).
  const justificada = (f: (typeof filas)[number]) => f.estado.es_justificada || f.justificacion?.estado === 'APROBADA';
  return {
    anio: anio.year,
    resumen: {
      total: filas.length,
      justificadas: filas.filter(justificada).length,
      injustificadas: filas.filter((f) => !justificada(f)).length,
    },
    data: filas,
  };
}

export async function convivenciaDelHijo(usuario: UserDocument, studentId: string, ip?: string | null) {
  const { estudiante } = await exigirAcudienteDe(usuario, studentId);
  return observadorDelEstudianteParaAcudiente(estudiante._id, usuario, ip);
}

// --- Documentos de matrícula (M04) ---

async function matriculaDocumentalDe(studentId: Types.ObjectId | string) {
  const matriculas = await Enrollment.find({ student_id: studentId })
    .sort({ createdAt: -1 })
    .populate({
      path: 'group_id',
      populate: [
        { path: 'grade_id', select: 'nombre' },
        { path: 'sede_id', select: 'nombre' },
        { path: 'jornada_id', select: 'nombre' },
      ],
    });
  // Primero la que aún recibe documentos; si no hay, la vigente (solo lectura).
  return matriculas.find((m) => ESTADOS_QUE_ADMITEN_DOCUMENTOS.includes(m.estado)) ?? matriculaVigente(matriculas);
}

export async function documentosDelHijo(usuario: UserDocument, studentId: string) {
  const { estudiante } = await exigirAcudienteDe(usuario, studentId);
  const matricula = await matriculaDocumentalDe(estudiante._id);
  if (!matricula) return null;
  const detalle = construirDetalle(matricula);
  return {
    enrollment_id: String(matricula._id),
    ...detalle,
    documentos: detalle.documentos.map((d) => {
      const item = matricula.checklist.find((c) => c.tipo_documento === d.tipo_documento);
      return {
        ...d,
        indicacion: item?.indicacion || INDICACIONES_DOCUMENTO_MATRICULA[d.tipo_documento] || '',
        fecha_carga: item?.fecha_carga ?? null,
        // Aprobado no se reemplaza; el resto se puede (re)enviar mientras la matrícula siga pidiendo documentos.
        puede_subir: detalle.puede_subir_documentos && d.estado !== 'APROBADO',
      };
    }),
    pendientes: documentosObligatoriosPendientes(matricula.checklist).length,
  };
}

/**
 * El acudiente sube un documento desde su portal. Mismas reglas que la carga del sitio público: la matrícula debe seguir admitiendo
 * documentos, uno aprobado no se reemplaza y el contenido se confirma por firma de bytes. Queda CARGADO: aparece en la bandeja
 * «Documentos por revisar» de secretaría, que lo aprueba o lo rechaza con motivo (M04).
 */
export async function subirDocumentoDelHijo(
  usuario: UserDocument,
  studentId: string,
  tipoDocumento: TipoDocumentoMatricula,
  archivo: { buffer: Buffer; mimetype: string }
) {
  const { estudiante } = await exigirAcudienteDe(usuario, studentId);
  const matricula = await matriculaDocumentalDe(estudiante._id);
  if (!matricula) throw new ApiError(404, 'El estudiante no tiene una matrícula en proceso.');
  if (!ESTADOS_QUE_ADMITEN_DOCUMENTOS.includes(matricula.estado)) throw new ApiError(409, 'La matrícula ya no admite carga de documentos.');
  const item = matricula.checklist.find((c) => c.tipo_documento === tipoDocumento);
  if (!item) throw new ApiError(400, 'Ese documento no aplica para el grado del estudiante.');
  if (item.estado === 'APROBADO') throw new ApiError(409, 'Este documento ya fue aprobado por la secretaría.');

  const archivoPath = await guardarArchivoDeDocumento(String(matricula._id), tipoDocumento, archivo);
  await cargarDocumento(String(matricula._id), tipoDocumento, archivoPath, { id: usuario._id, tipo: 'FAMILIA' });
  return documentosDelHijo(usuario, studentId);
}

// --- Certificados de autoservicio (M26) ---

const HACE_24_HORAS = () => new Date(Date.now() - 24 * 60 * 60 * 1000);

/** La matrícula más reciente con la que el tipo se puede expedir (según los estados que el colegio le permitió). */
async function matriculaParaTipo(studentId: Types.ObjectId, estadosDelTipo: EstadoMatricula[]) {
  const permitidos = estadosDelTipo.filter((e) => ESTADOS_MATRICULA_EXPEDIBLES.includes(e));
  return Enrollment.findOne({ student_id: studentId, estado: { $in: permitidos } }).sort({ createdAt: -1 });
}

const vistaParaFamilia = (c: ReturnType<typeof vistaCertificado>) => ({
  _id: c._id,
  tipo: c.tipo,
  nombre_tipo: c.nombre_tipo,
  codigo: c.codigo,
  estado: c.estado,
  grado: c.grado,
  anio: c.anio,
  destinatario: c.destinatario,
  fecha_emision: c.fecha_emision,
});

export async function certificadosDelHijo(usuario: UserDocument, studentId: string) {
  const { estudiante } = await exigirAcudienteDe(usuario, studentId);
  const tipos = (await tiposActivos()).filter((t) => t.autoservicio_acudiente);
  const recientes = await CertificadoEmitido.find({ student_id: estudiante._id, emitido_por: usuario._id, fecha_emision: { $gte: HACE_24_HORAS() } }).select('tipo');

  const disponibles = await Promise.all(
    tipos.map(async (t) => {
      const [matricula, plantilla] = await Promise.all([matriculaParaTipo(estudiante._id, t.estados_matricula), plantillaVigente(t.clave)]);
      const usados = recientes.filter((r) => r.tipo === t.clave).length;
      let motivo: string | null = null;
      if (!matricula) motivo = 'El estudiante no tiene una matrícula con la que se pueda expedir este documento.';
      else if (usados >= MAX_CERTIFICADOS_AUTOSERVICIO_POR_DIA) motivo = `Ya generaste ${MAX_CERTIFICADOS_AUTOSERVICIO_POR_DIA} en las últimas 24 horas: descarga uno de tu historial.`;
      return {
        clave: t.clave,
        nombre: t.nombre,
        descripcion: t.descripcion,
        // Solo clave y etiqueta: las opciones que toman la EPS u otro dato sensible las resuelve el servidor, no se ofrecen en el portal.
        destinatarios: opcionesDeDestinatario(plantilla as unknown as { destinatarios: Array<{ clave: string; etiqueta: string; frase: string }> })
          .filter((o) => !o.fuente_entidad)
          .map((o) => ({ clave: o.clave, etiqueta: o.etiqueta })),
        disponible: motivo === null,
        motivo,
      };
    })
  );

  const emitidos = await CertificadoEmitido.find({ student_id: estudiante._id }).sort({ fecha_emision: -1 }).limit(50);
  const nombres = await nombresDeTipos(emitidos.map((c) => c.tipo));
  return {
    tipos: disponibles,
    emitidos: emitidos.map((c) => vistaParaFamilia(vistaCertificado(c, { nombre_tipo: nombres.get(c.tipo) }))),
  };
}

export interface EntradaCertificadoDelHijo {
  tipo: string;
  destinatario?: { clave: string; otro?: string | null } | null;
}

/**
 * Genera el certificado al instante, sin que secretaría intervenga: usa el mismo motor del M26 (plantilla vigente, consecutivo sin
 * huecos, QR y huella), con el acudiente como solicitante. Solo vale para los tipos que el ADMIN marcó de autoservicio.
 */
export async function generarCertificadoDelHijo(usuario: UserDocument, studentId: string, entrada: EntradaCertificadoDelHijo, ip?: string | null) {
  const { guardian, estudiante } = await exigirAcudienteDe(usuario, studentId);
  const def = await tipoPorClave(entrada.tipo);
  if (!def.autoservicio_acudiente) throw new ApiError(403, `«${def.nombre}» no se genera desde el portal: solicítalo en secretaría.`);
  const matricula = await matriculaParaTipo(estudiante._id, def.estados_matricula);
  if (!matricula) throw new ApiError(409, `«${def.nombre}» no se puede expedir con la matrícula actual del estudiante.`);

  const usados = await CertificadoEmitido.countDocuments({ student_id: estudiante._id, tipo: def.clave, emitido_por: usuario._id, fecha_emision: { $gte: HACE_24_HORAS() } });
  if (usados >= MAX_CERTIFICADOS_AUTOSERVICIO_POR_DIA) {
    throw new ApiError(429, `Ya generaste ${MAX_CERTIFICADOS_AUTOSERVICIO_POR_DIA} documentos de este tipo en las últimas 24 horas: descarga uno de tu historial.`);
  }

  const certificado = await expedirCertificado(
    { enrollment_id: String(matricula._id), tipo: def.clave, destinatario: entrada.destinatario ?? null, solicitante: { tipo: 'ACUDIENTE', guardian_id: String(guardian._id) } },
    usuario,
    ip,
    true
  );
  return vistaParaFamilia(await vistaCompleta(certificado));
}

export async function pdfDelCertificadoDelHijo(usuario: UserDocument, studentId: string, certificadoId: string, urlBase: string, ip?: string | null) {
  const { estudiante } = await exigirAcudienteDe(usuario, studentId);
  const certificado = Types.ObjectId.isValid(certificadoId) ? await CertificadoEmitido.findOne({ _id: certificadoId, student_id: estudiante._id }) : null;
  if (!certificado) throw new ApiError(404, 'Documento no encontrado.');
  return dibujarCertificadoEmitido(certificado, urlBase, usuario, ip);
}
