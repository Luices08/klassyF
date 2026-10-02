import { TipoSituacion } from '../constants/convivencia';
import { EstadoUsuario } from '../constants/enums';
import CasoConvivencia from '../models/casoConvivencia.model';
import {
  EntidadExterna,
  EntidadExternaDocument,
  IPasoProtocolo,
  MedidaConvivencia,
  MedidaConvivenciaDocument,
  ProtocoloConvivencia,
  ProtocoloConvivenciaDocument,
} from '../models/catalogosCaso.model';
import ApiError from '../utils/ApiError';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { registrarEvento } from './audit.service';
import {
  cambiarEstadoDe,
  ContextoActor,
  obtenerInstitucionConvivencia,
  registrarCambio,
  traducirDuplicado,
} from './convivenciaCatalogo.service';

export interface CatalogosCaso {
  medidas: MedidaConvivenciaDocument[];
  entidades: EntidadExternaDocument[];
  protocolos: ProtocoloConvivenciaDocument[];
}

/** Medidas, entidades de remisión y protocolos de la institución; no hay datos de ejemplo: cada colegio define los suyos. */
export async function listarCatalogosCaso(incluirInactivos: boolean): Promise<CatalogosCaso> {
  const institucion = await obtenerInstitucionConvivencia();
  const filtro = { institucion_id: institucion._id, ...(incluirInactivos ? {} : { estado: ESTADO_ACTIVO }) };
  const [medidas, entidades, protocolos] = await Promise.all([
    MedidaConvivencia.find(filtro).sort({ orden: 1, nombre: 1 }),
    EntidadExterna.find(filtro).sort({ orden: 1, nombre: 1 }),
    ProtocoloConvivencia.find({ institucion_id: institucion._id }).sort({ tipo_situacion: 1 }),
  ]);
  return { medidas, entidades, protocolos };
}

// --- Medidas ---

export interface DatosMedida {
  nombre: string;
  descripcion: string;
  se_aplica_por_dias: boolean;
  orden: number;
}

const mensajeDuplicado = 'Ya existe un registro con ese nombre.';

export async function crearMedida(input: DatosMedida, actor: ContextoActor): Promise<MedidaConvivenciaDocument> {
  const institucion = await obtenerInstitucionConvivencia();
  const medida = new MedidaConvivencia({ ...input, institucion_id: institucion._id });
  try {
    await medida.save();
  } catch (err) {
    traducirDuplicado(err, mensajeDuplicado);
  }
  await registrarCambio('CATALOGO_CONVIVENCIA_CREADO', 'MedidaConvivencia', medida._id, medida.nombre, actor);
  return medida;
}

export async function actualizarMedida(id: string, input: Partial<DatosMedida>, actor: ContextoActor): Promise<MedidaConvivenciaDocument> {
  const medida = await MedidaConvivencia.findById(id);
  if (!medida) throw new ApiError(404, 'Medida no encontrada.');
  medida.set(input);
  try {
    await medida.save();
  } catch (err) {
    traducirDuplicado(err, mensajeDuplicado);
  }
  await registrarCambio('CATALOGO_CONVIVENCIA_ACTUALIZADO', 'MedidaConvivencia', medida._id, Object.keys(input).join(', '), actor);
  return medida;
}

export const cambiarEstadoMedida = (id: string, estado: EstadoUsuario, actor: ContextoActor) =>
  cambiarEstadoDe<MedidaConvivenciaDocument>(MedidaConvivencia, 'MedidaConvivencia', id, estado, actor);

export async function eliminarMedida(id: string, actor: ContextoActor): Promise<void> {
  const medida = await MedidaConvivencia.findById(id);
  if (!medida) throw new ApiError(404, 'Medida no encontrada.');
  if (await CasoConvivencia.exists({ 'medidas_aplicadas.medida_id': medida._id })) {
    throw new ApiError(409, 'La medida ya se aplicó en algún caso: desactívala en lugar de eliminarla.');
  }
  await medida.deleteOne();
  await registrarCambio('CATALOGO_CONVIVENCIA_ELIMINADO', 'MedidaConvivencia', medida._id, medida.nombre, actor);
}

// --- Entidades externas ---

export interface DatosEntidad {
  nombre: string;
  descripcion: string;
  orden: number;
}

export async function crearEntidad(input: DatosEntidad, actor: ContextoActor): Promise<EntidadExternaDocument> {
  const institucion = await obtenerInstitucionConvivencia();
  const entidad = new EntidadExterna({ ...input, institucion_id: institucion._id });
  try {
    await entidad.save();
  } catch (err) {
    traducirDuplicado(err, mensajeDuplicado);
  }
  await registrarCambio('CATALOGO_CONVIVENCIA_CREADO', 'EntidadExterna', entidad._id, entidad.nombre, actor);
  return entidad;
}

export async function actualizarEntidad(id: string, input: Partial<DatosEntidad>, actor: ContextoActor): Promise<EntidadExternaDocument> {
  const entidad = await EntidadExterna.findById(id);
  if (!entidad) throw new ApiError(404, 'Entidad no encontrada.');
  entidad.set(input);
  try {
    await entidad.save();
  } catch (err) {
    traducirDuplicado(err, mensajeDuplicado);
  }
  await registrarCambio('CATALOGO_CONVIVENCIA_ACTUALIZADO', 'EntidadExterna', entidad._id, Object.keys(input).join(', '), actor);
  return entidad;
}

export const cambiarEstadoEntidad = (id: string, estado: EstadoUsuario, actor: ContextoActor) =>
  cambiarEstadoDe<EntidadExternaDocument>(EntidadExterna, 'EntidadExterna', id, estado, actor);

export async function eliminarEntidad(id: string, actor: ContextoActor): Promise<void> {
  const entidad = await EntidadExterna.findById(id);
  if (!entidad) throw new ApiError(404, 'Entidad no encontrada.');
  if (await CasoConvivencia.exists({ 'remisiones.entidad_id': entidad._id })) {
    throw new ApiError(409, 'La entidad ya recibió remisiones: desactívala en lugar de eliminarla.');
  }
  await entidad.deleteOne();
  await registrarCambio('CATALOGO_CONVIVENCIA_ELIMINADO', 'EntidadExterna', entidad._id, entidad.nombre, actor);
}

// --- Protocolos ---

/**
 * Reemplaza los pasos del protocolo de un tipo de situación. Los casos ya abiertos conservan los pasos que copiaron:
 * cambiar el protocolo no altera un proceso en curso.
 */
export async function guardarProtocolo(
  tipo: TipoSituacion,
  pasos: Omit<IPasoProtocolo, 'orden'>[],
  { usuarioId, ip }: ContextoActor
): Promise<ProtocoloConvivenciaDocument> {
  const institucion = await obtenerInstitucionConvivencia();
  const protocolo = await ProtocoloConvivencia.findOneAndUpdate(
    { institucion_id: institucion._id, tipo_situacion: tipo },
    { $set: { pasos: pasos.map((p, i) => ({ ...p, orden: i + 1 })) } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  await registrarEvento({
    usuario_id: usuarioId,
    accion: 'PROTOCOLO_CONVIVENCIA_ACTUALIZADO',
    entidad: 'ProtocoloConvivencia',
    entidad_id: protocolo._id,
    detalle: `tipo ${tipo}: ${pasos.length} paso(s)`,
    ip,
  });
  return protocolo;
}
