import { ClientSession, Types } from 'mongoose';
import ImagenNoticia from '../models/imagenNoticia.model';
import { PortadaDecodificada } from '../utils/portadaNoticia';

/**
 * Guarda (o reemplaza) los bytes de la portada de una noticia. Va aparte para que la creación de una noticia y la de su portada se hagan en la misma transacción
 * sin que este módulo dependa del servicio de noticias.
 */
export async function almacenarPortada(noticiaId: Types.ObjectId, portada: PortadaDecodificada, usuarioId: Types.ObjectId, version: number, session?: ClientSession): Promise<void> {
  await ImagenNoticia.findOneAndUpdate(
    { noticia_id: noticiaId },
    { noticia_id: noticiaId, mime: portada.mime, datos: portada.datos, tamano: portada.datos.length, subida_por: usuarioId, actualizada_en: new Date(version) },
    { upsert: true, session }
  );
}
