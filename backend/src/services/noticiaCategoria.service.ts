import { Types } from 'mongoose';
import { EstadoUsuario } from '../constants/enums';
import { CATEGORIAS_INICIALES, MARCA_CATEGORIAS_SEMBRADAS, TonoCategoria } from '../constants/noticias';
import { ROLES } from '../constants/roles';
import CategoriaNoticia, { CategoriaNoticiaDocument } from '../models/categoriaNoticia.model';
import Counter from '../models/counter.model';
import HabilitacionNoticias from '../models/habilitacionNoticias.model';
import Noticia from '../models/noticia.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { registrarEvento } from './audit.service';

const PUEDEN_ADMINISTRAR = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];

function exigirPermiso(usuario: UserDocument): void {
  if (!PUEDEN_ADMINISTRAR.includes(usuario.rol as (typeof PUEDEN_ADMINISTRAR)[number])) throw new ApiError(403, 'Solo administración, coordinación y secretaría gestionan las categorías.');
}

/**
 * Siembra las categorías de partida una sola vez por instalación (el reclamo es atómico). Desde ahí son del colegio: si elimina una, no vuelve.
 * Se llama al leer el catálogo, así no hace falta ningún script al instalar.
 */
export async function asegurarCategoriasSembradas(): Promise<void> {
  const previo = await Counter.findOneAndUpdate({ _id: MARCA_CATEGORIAS_SEMBRADAS }, { $setOnInsert: { seq: 1 } }, { upsert: true, new: false });
  if (previo) return;
  await CategoriaNoticia.insertMany(CATEGORIAS_INICIALES.map((c) => ({ ...c })), { ordered: false }).catch((err: { code?: number }) => {
    // Una instalación que ya tuviera una categoría con el mismo nombre no debe romper la siembra.
    if (err.code !== 11000) throw err;
  });
}

export interface CategoriaVista {
  id: string;
  nombre: string;
  tono: TonoCategoria;
  estado: EstadoUsuario;
  /** Cuántas noticias la usan: una categoría usada se desactiva, no se elimina. */
  noticias: number;
}

const vista = (c: CategoriaNoticiaDocument, usos: Map<string, number>): CategoriaVista => ({ id: String(c._id), nombre: c.nombre, tono: c.tono, estado: c.estado, noticias: usos.get(String(c._id)) ?? 0 });

/** Todas pueden leerlas (para elegir al publicar); quien las gestiona ve también las desactivadas. */
export async function listarCategorias(incluirInactivas: boolean): Promise<CategoriaVista[]> {
  await asegurarCategoriasSembradas();
  const [categorias, usos] = await Promise.all([
    CategoriaNoticia.find(incluirInactivas ? {} : { estado: { $ne: 'inactivo' } }).collation({ locale: 'es' }).sort({ nombre: 1 }),
    Noticia.aggregate<{ _id: Types.ObjectId; total: number }>([{ $group: { _id: '$categoria_id', total: { $sum: 1 } } }]),
  ]);
  const usoPor = new Map(usos.map((u) => [String(u._id), u.total]));
  return categorias.map((c) => vista(c, usoPor));
}

async function exigirNombreLibre(nombre: string, exceptoId?: string): Promise<void> {
  const repetida = await CategoriaNoticia.findOne({ nombre: nombre.trim(), ...(exceptoId ? { _id: { $ne: exceptoId } } : {}) }).collation({ locale: 'es', strength: 1 });
  if (repetida) throw new ApiError(409, `Ya existe la categoría «${repetida.nombre}».`);
}

export async function crearCategoria(input: { nombre: string; tono?: TonoCategoria }, usuario: UserDocument, ip?: string | null): Promise<CategoriaVista> {
  exigirPermiso(usuario);
  await asegurarCategoriasSembradas();
  await exigirNombreLibre(input.nombre);
  const categoria = await CategoriaNoticia.create({ nombre: input.nombre.trim(), tono: input.tono ?? 'blue' });
  await registrarEvento({ usuario_id: usuario._id, accion: 'NOTICIA_CATEGORIA_CREADA', entidad: 'CategoriaNoticia', entidad_id: categoria._id, detalle: categoria.nombre, ip });
  return vista(categoria, new Map());
}

export async function actualizarCategoria(id: string, cambios: { nombre?: string; tono?: TonoCategoria; estado?: EstadoUsuario }, usuario: UserDocument, ip?: string | null): Promise<CategoriaVista> {
  exigirPermiso(usuario);
  const categoria = await CategoriaNoticia.findById(id);
  if (!categoria) throw new ApiError(404, 'Categoría no encontrada.');
  if (cambios.nombre !== undefined && cambios.nombre.trim() !== categoria.nombre) {
    await exigirNombreLibre(cambios.nombre, id);
    categoria.nombre = cambios.nombre.trim();
  }
  if (cambios.tono !== undefined) categoria.tono = cambios.tono;
  if (cambios.estado !== undefined) categoria.estado = cambios.estado;
  await categoria.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'NOTICIA_CATEGORIA_ACTUALIZADA', entidad: 'CategoriaNoticia', entidad_id: categoria._id, detalle: categoria.nombre, ip });
  const usos = await Noticia.countDocuments({ categoria_id: categoria._id });
  return vista(categoria, new Map([[String(categoria._id), usos]]));
}

/** Solo se elimina una categoría que nada usa (ni una noticia ni la habilitación de un docente); si no, se desactiva. */
export async function eliminarCategoria(id: string, usuario: UserDocument, ip?: string | null): Promise<void> {
  exigirPermiso(usuario);
  const categoria = await CategoriaNoticia.findById(id);
  if (!categoria) throw new ApiError(404, 'Categoría no encontrada.');
  const [noticias, habilitaciones] = await Promise.all([
    Noticia.countDocuments({ categoria_id: categoria._id }),
    HabilitacionNoticias.countDocuments({ categorias_ids: categoria._id, estado: 'ACTIVA' }),
  ]);
  if (noticias > 0 || habilitaciones > 0) throw new ApiError(409, 'La categoría ya se usa en noticias o en permisos de docentes: desactívala en lugar de eliminarla.');
  await categoria.deleteOne();
  await registrarEvento({ usuario_id: usuario._id, accion: 'NOTICIA_CATEGORIA_ELIMINADA', entidad: 'CategoriaNoticia', entidad_id: categoria._id, detalle: categoria.nombre, ip });
}
