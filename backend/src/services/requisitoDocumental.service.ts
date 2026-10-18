import { Types } from 'mongoose';
import { NivelEducativo, TipoIngreso } from '../constants/enums';
import {
  AprobacionAutomatica,
  CondicionRequisito,
  MARCA_CATALOGO_SEMBRADO,
  REQUISITOS_INICIALES,
  categoriaInicial,
  indicacionInicial,
} from '../constants/requisitosDocumentales';
import Counter from '../models/counter.model';
import Enrollment from '../models/enrollment.model';
import RequisitoDocumental, { IRequisitoDocumental, RequisitoDocumentalDocument } from '../models/requisitoDocumental.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { ContextoDeRequisitos, ItemDeRequisito, seleccionarRequisitos } from '../utils/requisitosDocumentales';
import { registrarEvento } from './audit.service';

/** Lo que el usuario puede cambiar de un requisito. La clave y la aprobación automática no se editan. */
export interface DatosRequisito {
  nombre: string;
  indicacion?: string;
  categoria: IRequisitoDocumental['categoria'];
  obligatorio: boolean;
  niveles: NivelEducativo[];
  grados_numeros: number[];
  tipos_ingreso: TipoIngreso[];
  condicion_especial: CondicionRequisito;
}

/**
 * Siembra el catálogo con lo que el sistema pedía antes de ser configurable, una sola vez por instalación (el reclamo es atómico). Si el colegio
 * elimina un requisito sembrado no vuelve. No toca ningún checklist: los de las matrículas existentes conservan sus ítems tal como están.
 */
export async function asegurarCatalogoSembrado(): Promise<boolean> {
  const previo = await Counter.findOneAndUpdate({ _id: MARCA_CATALOGO_SEMBRADO }, { $setOnInsert: { seq: 1 } }, { upsert: true, new: false });
  if (previo) return false;
  await RequisitoDocumental.insertMany(
    REQUISITOS_INICIALES.map((r) => ({ ...r, indicacion: indicacionInicial(r.clave), categoria: categoriaInicial(r.clave) })),
    { ordered: false }
  ).catch((err: { code?: number }) => {
    // Una instalación que ya tuviera alguno de esos documentos con la misma clave no debe romper la siembra.
    if (err.code !== 11000) throw err;
  });
  return true;
}

export async function listarRequisitos(filtro: { estado?: 'activo' | 'inactivo' } = {}) {
  await asegurarCatalogoSembrado();
  const docs = await RequisitoDocumental.find(filtro.estado === 'activo' ? { estado: ESTADO_ACTIVO } : filtro.estado ? { estado: filtro.estado } : {}).sort({ orden: 1, clave: 1 });
  const claves = docs.map((d) => d.clave);
  const usadas = claves.length > 0 ? ((await Enrollment.distinct('checklist.tipo_documento', { 'checklist.tipo_documento': { $in: claves } })) as string[]) : [];
  return docs.map((d) => ({ ...d.toObject(), en_uso: usadas.includes(d.clave) }));
}

/** El catálogo activo, ya sembrado: lo que se usa para armar un checklist. */
export async function catalogoActivo() {
  await asegurarCatalogoSembrado();
  return RequisitoDocumental.find({ estado: ESTADO_ACTIVO }).lean();
}

/** Los documentos que se piden a un estudiante según el catálogo vigente (reemplaza a la función fija de antes). */
export async function generarChecklistDesdeCatalogo(contexto: ContextoDeRequisitos): Promise<ItemDeRequisito[]> {
  return seleccionarRequisitos(await catalogoActivo(), contexto);
}

const slug = (nombre: string): string =>
  nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);

async function claveLibre(nombre: string): Promise<string> {
  const raiz = slug(nombre) || 'DOCUMENTO';
  for (let i = 0; i < 100; i += 1) {
    const clave = i === 0 ? raiz : `${raiz}_${i + 1}`;
    if (!(await RequisitoDocumental.exists({ clave }))) return clave;
  }
  throw new ApiError(409, 'No se pudo generar un identificador para el documento; cambia el nombre.');
}

function validarDatos(d: DatosRequisito): void {
  if (!d.nombre.trim()) throw new ApiError(400, 'El documento necesita un nombre.');
  if (d.grados_numeros.some((n) => !Number.isInteger(n) || n < -2 || n > 11)) throw new ApiError(400, 'Hay un grado que no existe.');
}

export async function crearRequisito(datos: DatosRequisito, usuario: UserDocument, ip?: string | null): Promise<RequisitoDocumentalDocument> {
  validarDatos(datos);
  await asegurarCatalogoSembrado();
  const ultimo = await RequisitoDocumental.findOne().sort({ orden: -1 }).select('orden');
  const requisito = await RequisitoDocumental.create({
    ...datos,
    indicacion: datos.indicacion ?? '',
    clave: await claveLibre(datos.nombre),
    aprobacion_automatica: null,
    orden: Math.max(100, (ultimo?.orden ?? 0) + 10),
    actualizado_por: usuario._id,
  });
  await registrarEvento({ usuario_id: usuario._id, accion: 'REQUISITO_DOCUMENTAL_CREADO', entidad: 'RequisitoDocumental', entidad_id: requisito._id, detalle: requisito.clave, ip });
  return requisito;
}

async function cargar(id: string): Promise<RequisitoDocumentalDocument> {
  const requisito = await RequisitoDocumental.findById(id);
  if (!requisito) throw new ApiError(404, 'Documento no encontrado.');
  return requisito;
}

/** Edita el requisito. No altera matrículas ya creadas (cada una guardó su copia); llega a ellas con «Sincronizar requisitos». */
export async function actualizarRequisito(id: string, datos: DatosRequisito, usuario: UserDocument, ip?: string | null): Promise<RequisitoDocumentalDocument> {
  validarDatos(datos);
  const requisito = await cargar(id);
  requisito.set({ ...datos, indicacion: datos.indicacion ?? '', actualizado_por: usuario._id });
  await requisito.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'REQUISITO_DOCUMENTAL_ACTUALIZADO', entidad: 'RequisitoDocumental', entidad_id: requisito._id, detalle: requisito.clave, ip });
  return requisito;
}

export async function cambiarEstadoRequisito(id: string, estado: 'activo' | 'inactivo', usuario: UserDocument, ip?: string | null): Promise<RequisitoDocumentalDocument> {
  const requisito = await cargar(id);
  requisito.estado = estado;
  requisito.actualizado_por = usuario._id;
  await requisito.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'REQUISITO_DOCUMENTAL_ESTADO', entidad: 'RequisitoDocumental', entidad_id: requisito._id, detalle: `${requisito.clave}: ${estado}`, ip });
  return requisito;
}

/** Solo se elimina un documento que ninguna matrícula ha usado; si ya se usó, se desactiva (deja de pedirse sin perder el historial). */
export async function eliminarRequisito(id: string, usuario: UserDocument, ip?: string | null): Promise<void> {
  const requisito = await cargar(id);
  if (requisito.aprobacion_automatica) throw new ApiError(409, 'Este documento lo aprueba otro módulo del sistema: puedes desactivarlo, pero no eliminarlo.');
  if (await Enrollment.exists({ 'checklist.tipo_documento': requisito.clave })) {
    throw new ApiError(409, 'Este documento ya está en matrículas: desactívalo para que deje de pedirse.');
  }
  await requisito.deleteOne();
  await registrarEvento({ usuario_id: usuario._id, accion: 'REQUISITO_DOCUMENTAL_ELIMINADO', entidad: 'RequisitoDocumental', entidad_id: requisito._id as Types.ObjectId, detalle: requisito.clave, ip });
}

export type { AprobacionAutomatica };
