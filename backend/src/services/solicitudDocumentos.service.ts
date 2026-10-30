import fs from 'fs/promises';
import path from 'path';
import { Types } from 'mongoose';
import AdmissionRequest, { AdmissionRequestDocument } from '../models/admissionRequest.model';
import Grade from '../models/grade.model';
import ApiError from '../utils/ApiError';
import { detectarFirmaArchivo } from '../utils/firmasArchivo';
import { carpetaSolicitud } from '../utils/uploadPaths';
import { registrarEvento } from './audit.service';
import { generarChecklistDesdeCatalogo } from './requisitoDocumental.service';

/**
 * Documentos que se reciben con una solicitud de admisión, antes de que exista la matrícula (M04): la inscripción en el mostrador o pública trae, por ejemplo,
 * la identidad del estudiante y del acudiente y el boletín del grado anterior. Al aprobar la solicitud pasan al checklist de la matrícula como
 * CARGADO (por revisar), así no se vuelven a pedir. La API nunca devuelve la ruta del archivo: se baja con sesión por su propia ruta.
 */

// Una solicitud ya formalizada tiene matrícula (sus documentos se cargan ahí); una rechazada no recibe nada.
const ESTADOS_QUE_ADMITEN_DOCUMENTOS = ['PENDIENTE', 'ADMITIDO'];

async function cargarSolicitud(id: string): Promise<AdmissionRequestDocument> {
  const solicitud = await AdmissionRequest.findById(id);
  if (!solicitud) throw new ApiError(404, 'Solicitud no encontrada.');
  return solicitud;
}

function exigirQueAdmitaDocumentos(solicitud: AdmissionRequestDocument): void {
  if (!ESTADOS_QUE_ADMITEN_DOCUMENTOS.includes(solicitud.estado)) {
    throw new ApiError(409, 'La solicitud ya fue formalizada o rechazada: los documentos de una matriculada se cargan en su matrícula.');
  }
}

/** Las claves de los documentos que el catálogo le pide a un aspirante nuevo del grado de esta solicitud: solo esos se pueden recibir. */
export async function documentosQuePideLaSolicitud(solicitud: AdmissionRequestDocument): Promise<string[]> {
  const grado = await Grade.findById(solicitud.grado_deseado_id).select('nivel numero');
  if (!grado) throw new ApiError(404, 'El grado de la solicitud ya no existe.');
  const items = await generarChecklistDesdeCatalogo({
    nivel: grado.nivel,
    numeroGrado: grado.numero,
    tipoIngreso: 'NUEVO',
    parentescoAcudiente: solicitud.acudiente_parentesco ?? 'TUTOR_LEGAL',
  });
  return items.map((i) => i.tipo_documento);
}

const borrarSinRomper = async (ruta: string): Promise<void> => {
  try {
    await fs.unlink(path.resolve(process.cwd(), ruta));
  } catch {
    // Un archivo que ya no está en el disco no impide reemplazar o quitar el registro.
  }
};

/** Recibe un documento de la solicitud (o reemplaza el de ese tipo). El contenido se confirma por firma de bytes; la extensión sale de ella. */
export async function subirDocumentoDeSolicitud(
  solicitudId: string,
  tipoDocumento: string,
  archivo: { buffer: Buffer; mimetype: string; originalname?: string },
  usuario?: { id: Types.ObjectId | string } | null
): Promise<AdmissionRequestDocument> {
  const solicitud = await cargarSolicitud(solicitudId);
  exigirQueAdmitaDocumentos(solicitud);
  if (!(await documentosQuePideLaSolicitud(solicitud)).includes(tipoDocumento)) {
    throw new ApiError(400, 'Ese documento no se pide para el grado de esta solicitud.');
  }
  const firma = detectarFirmaArchivo(archivo.mimetype, archivo.buffer);
  if (!firma) throw new ApiError(400, 'El archivo no es un PDF, JPG, PNG o WEBP válido.');

  const carpeta = carpetaSolicitud(String(solicitud._id));
  await fs.mkdir(carpeta, { recursive: true });
  const destino = path.join(carpeta, `${tipoDocumento}-${Date.now()}${firma.ext}`);
  await fs.writeFile(destino, archivo.buffer);
  const ruta = path.relative(process.cwd(), destino);

  const anterior = solicitud.documentos.find((d) => d.tipo_documento === tipoDocumento);
  const rutaAnterior = anterior?.archivo_path;
  const nuevo = {
    tipo_documento: tipoDocumento,
    archivo_path: ruta,
    nombre_original: archivo.originalname || null,
    cargado_por: usuario?.id ? new Types.ObjectId(usuario.id) : null,
    fecha_carga: new Date(),
  };
  if (anterior) Object.assign(anterior, nuevo);
  else solicitud.documentos.push(nuevo);
  await solicitud.save();
  if (rutaAnterior && rutaAnterior !== ruta) await borrarSinRomper(rutaAnterior);

  if (usuario?.id) {
    await registrarEvento({ usuario_id: usuario.id, accion: 'SOLICITUD_DOCUMENTO_CARGADO', entidad: 'AdmissionRequest', entidad_id: solicitud._id, detalle: tipoDocumento });
  }
  return solicitud;
}

export async function quitarDocumentoDeSolicitud(solicitudId: string, tipoDocumento: string, usuario: { id: Types.ObjectId | string }): Promise<AdmissionRequestDocument> {
  const solicitud = await cargarSolicitud(solicitudId);
  exigirQueAdmitaDocumentos(solicitud);
  const indice = solicitud.documentos.findIndex((d) => d.tipo_documento === tipoDocumento);
  if (indice === -1) throw new ApiError(404, 'Ese documento no se ha recibido.');
  const [quitado] = solicitud.documentos.splice(indice, 1);
  await solicitud.save();
  if (quitado) await borrarSinRomper(quitado.archivo_path);
  await registrarEvento({ usuario_id: usuario.id, accion: 'SOLICITUD_DOCUMENTO_RETIRADO', entidad: 'AdmissionRequest', entidad_id: solicitud._id, detalle: tipoDocumento });
  return solicitud;
}

/** La ruta en el disco de un documento recibido, para servirlo con sesión. */
export async function rutaDeDocumentoDeSolicitud(solicitudId: string, tipoDocumento: string): Promise<string> {
  const solicitud = await cargarSolicitud(solicitudId);
  const documento = solicitud.documentos.find((d) => d.tipo_documento === tipoDocumento);
  if (!documento) throw new ApiError(404, 'Ese documento no se ha recibido.');
  return path.resolve(process.cwd(), documento.archivo_path);
}
