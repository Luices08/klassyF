import { Types } from 'mongoose';
import { MetodoConversion, TipoEscalaExterna } from '../constants/traslados';
import EscalaExterna, { EscalaExternaDocument, IEscalaExterna } from '../models/escalaExterna.model';
import NotaHomologada from '../models/notaHomologada.model';
import TrasladoExtemporaneo from '../models/trasladoExtemporaneo.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { ConceptoEquivalencia, RangoEquivalencia, validarEscalaExterna } from '../utils/homologacion';
import { registrarEvento } from './audit.service';

/**
 * Catálogo de escalas de otras instituciones (configuración institucional, M32): con qué escala evaluaba el colegio de procedencia y cuánto
 * vale cada nota de allá aquí. Ninguna escala está quemada en el código: el colegio crea las que reciba (1–10, 0–100, conceptual...).
 */

export interface EscalaExternaInput {
  nombre: string;
  descripcion?: string;
  tipo: TipoEscalaExterna;
  valor_minimo?: number | null;
  valor_maximo?: number | null;
  valor_aprobatorio?: number | null;
  metodo?: MetodoConversion;
  rangos?: RangoEquivalencia[];
  conceptos?: ConceptoEquivalencia[];
}

/** Lo que no aplica al tipo se limpia, así una escala conceptual no arrastra rangos de cuando era numérica. */
function normalizarEscala(input: EscalaExternaInput): Omit<IEscalaExterna, 'estado' | 'createdAt' | 'updatedAt'> {
  const numerica = input.tipo === 'NUMERICA';
  const metodo = numerica ? input.metodo ?? 'LINEAL' : 'LINEAL';
  return {
    nombre: input.nombre.trim(),
    descripcion: (input.descripcion ?? '').trim(),
    tipo: input.tipo,
    valor_minimo: numerica ? input.valor_minimo ?? null : null,
    valor_maximo: numerica ? input.valor_maximo ?? null : null,
    valor_aprobatorio: numerica ? input.valor_aprobatorio ?? null : null,
    metodo,
    rangos: numerica && metodo === 'RANGOS' ? (input.rangos ?? []) : [],
    conceptos: numerica ? [] : (input.conceptos ?? []).map((c) => ({ concepto: c.concepto.trim(), abreviatura: (c.abreviatura ?? '').trim(), nota: c.nota })),
  };
}

function exigirValida(datos: ReturnType<typeof normalizarEscala>): void {
  const problema = validarEscalaExterna(datos);
  if (problema) throw new ApiError(400, problema);
}

async function exigirNombreLibre(nombre: string, excepto?: Types.ObjectId): Promise<void> {
  const repetida = await EscalaExterna.findOne({ nombre, ...(excepto ? { _id: { $ne: excepto } } : {}) }).collation({ locale: 'es', strength: 1 });
  if (repetida) throw new ApiError(409, `Ya existe una escala llamada «${repetida.nombre}».`);
}

export async function listarEscalas(soloActivas: boolean): Promise<EscalaExternaDocument[]> {
  return EscalaExterna.find(soloActivas ? { estado: { $ne: 'inactivo' } } : {}).sort({ nombre: 1 });
}

export async function crearEscala(input: EscalaExternaInput, usuario: UserDocument, ip?: string | null): Promise<EscalaExternaDocument> {
  const datos = normalizarEscala(input);
  exigirValida(datos);
  await exigirNombreLibre(datos.nombre);
  const escala = await EscalaExterna.create(datos);
  await registrarEvento({ usuario_id: usuario._id, accion: 'ESCALA_EXTERNA_CREADA', entidad: 'EscalaExterna', entidad_id: escala._id, detalle: escala.nombre, ip });
  return escala;
}

export async function actualizarEscala(id: string, input: EscalaExternaInput, usuario: UserDocument, ip?: string | null): Promise<EscalaExternaDocument> {
  const escala = await EscalaExterna.findById(id);
  if (!escala) throw new ApiError(404, 'Escala no encontrada.');
  const datos = normalizarEscala(input);
  exigirValida(datos);
  await exigirNombreLibre(datos.nombre, escala._id);
  // Lo ya homologado conserva su copia de la escala: editarla solo cambia las conversiones que se hagan desde ahora.
  escala.set(datos);
  await escala.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'ESCALA_EXTERNA_ACTUALIZADA', entidad: 'EscalaExterna', entidad_id: escala._id, detalle: escala.nombre, ip });
  return escala;
}

export async function cambiarEstadoEscala(id: string, estado: 'activo' | 'inactivo', usuario: UserDocument, ip?: string | null): Promise<EscalaExternaDocument> {
  const escala = await EscalaExterna.findById(id);
  if (!escala) throw new ApiError(404, 'Escala no encontrada.');
  escala.estado = estado;
  await escala.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'ESCALA_EXTERNA_ACTUALIZADA', entidad: 'EscalaExterna', entidad_id: escala._id, detalle: `${escala.nombre}: ${estado}`, ip });
  return escala;
}

/** Solo se elimina una escala que nadie ha usado; la usada se desactiva (el historial la nombra). */
export async function eliminarEscala(id: string, usuario: UserDocument, ip?: string | null): Promise<void> {
  const escala = await EscalaExterna.findById(id);
  if (!escala) throw new ApiError(404, 'Escala no encontrada.');
  const [enTraslados, enNotas] = await Promise.all([
    TrasladoExtemporaneo.exists({ escala_externa_id: escala._id }),
    NotaHomologada.exists({ 'fuentes.escala.escala_externa_id': escala._id }),
  ]);
  if (enTraslados || enNotas) throw new ApiError(409, 'Esta escala ya se usó en traslados u homologaciones: desactívala en lugar de eliminarla.');
  await escala.deleteOne();
  await registrarEvento({ usuario_id: usuario._id, accion: 'ESCALA_EXTERNA_ELIMINADA', entidad: 'EscalaExterna', entidad_id: escala._id, detalle: escala.nombre, ip });
}
