import { MAX_BYTES_IMAGEN_NOTICIA, TIPOS_IMAGEN_NOTICIA } from '../constants/noticias';
import ImagenNoticia from '../models/imagenNoticia.model';
import { NoticiaDocument } from '../models/noticia.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { detectarFirmaArchivo } from '../utils/firmasArchivo';
import { noticiaAplica, puedeModerar } from '../utils/noticias';
import { registrarEvento } from './audit.service';
import { NoticiaGestion, cargarNoticia, exigirPoderPublicar, lectorDe, listarUna, validarPublicacion } from './noticia.service';
import { almacenarPortada } from './noticiaPortada.service';

const ids = (lista: Array<{ toString(): string }>): string[] => lista.map(String);

/** Quien puede cambiar la imagen: el mismo que puede editar la noticia (el autor con su permiso todavía vigente, o administración y coordinación). */
async function cargarParaEditar(id: string, usuario: UserDocument): Promise<NoticiaDocument> {
  exigirPoderPublicar(usuario);
  const noticia = await cargarNoticia(id);
  if (!puedeModerar(usuario.rol, String(noticia.creada_por) === String(usuario._id))) throw new ApiError(404, 'Noticia no encontrada.');
  if (noticia.estado === 'ARCHIVADA') throw new ApiError(409, 'Una noticia archivada no se edita.');
  await validarPublicacion(usuario, { categoria_id: String(noticia.categoria_id), sedes_ids: ids(noticia.sedes_ids), grados_ids: ids(noticia.grados_ids), grupos_ids: ids(noticia.grupos_ids) });
  return noticia;
}

/** Una imagen por noticia (afiche o foto del evento): PNG, JPG o WEBP de hasta 2 MB, confirmada por la firma de bytes y no por lo que declare el navegador. */
export async function guardarImagenDeNoticia(id: string, archivo: Express.Multer.File | undefined, usuario: UserDocument, ip?: string | null): Promise<NoticiaGestion> {
  const noticia = await cargarParaEditar(id, usuario);
  if (!archivo) throw new ApiError(400, 'Adjunta la imagen (PNG, JPG o WEBP).');
  if (archivo.size > MAX_BYTES_IMAGEN_NOTICIA) throw new ApiError(400, 'La imagen supera el tamaño máximo permitido (2 MB).');
  const firma = detectarFirmaArchivo(archivo.mimetype, archivo.buffer);
  if (!firma || !(TIPOS_IMAGEN_NOTICIA as readonly string[]).includes(firma.mimetype)) throw new ApiError(400, 'La imagen debe ser un PNG, JPG o WEBP válido.');

  const ahora = Date.now();
  await almacenarPortada(noticia._id, { mime: firma.mimetype, datos: archivo.buffer }, usuario._id, ahora);
  noticia.imagen_version = ahora;
  await noticia.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'NOTICIA_IMAGEN_ACTUALIZADA', entidad: 'Noticia', entidad_id: noticia._id, ip });
  return (await listarUna(noticia._id, usuario)) as NoticiaGestion;
}

/** Toda noticia lleva portada: no se quita, se reemplaza. */
export async function quitarImagenDeNoticia(id: string, usuario: UserDocument, _ip?: string | null): Promise<NoticiaGestion> {
  await cargarParaEditar(id, usuario);
  throw new ApiError(409, 'Toda noticia lleva una fotografía de portada: no se puede quitar, súbela de nuevo para reemplazarla.');
}

/**
 * La imagen solo se sirve con sesión y a quien puede ver la noticia: administración, coordinación y el autor siempre; los demás, si ya está publicada y les toca. En un
 * evento puede haber niños en la foto, así que no hay una dirección pública. «No existe» y «no te toca» responden igual.
 */
export async function leerImagenDeNoticia(id: string, usuario: UserDocument): Promise<{ mime: string; datos: Buffer }> {
  const noticia = await cargarNoticia(id);
  const gestiona = puedeModerar(usuario.rol, String(noticia.creada_por) === String(usuario._id));
  if (!gestiona) {
    const publicada = noticia.estado === 'PUBLICADA' && noticia.publicar_desde <= new Date();
    const lector = publicada ? await lectorDe(usuario) : null;
    const aplica = lector && noticiaAplica({ roles_destino: noticia.roles_destino, sedes_ids: ids(noticia.sedes_ids), grados_ids: ids(noticia.grados_ids), grupos_ids: ids(noticia.grupos_ids), alcance: noticia.alcance }, lector);
    if (!aplica) throw new ApiError(404, 'Imagen no encontrada.');
  }
  const imagen = await ImagenNoticia.findOne({ noticia_id: noticia._id });
  if (!imagen) throw new ApiError(404, 'Imagen no encontrada.');
  return { mime: imagen.mime, datos: imagen.datos };
}
