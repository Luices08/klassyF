import { Model, Types } from 'mongoose';
import { TIPOS_OBSERVACION_BASE } from '../constants/convivencia';
import { EstadoUsuario } from '../constants/enums';
import ConfiguracionConvivencia, { ConfiguracionConvivenciaDocument } from '../models/configuracionConvivencia.model';
import FaltaConvivencia, { FaltaConvivenciaDocument } from '../models/faltaConvivencia.model';
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

/** Siembra los tipos base la primera vez; después son de la institución. No se siembran faltas: cada colegio tiene su manual. */
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
  faltas: FaltaConvivenciaDocument[];
}

/**
 * Lo que necesita quien registra: los tipos de observación (M14) y las faltas del manual (M15) con su gravedad. Quien
 * registra solo ve lo activo; quien configura ve también lo inactivo para poder reactivarlo.
 */
export async function listarCatalogo(incluirInactivos: boolean): Promise<Catalogo> {
  const institucion = await obtenerInstitucionConvivencia();
  await asegurarTiposBase(institucion._id);
  const filtro = { institucion_id: institucion._id, ...(incluirInactivos ? {} : { estado: ESTADO_ACTIVO }) };
  const [tipos, faltas] = await Promise.all([
    TipoObservacion.find(filtro).sort({ orden: 1, nombre: 1 }),
    FaltaConvivencia.find(filtro).collation({ locale: 'es', numericOrdering: true }).sort({ gravedad: 1, codigo: 1 }),
  ]);
  return { tipos, faltas };
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

export async function actualizarTipo(
  id: string,
  input: Partial<DatosTipoObservacion>,
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
  if (await Observacion.exists({ tipo_id: tipo._id })) {
    throw new ApiError(409, 'El tipo ya tiene observaciones registradas: desactívalo en lugar de eliminarlo.');
  }
  await tipo.deleteOne();
  await registrarCambio('CATALOGO_CONVIVENCIA_ELIMINADO', 'TipoObservacion', tipo._id, tipo.nombre, actor);
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
  quorum_porcentaje: number;
  retencion_anios_observaciones: number | null;
  retencion_anios_casos: number | null;
}

/** Los plazos de retención de datos de menores son política institucional: solo un ADMIN los define. */
const CAMPOS_SOLO_ADMIN = ['retencion_anios_observaciones', 'retencion_anios_casos'] as const;

export async function actualizarConfiguracion(
  input: Partial<DatosConfiguracionConvivencia>,
  { usuarioId, ip }: ContextoActor,
  rol: string
): Promise<ConfiguracionConvivenciaDocument> {
  if (rol !== 'ADMIN' && CAMPOS_SOLO_ADMIN.some((campo) => input[campo] !== undefined)) {
    throw new ApiError(403, 'Solo un administrador define los plazos de conservación de los datos.');
  }
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
