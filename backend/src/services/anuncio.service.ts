import { Types } from 'mongoose';
import { Rol } from '../constants/enums';
import Anuncio, { AnuncioDocument } from '../models/anuncio.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { registrarEvento } from './audit.service';

export interface AnuncioVista {
  id: string;
  titulo: string;
  cuerpo: string;
  roles_destino: Rol[];
  publicar_desde: Date;
  vence_el: Date | null;
  fijado: boolean;
  estado: string;
  /** Solo para quien gestiona. */
  creado_por?: string;
  vigente: boolean;
}

const estaVigente = (a: { estado: string; publicar_desde: Date; vence_el: Date | null }, ahora: Date) =>
  a.estado === 'ACTIVO' && a.publicar_desde <= ahora && (!a.vence_el || a.vence_el >= ahora);

function vista(a: AnuncioDocument, ahora: Date, paraGestion: boolean): AnuncioVista {
  return {
    id: String(a._id),
    titulo: a.titulo,
    cuerpo: a.cuerpo,
    roles_destino: a.roles_destino,
    publicar_desde: a.publicar_desde,
    vence_el: a.vence_el,
    fijado: a.fijado,
    estado: a.estado,
    vigente: estaVigente(a, ahora),
    ...(paraGestion ? { creado_por: String(a.creado_por) } : {}),
  };
}

/** Lo que ve cualquier usuario: los vigentes dirigidos a su perfil activo, los fijados primero. */
export async function anunciosParaMi(usuario: UserDocument): Promise<AnuncioVista[]> {
  const ahora = new Date();
  const docs = await Anuncio.find({
    estado: 'ACTIVO',
    roles_destino: usuario.rol,
    publicar_desde: { $lte: ahora },
    $or: [{ vence_el: null }, { vence_el: { $gte: ahora } }],
  }).sort({ fijado: -1, publicar_desde: -1 });
  return docs.map((d) => vista(d, ahora, false));
}

/** Para quien los administra: todos, también los archivados y los vencidos. */
export async function listarAnunciosGestion(): Promise<AnuncioVista[]> {
  const ahora = new Date();
  const docs = await Anuncio.find().sort({ fijado: -1, publicar_desde: -1 }).limit(200);
  return docs.map((d) => vista(d, ahora, true));
}

export interface AnuncioInput {
  titulo: string;
  cuerpo: string;
  roles_destino: Rol[];
  publicar_desde?: Date;
  vence_el?: Date | null;
  fijado?: boolean;
}

function validarVigencia(desde: Date, vence: Date | null | undefined) {
  if (vence && vence < desde) throw new ApiError(400, 'La fecha en que vence no puede ser anterior a la de publicación.');
}

export async function crearAnuncio(input: AnuncioInput, autor: UserDocument, ip?: string | null): Promise<AnuncioVista> {
  const desde = input.publicar_desde ?? new Date();
  validarVigencia(desde, input.vence_el);
  const anuncio = await Anuncio.create({
    titulo: input.titulo,
    cuerpo: input.cuerpo,
    roles_destino: input.roles_destino,
    publicar_desde: desde,
    vence_el: input.vence_el ?? null,
    fijado: input.fijado ?? false,
    creado_por: autor._id,
  });
  await registrarEvento({ usuario_id: autor._id, accion: 'ANUNCIO_CREADO', entidad: 'Anuncio', entidad_id: anuncio._id, detalle: `Para: ${input.roles_destino.join(', ')}`, ip });
  return vista(anuncio, new Date(), true);
}

export async function actualizarAnuncio(id: string, cambios: Partial<AnuncioInput>, actor: UserDocument, ip?: string | null): Promise<AnuncioVista> {
  const anuncio = await Anuncio.findById(id);
  if (!anuncio) throw new ApiError(404, 'Anuncio no encontrado.');
  if (anuncio.estado === 'ARCHIVADO') throw new ApiError(409, 'Un anuncio archivado no se edita.');
  if (cambios.titulo !== undefined) anuncio.titulo = cambios.titulo;
  if (cambios.cuerpo !== undefined) anuncio.cuerpo = cambios.cuerpo;
  if (cambios.roles_destino !== undefined) anuncio.roles_destino = cambios.roles_destino;
  if (cambios.publicar_desde !== undefined) anuncio.publicar_desde = cambios.publicar_desde;
  if (cambios.vence_el !== undefined) anuncio.vence_el = cambios.vence_el;
  if (cambios.fijado !== undefined) anuncio.fijado = cambios.fijado;
  validarVigencia(anuncio.publicar_desde, anuncio.vence_el);
  await anuncio.save();
  await registrarEvento({ usuario_id: actor._id, accion: 'ANUNCIO_ACTUALIZADO', entidad: 'Anuncio', entidad_id: anuncio._id, ip });
  return vista(anuncio, new Date(), true);
}

/** Un anuncio no se borra: se archiva y deja de verse (queda el rastro de qué se comunicó y a quién). */
export async function archivarAnuncio(id: string, actor: UserDocument, ip?: string | null): Promise<void> {
  const anuncio = await Anuncio.findByIdAndUpdate(id, { $set: { estado: 'ARCHIVADO', fijado: false } });
  if (!anuncio) throw new ApiError(404, 'Anuncio no encontrado.');
  await registrarEvento({ usuario_id: actor._id, accion: 'ANUNCIO_ARCHIVADO', entidad: 'Anuncio', entidad_id: new Types.ObjectId(id), ip });
}
