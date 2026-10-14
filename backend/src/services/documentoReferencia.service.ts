import fs from 'fs/promises';
import { Types } from 'mongoose';
import Area from '../models/area.model';
import DocumentoReferencia, { DocumentoReferenciaDocument } from '../models/documentoReferencia.model';
import Grade from '../models/grade.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { PdfSubido, borrarArchivo, guardarPdf, rutaAbsoluta } from '../utils/almacenPlaneacion';
import { carpetaDocumentoReferencia } from '../utils/uploadPaths';
import { registrarEvento } from './audit.service';

export interface DatosDocumentoReferencia {
  titulo: string;
  descripcion?: string;
  area_id: string;
  grados_ids: string[];
}

export type CambiosDocumentoReferencia = Partial<DatosDocumentoReferencia>;

export interface FiltroDocumentosReferencia {
  area_id?: string;
  grade_id?: string;
}

type DocumentoPoblado = Omit<DocumentoReferenciaDocument, 'area_id' | 'grados_ids' | 'subido_por'> & {
  area_id: { _id: Types.ObjectId; nombre: string; codigo: string } | null;
  grados_ids: Array<{ _id: Types.ObjectId; nombre: string; numero: number }>;
  subido_por: { _id: Types.ObjectId; nombre: string; apellido: string } | null;
};

/** La ruta del archivo nunca viaja: el PDF se baja por su endpoint, con sesión. */
function vistaDocumento(d: DocumentoPoblado) {
  return {
    _id: String(d._id),
    titulo: d.titulo,
    descripcion: d.descripcion,
    area: d.area_id ? { _id: String(d.area_id._id), nombre: d.area_id.nombre, codigo: d.area_id.codigo } : null,
    grados: d.grados_ids.map((g) => ({ _id: String(g._id), nombre: g.nombre, numero: g.numero })),
    archivo: { nombre: d.archivo.nombre, bytes: d.archivo.bytes },
    subido_por: d.subido_por ? { _id: String(d.subido_por._id), nombre: d.subido_por.nombre, apellido: d.subido_por.apellido } : null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

async function cargarVista(id: string | Types.ObjectId) {
  const documento = await DocumentoReferencia.findById(id)
    .populate('area_id', 'nombre codigo')
    .populate({ path: 'grados_ids', select: 'nombre numero', options: { sort: { numero: 1 } } })
    .populate('subido_por', 'nombre apellido');
  if (!documento) throw new ApiError(404, 'Documento de referencia no encontrado.');
  return vistaDocumento(documento as unknown as DocumentoPoblado);
}

async function exigirAreaYGrados(areaId: string, gradosIds: string[]): Promise<void> {
  const [area, grados] = await Promise.all([Area.exists({ _id: areaId }), Grade.countDocuments({ _id: { $in: gradosIds } })]);
  if (!area) throw new ApiError(400, 'El área indicada no existe.');
  if (grados !== new Set(gradosIds).size) throw new ApiError(400, 'Alguno de los grados indicados no existe.');
}

export async function listarDocumentosReferencia(filtro: FiltroDocumentosReferencia) {
  const consulta: Record<string, unknown> = {};
  if (filtro.area_id) consulta.area_id = filtro.area_id;
  if (filtro.grade_id) consulta.grados_ids = filtro.grade_id;

  const documentos = await DocumentoReferencia.find(consulta)
    .populate('area_id', 'nombre codigo')
    .populate({ path: 'grados_ids', select: 'nombre numero', options: { sort: { numero: 1 } } })
    .populate('subido_por', 'nombre apellido')
    .sort({ createdAt: -1 });
  return documentos.map((d) => vistaDocumento(d as unknown as DocumentoPoblado));
}

export async function crearDocumentoReferencia(datos: DatosDocumentoReferencia, archivo: PdfSubido | undefined, usuario: UserDocument, ip?: string | null) {
  await exigirAreaYGrados(datos.area_id, datos.grados_ids);

  const _id = new Types.ObjectId();
  const guardado = await guardarPdf(carpetaDocumentoReferencia(String(_id)), 'documento', archivo);
  try {
    await DocumentoReferencia.create({
      _id,
      titulo: datos.titulo,
      descripcion: datos.descripcion ?? '',
      area_id: datos.area_id,
      grados_ids: datos.grados_ids,
      archivo: guardado,
      subido_por: usuario._id,
    });
  } catch (err) {
    await borrarArchivo(guardado);
    throw err;
  }

  await registrarEvento({ usuario_id: usuario._id, accion: 'DOCUMENTO_REFERENCIA_CREADO', entidad: 'DocumentoReferencia', entidad_id: _id, detalle: datos.titulo, ip });
  return cargarVista(_id);
}

/** Edita los datos o, si llega un PDF, reemplaza al anterior (el anterior se borra solo cuando el nuevo ya quedó guardado). */
export async function actualizarDocumentoReferencia(
  id: string,
  cambios: CambiosDocumentoReferencia,
  archivo: PdfSubido | undefined,
  usuario: UserDocument,
  ip?: string | null
) {
  const documento = await DocumentoReferencia.findById(id);
  if (!documento) throw new ApiError(404, 'Documento de referencia no encontrado.');

  const areaId = cambios.area_id ?? String(documento.area_id);
  const gradosIds = cambios.grados_ids ?? documento.grados_ids.map(String);
  if (cambios.area_id !== undefined || cambios.grados_ids !== undefined) await exigirAreaYGrados(areaId, gradosIds);

  const anterior = documento.archivo;
  const nuevo = archivo ? await guardarPdf(carpetaDocumentoReferencia(String(documento._id)), 'documento', archivo) : null;

  if (cambios.titulo !== undefined) documento.titulo = cambios.titulo;
  if (cambios.descripcion !== undefined) documento.descripcion = cambios.descripcion;
  documento.area_id = new Types.ObjectId(areaId);
  documento.set('grados_ids', gradosIds);
  if (nuevo) documento.archivo = nuevo;

  try {
    await documento.save();
  } catch (err) {
    if (nuevo) await borrarArchivo(nuevo);
    throw err;
  }
  if (nuevo) await borrarArchivo(anterior);

  await registrarEvento({ usuario_id: usuario._id, accion: 'DOCUMENTO_REFERENCIA_ACTUALIZADO', entidad: 'DocumentoReferencia', entidad_id: documento._id, detalle: documento.titulo, ip });
  return cargarVista(documento._id);
}

/** Ningún plan, actividad ni nota se liga a un documento por llave: eliminarlo no deja nada colgando. */
export async function eliminarDocumentoReferencia(id: string, usuario: UserDocument, ip?: string | null): Promise<void> {
  const documento = await DocumentoReferencia.findByIdAndDelete(id);
  if (!documento) throw new ApiError(404, 'Documento de referencia no encontrado.');
  await fs.rm(carpetaDocumentoReferencia(String(documento._id)), { recursive: true, force: true });

  await registrarEvento({ usuario_id: usuario._id, accion: 'DOCUMENTO_REFERENCIA_ELIMINADO', entidad: 'DocumentoReferencia', entidad_id: documento._id, detalle: documento.titulo, ip });
}

/** Ruta del PDF para descargarlo: lo ven coordinación, administración y los docentes (son documentos de apoyo, no de un estudiante). */
export async function rutaDelDocumentoReferencia(id: string): Promise<{ ruta: string; nombre: string }> {
  const documento = await DocumentoReferencia.findById(id).select('archivo').lean();
  if (!documento) throw new ApiError(404, 'Documento de referencia no encontrado.');
  return { ruta: rutaAbsoluta(documento.archivo), nombre: documento.archivo.nombre };
}
