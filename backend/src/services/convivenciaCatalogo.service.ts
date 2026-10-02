import { Model, Types } from 'mongoose';
import { FamiliaObservacion, TIPOS_OBSERVACION_BASE, TipoSituacion } from '../constants/convivencia';
import { EstadoUsuario } from '../constants/enums';
import CategoriaDescriptor, { CategoriaDescriptorDocument } from '../models/categoriaDescriptor.model';
import ConfiguracionConvivencia, { ConfiguracionConvivenciaDocument } from '../models/configuracionConvivencia.model';
import Descriptor, { DescriptorDocument } from '../models/descriptor.model';
import Institution from '../models/institution.model';
import Observacion from '../models/observacion.model';
import TipoObservacion, { TipoObservacionDocument } from '../models/tipoObservacion.model';
import ApiError from '../utils/ApiError';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { registrarEvento } from './audit.service';

export interface ContextoActor {
  usuarioId: Types.ObjectId | string;
  ip?: string | null;
}

// Una sola institución por instalación (ver CLAUDE.md): el catálogo nunca recibe institucion_id del cliente.
export async function obtenerInstitucionConvivencia() {
  const institucion = await Institution.findOne();
  if (!institucion) throw new ApiError(409, 'Configura primero la institución antes de parametrizar la convivencia.');
  return institucion;
}

const esErrorDeDuplicado = (err: unknown): boolean => (err as { code?: number })?.code === 11000;

export function traducirDuplicado(err: unknown, mensaje: string): never {
  if (esErrorDeDuplicado(err)) throw new ApiError(409, mensaje);
  throw err;
}

/** Siembra los tipos base la primera vez; después son de la institución. No se siembran faltas ni frases: las define el colegio. */
async function asegurarTiposBase(institucionId: Types.ObjectId): Promise<void> {
  if (await TipoObservacion.exists({ institucion_id: institucionId })) return;
  try {
    await TipoObservacion.insertMany(TIPOS_OBSERVACION_BASE.map((t) => ({ ...t, institucion_id: institucionId })));
  } catch (err) {
    // Dos primeras peticiones a la vez: la otra ya sembró, que es lo que se quería.
    if (!esErrorDeDuplicado(err)) throw err;
  }
}

export interface Catalogo {
  tipos: TipoObservacionDocument[];
  categorias: CategoriaDescriptorDocument[];
  descriptores: DescriptorDocument[];
}

/** Quien registra solo ve lo activo; quien configura ve también lo inactivo para poder reactivarlo. */
export async function listarCatalogo(incluirInactivos: boolean): Promise<Catalogo> {
  const institucion = await obtenerInstitucionConvivencia();
  await asegurarTiposBase(institucion._id);
  const filtro = { institucion_id: institucion._id, ...(incluirInactivos ? {} : { estado: ESTADO_ACTIVO }) };
  const [tipos, categorias, descriptores] = await Promise.all([
    TipoObservacion.find(filtro).sort({ orden: 1, nombre: 1 }),
    CategoriaDescriptor.find(filtro).sort({ orden: 1, nombre: 1 }),
    Descriptor.find(filtro).sort({ orden: 1, codigo: 1, texto: 1 }),
  ]);
  return { tipos, categorias, descriptores };
}

export async function registrarCambio(
  accion:
    | 'CATALOGO_CONVIVENCIA_CREADO'
    | 'CATALOGO_CONVIVENCIA_ACTUALIZADO'
    | 'CATALOGO_CONVIVENCIA_ESTADO_CAMBIADO'
    | 'CATALOGO_CONVIVENCIA_ELIMINADO',
  entidad: string,
  id: Types.ObjectId,
  detalle: string,
  { usuarioId, ip }: ContextoActor
) {
  await registrarEvento({ usuario_id: usuarioId, accion, entidad, entidad_id: id, detalle, ip });
}

export async function cambiarEstadoDe<T extends { estado: EstadoUsuario; _id: Types.ObjectId; save(): Promise<unknown> }>(
  modelo: Model<any>,
  nombreEntidad: string,
  id: string,
  estado: EstadoUsuario,
  actor: ContextoActor
): Promise<T> {
  const doc = (await modelo.findById(id)) as T | null;
  if (!doc) throw new ApiError(404, `${nombreEntidad} no encontrado.`);
  doc.estado = estado;
  await doc.save();
  await registrarCambio('CATALOGO_CONVIVENCIA_ESTADO_CAMBIADO', nombreEntidad, doc._id, estado, actor);
  return doc;
}

// --- Tipos de observación ---

export interface DatosTipoObservacion {
  nombre: string;
  familia: FamiliaObservacion;
  visible_estudiante: boolean;
  orden: number;
}

export async function crearTipo(input: DatosTipoObservacion, actor: ContextoActor): Promise<TipoObservacionDocument> {
  const institucion = await obtenerInstitucionConvivencia();
  await asegurarTiposBase(institucion._id);
  const tipo = new TipoObservacion({ ...input, institucion_id: institucion._id });
  try {
    await tipo.save();
  } catch (err) {
    traducirDuplicado(err, 'Ya existe un tipo de observación con ese nombre.');
  }
  await registrarCambio('CATALOGO_CONVIVENCIA_CREADO', 'TipoObservacion', tipo._id, tipo.nombre, actor);
  return tipo;
}

// La familia no se cambia: las observaciones ya guardadas la tienen copiada y cambiarla dejaría datos incoherentes.
export async function actualizarTipo(
  id: string,
  input: Partial<Omit<DatosTipoObservacion, 'familia'>>,
  actor: ContextoActor
): Promise<TipoObservacionDocument> {
  const tipo = await TipoObservacion.findById(id);
  if (!tipo) throw new ApiError(404, 'Tipo de observación no encontrado.');
  tipo.set(input);
  try {
    await tipo.save();
  } catch (err) {
    traducirDuplicado(err, 'Ya existe un tipo de observación con ese nombre.');
  }
  await registrarCambio('CATALOGO_CONVIVENCIA_ACTUALIZADO', 'TipoObservacion', tipo._id, Object.keys(input).join(', '), actor);
  return tipo;
}

export const cambiarEstadoTipo = (id: string, estado: EstadoUsuario, actor: ContextoActor) =>
  cambiarEstadoDe<TipoObservacionDocument>(TipoObservacion, 'TipoObservacion', id, estado, actor);

export async function eliminarTipo(id: string, actor: ContextoActor): Promise<void> {
  const tipo = await TipoObservacion.findById(id);
  if (!tipo) throw new ApiError(404, 'Tipo de observación no encontrado.');
  const [conDescriptores, conObservaciones] = await Promise.all([
    Descriptor.exists({ tipo_id: tipo._id }),
    Observacion.exists({ tipo_id: tipo._id }),
  ]);
  if (conDescriptores || conObservaciones) {
    throw new ApiError(409, 'El tipo ya tiene frases u observaciones registradas: desactívalo en lugar de eliminarlo.');
  }
  await tipo.deleteOne();
  await registrarCambio('CATALOGO_CONVIVENCIA_ELIMINADO', 'TipoObservacion', tipo._id, tipo.nombre, actor);
}

// --- Categorías ---

export interface DatosCategoriaDescriptor {
  nombre: string;
  orden: number;
}

export async function crearCategoria(
  input: DatosCategoriaDescriptor,
  actor: ContextoActor
): Promise<CategoriaDescriptorDocument> {
  const institucion = await obtenerInstitucionConvivencia();
  const categoria = new CategoriaDescriptor({ ...input, institucion_id: institucion._id });
  try {
    await categoria.save();
  } catch (err) {
    traducirDuplicado(err, 'Ya existe una categoría con ese nombre.');
  }
  await registrarCambio('CATALOGO_CONVIVENCIA_CREADO', 'CategoriaDescriptor', categoria._id, categoria.nombre, actor);
  return categoria;
}

export async function actualizarCategoria(
  id: string,
  input: Partial<DatosCategoriaDescriptor>,
  actor: ContextoActor
): Promise<CategoriaDescriptorDocument> {
  const categoria = await CategoriaDescriptor.findById(id);
  if (!categoria) throw new ApiError(404, 'Categoría no encontrada.');
  categoria.set(input);
  try {
    await categoria.save();
  } catch (err) {
    traducirDuplicado(err, 'Ya existe una categoría con ese nombre.');
  }
  await registrarCambio('CATALOGO_CONVIVENCIA_ACTUALIZADO', 'CategoriaDescriptor', categoria._id, Object.keys(input).join(', '), actor);
  return categoria;
}

export const cambiarEstadoCategoria = (id: string, estado: EstadoUsuario, actor: ContextoActor) =>
  cambiarEstadoDe<CategoriaDescriptorDocument>(CategoriaDescriptor, 'CategoriaDescriptor', id, estado, actor);

export async function eliminarCategoria(id: string, actor: ContextoActor): Promise<void> {
  const categoria = await CategoriaDescriptor.findById(id);
  if (!categoria) throw new ApiError(404, 'Categoría no encontrada.');
  if (await Descriptor.exists({ categoria_id: categoria._id })) {
    throw new ApiError(409, 'La categoría tiene frases: desactívala o mueve sus frases antes de eliminarla.');
  }
  await categoria.deleteOne();
  await registrarCambio('CATALOGO_CONVIVENCIA_ELIMINADO', 'CategoriaDescriptor', categoria._id, categoria.nombre, actor);
}

// --- Descriptores (frases y faltas del manual) ---

export interface DatosDescriptor {
  tipo_id: string;
  categoria_id: string | null;
  codigo: string | null;
  texto: string;
  tipo_situacion: TipoSituacion | null;
  descuento_decimas: number | null;
  orden: number;
}

/** El tipo de situación y las décimas solo tienen sentido en una falta (tipo disciplinario). */
function exigirCamposDeFalta(familia: FamiliaObservacion, input: Partial<DatosDescriptor>) {
  if (familia === 'DISCIPLINARIA') return;
  if (input.tipo_situacion || (input.descuento_decimas !== undefined && input.descuento_decimas !== null)) {
    throw new ApiError(400, 'El tipo de situación y las décimas solo aplican a las faltas de un tipo disciplinario.');
  }
}

async function exigirCategoriaExistente(categoriaId: string | null | undefined) {
  if (categoriaId && !(await CategoriaDescriptor.exists({ _id: categoriaId }))) {
    throw new ApiError(404, 'Categoría no encontrada.');
  }
}

export async function crearDescriptor(input: DatosDescriptor, actor: ContextoActor): Promise<DescriptorDocument> {
  const institucion = await obtenerInstitucionConvivencia();
  const tipo = await TipoObservacion.findById(input.tipo_id);
  if (!tipo) throw new ApiError(404, 'Tipo de observación no encontrado.');
  exigirCamposDeFalta(tipo.familia, input);
  await exigirCategoriaExistente(input.categoria_id);

  const descriptor = new Descriptor({ ...input, institucion_id: institucion._id });
  try {
    await descriptor.save();
  } catch (err) {
    traducirDuplicado(err, 'Ya existe una frase con ese código en este tipo.');
  }
  await registrarCambio('CATALOGO_CONVIVENCIA_CREADO', 'Descriptor', descriptor._id, descriptor.codigo ?? '', actor);
  return descriptor;
}

// El tipo no se cambia: las observaciones ya guardadas copiaron la frase con su tipo.
export async function actualizarDescriptor(
  id: string,
  input: Partial<Omit<DatosDescriptor, 'tipo_id'>>,
  actor: ContextoActor
): Promise<DescriptorDocument> {
  const descriptor = await Descriptor.findById(id);
  if (!descriptor) throw new ApiError(404, 'Frase no encontrada.');
  const tipo = await TipoObservacion.findById(descriptor.tipo_id);
  if (!tipo) throw new ApiError(404, 'Tipo de observación no encontrado.');
  exigirCamposDeFalta(tipo.familia, input);
  await exigirCategoriaExistente(input.categoria_id);

  descriptor.set(input);
  try {
    await descriptor.save();
  } catch (err) {
    traducirDuplicado(err, 'Ya existe una frase con ese código en este tipo.');
  }
  await registrarCambio('CATALOGO_CONVIVENCIA_ACTUALIZADO', 'Descriptor', descriptor._id, Object.keys(input).join(', '), actor);
  return descriptor;
}

export const cambiarEstadoDescriptor = (id: string, estado: EstadoUsuario, actor: ContextoActor) =>
  cambiarEstadoDe<DescriptorDocument>(Descriptor, 'Descriptor', id, estado, actor);

export async function eliminarDescriptor(id: string, actor: ContextoActor): Promise<void> {
  const descriptor = await Descriptor.findById(id);
  if (!descriptor) throw new ApiError(404, 'Frase no encontrada.');
  if (await Observacion.exists({ 'descriptores.descriptor_id': descriptor._id })) {
    throw new ApiError(409, 'La frase ya se usó en observaciones: desactívala en lugar de eliminarla.');
  }
  await descriptor.deleteOne();
  await registrarCambio('CATALOGO_CONVIVENCIA_ELIMINADO', 'Descriptor', descriptor._id, descriptor.codigo ?? '', actor);
}

// --- Política de convivencia ---

export async function obtenerConfiguracion(): Promise<ConfiguracionConvivenciaDocument> {
  const institucion = await obtenerInstitucionConvivencia();
  return ConfiguracionConvivencia.findOneAndUpdate(
    { institucion_id: institucion._id },
    { $setOnInsert: { institucion_id: institucion._id } },
    { upsert: true, new: true }
  ) as Promise<ConfiguracionConvivenciaDocument>;
}

export interface DatosConfiguracionConvivencia {
  plazo_enmienda_horas: number;
  plazo_anulacion_horas: number;
  plazo_remision_tipo_iii_horas: number;
}

export async function actualizarConfiguracion(
  input: Partial<DatosConfiguracionConvivencia>,
  { usuarioId, ip }: ContextoActor
): Promise<ConfiguracionConvivenciaDocument> {
  const configuracion = await obtenerConfiguracion();
  configuracion.set(input);
  await configuracion.save();
  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'CONFIGURACION_CONVIVENCIA_ACTUALIZADA',
    entidad: 'ConfiguracionConvivencia',
    entidad_id: configuracion._id,
    detalle: Object.keys(input).join(', '),
    ip,
  });
  return configuracion;
}
