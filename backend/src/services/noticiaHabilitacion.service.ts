import { Types } from 'mongoose';
import { AlcanceNoticia } from '../constants/noticias';
import { ROLES } from '../constants/roles';
import CategoriaNoticia from '../models/categoriaNoticia.model';
import HabilitacionNoticias, { HabilitacionNoticiasDocument } from '../models/habilitacionNoticias.model';
import User, { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { PUEDEN_HABILITAR } from '../utils/noticias';
import { registrarEvento } from './audit.service';

function exigirPermiso(usuario: UserDocument): void {
  if (!PUEDEN_HABILITAR.includes(usuario.rol)) throw new ApiError(403, 'Solo administración, coordinación y secretaría habilitan a docentes para publicar.');
}

/** Secretaría solo habilita a docentes que comparten alguna de sus sedes; administración y coordinación, a cualquiera. */
function exigirDocenteDeSusSedes(usuario: UserDocument, docente: { sedes_ids: Types.ObjectId[] }): void {
  if (usuario.rol !== ROLES.SECRETARIA) return;
  const propias = usuario.sedes_ids.map(String);
  if (!docente.sedes_ids.some((s) => propias.includes(String(s)))) throw new ApiError(404, 'Docente no encontrado.');
}

/** La habilitación activa de un docente, o `null`: es lo que consulta el servicio de noticias antes de dejarlo publicar. */
export async function habilitacionActivaDe(docenteId: Types.ObjectId | string): Promise<HabilitacionNoticiasDocument | null> {
  return HabilitacionNoticias.findOne({ docente_id: docenteId, estado: 'ACTIVA' });
}

export interface HabilitacionVista {
  id: string;
  docente: { _id: string; nombre: string; apellido: string };
  alcance_maximo: AlcanceNoticia;
  /** Vacío = todas las categorías. */
  categorias: Array<{ id: string; nombre: string }>;
  otorgada_por: string;
  createdAt: Date;
}

async function vistas(habilitaciones: HabilitacionNoticiasDocument[]): Promise<HabilitacionVista[]> {
  const personasIds = [...new Set(habilitaciones.flatMap((h) => [String(h.docente_id), String(h.otorgada_por)]))];
  const categoriasIds = [...new Set(habilitaciones.flatMap((h) => h.categorias_ids.map(String)))];
  const [personas, categorias] = await Promise.all([
    User.find({ _id: { $in: personasIds } }).select('nombre apellido').lean(),
    CategoriaNoticia.find({ _id: { $in: categoriasIds } }).select('nombre').lean(),
  ]);
  const persona = new Map(personas.map((p) => [String(p._id), p]));
  const categoria = new Map(categorias.map((c) => [String(c._id), c.nombre]));
  return habilitaciones.map((h) => {
    const docente = persona.get(String(h.docente_id));
    const quien = persona.get(String(h.otorgada_por));
    return {
      id: String(h._id),
      docente: { _id: String(h.docente_id), nombre: docente?.nombre ?? '', apellido: docente?.apellido ?? '' },
      alcance_maximo: h.alcance_maximo,
      categorias: h.categorias_ids.map((c) => ({ id: String(c), nombre: categoria.get(String(c)) ?? 'Categoría eliminada' })),
      otorgada_por: quien ? `${quien.nombre} ${quien.apellido}` : '',
      createdAt: h.createdAt,
    };
  });
}

/** Las habilitaciones vigentes. Secretaría ve solo las de docentes de sus sedes. */
export async function listarHabilitaciones(usuario: UserDocument): Promise<HabilitacionVista[]> {
  exigirPermiso(usuario);
  const todas = await HabilitacionNoticias.find({ estado: 'ACTIVA' }).sort({ createdAt: -1 });
  if (usuario.rol !== ROLES.SECRETARIA) return vistas(todas);
  const propias = usuario.sedes_ids.map(String);
  const docentes = await User.find({ _id: { $in: todas.map((h) => h.docente_id) } }).select('sedes_ids').lean();
  const deMisSedes = new Set(docentes.filter((d) => (d.sedes_ids ?? []).some((s) => propias.includes(String(s)))).map((d) => String(d._id)));
  return vistas(todas.filter((h) => deMisSedes.has(String(h.docente_id))));
}

async function exigirCategoriasValidas(ids: string[]): Promise<Types.ObjectId[]> {
  if (ids.length === 0) return [];
  const encontradas = await CategoriaNoticia.find({ _id: { $in: ids }, estado: { $ne: 'inactivo' } }).select('_id').lean();
  if (encontradas.length !== new Set(ids).size) throw new ApiError(400, 'Alguna de las categorías no existe o está desactivada.');
  return encontradas.map((c) => c._id);
}

export interface DatosHabilitacion {
  docente_id: string;
  alcance_maximo: AlcanceNoticia;
  categorias_ids: string[];
}

export async function otorgarHabilitacion(input: DatosHabilitacion, usuario: UserDocument, ip?: string | null): Promise<HabilitacionVista> {
  exigirPermiso(usuario);
  const docente = await User.findById(input.docente_id).select('nombre apellido roles estado sedes_ids');
  if (!docente || !docente.roles.includes(ROLES.DOCENTE)) throw new ApiError(404, 'Docente no encontrado.');
  exigirDocenteDeSusSedes(usuario, docente);
  if (docente.estado === 'inactivo') throw new ApiError(409, 'El docente está inactivo.');
  if (await habilitacionActivaDe(docente._id)) throw new ApiError(409, 'Este docente ya tiene permiso para publicar: edítalo o revócalo.');

  const categorias = await exigirCategoriasValidas(input.categorias_ids);
  const habilitacion = await HabilitacionNoticias.create({ docente_id: docente._id, alcance_maximo: input.alcance_maximo, categorias_ids: categorias, otorgada_por: usuario._id });
  await registrarEvento({ usuario_id: usuario._id, accion: 'NOTICIA_HABILITACION_OTORGADA', entidad: 'User', entidad_id: docente._id, detalle: `Alcance máximo: ${input.alcance_maximo}`, ip });
  return (await vistas([habilitacion]))[0] as HabilitacionVista;
}

async function cargarActiva(id: string, usuario: UserDocument): Promise<HabilitacionNoticiasDocument> {
  exigirPermiso(usuario);
  const habilitacion = Types.ObjectId.isValid(id) ? await HabilitacionNoticias.findOne({ _id: id, estado: 'ACTIVA' }) : null;
  if (!habilitacion) throw new ApiError(404, 'Permiso no encontrado.');
  const docente = await User.findById(habilitacion.docente_id).select('sedes_ids');
  if (docente) exigirDocenteDeSusSedes(usuario, docente);
  return habilitacion;
}

export async function actualizarHabilitacion(id: string, cambios: Partial<Omit<DatosHabilitacion, 'docente_id'>>, usuario: UserDocument, ip?: string | null): Promise<HabilitacionVista> {
  const habilitacion = await cargarActiva(id, usuario);
  if (cambios.alcance_maximo !== undefined) habilitacion.alcance_maximo = cambios.alcance_maximo;
  if (cambios.categorias_ids !== undefined) habilitacion.categorias_ids = await exigirCategoriasValidas(cambios.categorias_ids);
  await habilitacion.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'NOTICIA_HABILITACION_ACTUALIZADA', entidad: 'User', entidad_id: habilitacion.docente_id, detalle: `Alcance máximo: ${habilitacion.alcance_maximo}`, ip });
  return (await vistas([habilitacion]))[0] as HabilitacionVista;
}

/** Revocar no borra nada: la habilitación queda como historia y lo que el docente ya publicó se conserva (solo deja de poder publicar y editar). */
export async function revocarHabilitacion(id: string, usuario: UserDocument, ip?: string | null): Promise<void> {
  const habilitacion = await cargarActiva(id, usuario);
  habilitacion.estado = 'REVOCADA';
  habilitacion.revocada = { por: usuario._id, fecha: new Date() };
  await habilitacion.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'NOTICIA_HABILITACION_REVOCADA', entidad: 'User', entidad_id: habilitacion.docente_id, ip });
}
