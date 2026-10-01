import fs from 'fs/promises';
import path from 'path';
import { EstadoDocumentoMatricula, EstadoMatricula, TipoDocumentoMatricula } from '../constants/enums';
import { NOMBRES_DOCUMENTO_MATRICULA } from '../constants/matriculaChecklist';
import AdmissionRequest from '../models/admissionRequest.model';
import Enrollment, { EnrollmentDocument } from '../models/enrollment.model';
import ApiError from '../utils/ApiError';
import { finDelDia } from '../utils/calendarioAcademico';
import { detectarFirmaArchivo } from '../utils/firmasArchivo';
import { carpetaMatricula } from '../utils/uploadPaths';
import { cargarDocumento } from './enrollment.service';

/**
 * Preinscripcion vista por el acudiente desde el sitio publico (M04/M29).
 * No hay sesion: cada operacion se autoriza con el documento del aspirante y su
 * fecha de nacimiento, igual que la consulta de estado de la solicitud.
 */

// Con la matricula en estos estados aun faltan documentos por entregar.
const ESTADOS_QUE_ADMITEN_DOCUMENTOS: EstadoMatricula[] = ['PREINSCRITO', 'MATRICULADO_CONDICIONAL'];

export interface DocumentoPreinscripcion {
  tipo_documento: TipoDocumentoMatricula;
  nombre: string;
  estado: EstadoDocumentoMatricula;
  /** Motivo del rechazo, para que el acudiente sepa que corregir. */
  comentario: string | null;
}

export interface PreinscripcionDetalle {
  grado: string;
  grupo: string;
  sede: string;
  jornada: string;
  fecha_limite_legalizacion: Date | null;
  plazo_vencido: boolean;
  matricula_estado: EstadoMatricula;
  folio_matricula: string | null;
  documentos: DocumentoPreinscripcion[];
  puede_subir_documentos: boolean;
}

interface GrupoPoblado {
  nomenclatura: string;
  grade_id?: { nombre: string };
  sede_id?: { nombre: string };
  jornada_id?: { nombre: string };
}

export function construirDetalle(enrollment: EnrollmentDocument): PreinscripcionDetalle {
  const grupo = enrollment.group_id as unknown as GrupoPoblado;
  const limite = enrollment.fecha_limite_legalizacion;

  return {
    grado: grupo.grade_id?.nombre ?? '—',
    grupo: grupo.nomenclatura,
    sede: grupo.sede_id?.nombre ?? '—',
    jornada: grupo.jornada_id?.nombre ?? '—',
    fecha_limite_legalizacion: limite,
    plazo_vencido: Boolean(limite) && enrollment.estado === 'PREINSCRITO' && Date.now() > finDelDia(limite as Date).getTime(),
    matricula_estado: enrollment.estado,
    folio_matricula: enrollment.folio_matricula,
    documentos: enrollment.checklist.map((c) => ({
      tipo_documento: c.tipo_documento,
      nombre: NOMBRES_DOCUMENTO_MATRICULA[c.tipo_documento],
      estado: c.estado,
      comentario: c.estado === 'RECHAZADO' ? c.comentario : null,
    })),
    puede_subir_documentos: ESTADOS_QUE_ADMITEN_DOCUMENTOS.includes(enrollment.estado),
  };
}

/** Matricula del aspirante con grupo/grado/sede/jornada poblados; null si su solicitud no esta aprobada. */
export async function buscarMatriculaDePreinscripcion(numeroDocumento: string, fechaNacimiento: string) {
  const solicitud = await AdmissionRequest.findOne({
    numero_documento: numeroDocumento,
    fecha_nacimiento: new Date(fechaNacimiento),
  }).sort({ createdAt: -1 });
  if (!solicitud || solicitud.estado !== 'APROBADA' || !solicitud.enrollment_id) return null;

  const enrollment = await Enrollment.findById(solicitud.enrollment_id).populate({
    path: 'group_id',
    populate: [
      { path: 'grade_id', select: 'nombre' },
      { path: 'sede_id', select: 'nombre' },
      { path: 'jornada_id', select: 'nombre' },
    ],
  });
  if (!enrollment) return null;
  return { solicitud, enrollment };
}

async function exigirMatricula(numeroDocumento: string, fechaNacimiento: string) {
  const encontrada = await buscarMatriculaDePreinscripcion(numeroDocumento, fechaNacimiento);
  if (!encontrada) throw new ApiError(404, 'No encontramos una preinscripción aprobada con esos datos.');
  return encontrada;
}

export async function subirDocumento(
  numeroDocumento: string,
  fechaNacimiento: string,
  tipoDocumento: TipoDocumentoMatricula,
  archivo: { buffer: Buffer; mimetype: string }
): Promise<PreinscripcionDetalle> {
  const { enrollment } = await exigirMatricula(numeroDocumento, fechaNacimiento);

  if (!ESTADOS_QUE_ADMITEN_DOCUMENTOS.includes(enrollment.estado)) {
    throw new ApiError(409, 'La matrícula ya no admite carga de documentos.');
  }
  const item = enrollment.checklist.find((c) => c.tipo_documento === tipoDocumento);
  if (!item) throw new ApiError(400, 'Ese documento no aplica para el grado del aspirante.');
  if (item.estado === 'APROBADO') throw new ApiError(409, 'Este documento ya fue aprobado por la secretaría.');

  const firma = detectarFirmaArchivo(archivo.mimetype, archivo.buffer);
  if (!firma) throw new ApiError(400, 'El archivo no es un PDF, JPG, PNG o WEBP válido.');

  const carpeta = carpetaMatricula(String(enrollment._id));
  await fs.mkdir(carpeta, { recursive: true });
  const destino = path.join(carpeta, `${tipoDocumento}-${Date.now()}${firma.ext}`);
  await fs.writeFile(destino, archivo.buffer);

  const actualizada = await cargarDocumento(String(enrollment._id), tipoDocumento, path.relative(process.cwd(), destino), {
    id: null,
  });
  // cargarDocumento devuelve la matricula sin poblar: se reutiliza el grupo ya poblado.
  actualizada.group_id = enrollment.group_id;
  return construirDetalle(actualizada);
}
