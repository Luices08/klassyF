import { Types } from 'mongoose';
import { EstadoUsuario } from '../constants/enums';
import { CONDICIONES_INICIALES, MARCA_CONDICIONES_SEMBRADAS, TipoExpediente } from '../constants/inclusion';
import { ROLES } from '../constants/roles';
import CondicionApoyo, { CondicionApoyoDocument } from '../models/condicionApoyo.model';
import Counter from '../models/counter.model';
import ExpedienteInclusion from '../models/expedienteInclusion.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { ESTADO_ACTIVO } from '../utils/filtroEstado';
import { registrarEvento } from './audit.service';

const NOMBRE_TIPO: Record<TipoExpediente, string> = { PIAR: 'PIAR', PLAN_APOYO: 'Plan de apoyo' };

function exigirPermiso(usuario: UserDocument): void {
  if (usuario.rol !== ROLES.ADMIN && usuario.rol !== ROLES.ORIENTADOR) throw new ApiError(403, 'Solo el administrador y la orientación gestionan las condiciones de apoyo.');
}

/**
 * Siembra las condiciones de partida una sola vez por instalación (el reclamo es atómico). Desde ahí son del colegio: si se elimina una,
 * no vuelve. Se llama al leer o validar el catálogo, así no hace falta ningún script y los expedientes anteriores siguen resolviendo su código.
 */
export async function asegurarCondicionesSembradas(): Promise<void> {
  const previo = await Counter.findOneAndUpdate({ _id: MARCA_CONDICIONES_SEMBRADAS }, { $setOnInsert: { seq: 1 } }, { upsert: true, new: false });
  if (previo) return;
  const posicion: Partial<Record<TipoExpediente, number>> = {};
  const iniciales = CONDICIONES_INICIALES.map((c) => {
    posicion[c.tipo_expediente] = (posicion[c.tipo_expediente] ?? 0) + 1;
    return { codigo: c.codigo, nombre: c.nombre, tipo_expediente: c.tipo_expediente, sistema: Boolean(c.sistema), orden: posicion[c.tipo_expediente] };
  });
  await CondicionApoyo.insertMany(iniciales, { ordered: false }).catch((err: { code?: number }) => {
    // Una instalación que ya tuviera alguna con el mismo código no debe romper la siembra.
    if (err.code !== 11000) throw err;
  });
}

export interface CondicionVista {
  _id: string;
  codigo: string;
  nombre: string;
  tipo_expediente: TipoExpediente;
  descripcion: string;
  orden: number;
  estado: EstadoUsuario;
  sistema: boolean;
  /** Cuántos expedientes la usan: una condición usada se desactiva, no se elimina. */
  usos: number;
}

const vista = (c: CondicionApoyoDocument, usos: number): CondicionVista => ({
  _id: String(c._id),
  codigo: c.codigo,
  nombre: c.nombre,
  tipo_expediente: c.tipo_expediente,
  descripcion: c.descripcion,
  orden: c.orden,
  estado: c.estado,
  sistema: c.sistema,
  usos,
});

/** El PIAR guarda la condición en `categoria_discapacidad` y el plan de apoyo en `plan_apoyo.tipo_necesidad`; cada una cuenta solo en su tipo. */
const filtroDeUso = (codigo: string) => ({ $or: [{ tipo: 'PIAR', categoria_discapacidad: codigo }, { tipo: 'PLAN_APOYO', 'plan_apoyo.tipo_necesidad': codigo }] });

const usosDe = (codigo: string): Promise<number> => ExpedienteInclusion.countDocuments(filtroDeUso(codigo));

async function usosPorCodigo(): Promise<Map<string, number>> {
  const [categorias, necesidades] = await Promise.all([
    ExpedienteInclusion.aggregate<{ _id: string; total: number }>([{ $match: { tipo: 'PIAR' } }, { $group: { _id: '$categoria_discapacidad', total: { $sum: 1 } } }]),
    ExpedienteInclusion.aggregate<{ _id: string; total: number }>([
      { $match: { tipo: 'PLAN_APOYO', 'plan_apoyo.tipo_necesidad': { $ne: null } } },
      { $group: { _id: '$plan_apoyo.tipo_necesidad', total: { $sum: 1 } } },
    ]),
  ]);
  const usos = new Map<string, number>();
  for (const u of [...categorias, ...necesidades]) usos.set(u._id, (usos.get(u._id) ?? 0) + u.total);
  return usos;
}

export async function listarCondiciones(usuario: UserDocument, filtro: { tipo?: TipoExpediente; incluirInactivas?: boolean }): Promise<CondicionVista[]> {
  exigirPermiso(usuario);
  await asegurarCondicionesSembradas();
  const consulta: Record<string, unknown> = {};
  if (filtro.tipo) consulta.tipo_expediente = filtro.tipo;
  if (!filtro.incluirInactivas) consulta.estado = ESTADO_ACTIVO;
  const [condiciones, usos] = await Promise.all([CondicionApoyo.find(consulta).collation({ locale: 'es' }).sort({ tipo_expediente: 1, orden: 1, nombre: 1 }), usosPorCodigo()]);
  return condiciones.map((c) => vista(c, usos.get(c.codigo) ?? 0));
}

async function exigirNombreLibre(nombre: string, tipo: TipoExpediente, exceptoId?: string): Promise<void> {
  const repetida = await CondicionApoyo.findOne({ tipo_expediente: tipo, nombre: nombre.trim(), ...(exceptoId ? { _id: { $ne: exceptoId } } : {}) }).collation({ locale: 'es', strength: 1 });
  if (repetida) throw new ApiError(409, `Ya existe «${repetida.nombre}» entre las condiciones de ${NOMBRE_TIPO[tipo]}.`);
}

export interface EntradaCondicion {
  codigo: string;
  nombre: string;
  tipo_expediente: TipoExpediente;
  descripcion?: string;
  orden?: number;
}

export async function crearCondicion(input: EntradaCondicion, usuario: UserDocument, ip?: string | null): Promise<CondicionVista> {
  exigirPermiso(usuario);
  await asegurarCondicionesSembradas();
  const codigo = input.codigo.trim().toUpperCase();
  if (await CondicionApoyo.exists({ codigo })) throw new ApiError(409, `Ya existe una condición con el código «${codigo}».`);
  await exigirNombreLibre(input.nombre, input.tipo_expediente);
  const ultima = await CondicionApoyo.findOne({ tipo_expediente: input.tipo_expediente }).sort({ orden: -1 }).select('orden');
  const condicion = await CondicionApoyo.create({
    codigo,
    nombre: input.nombre.trim(),
    tipo_expediente: input.tipo_expediente,
    descripcion: input.descripcion?.trim() ?? '',
    orden: input.orden ?? Math.min((ultima?.orden ?? 0) + 1, 999),
  });
  await registrarEvento({ usuario_id: usuario._id, accion: 'INCLUSION_CONDICION_CREADA', entidad: 'CondicionApoyo', entidad_id: condicion._id, detalle: `${codigo} (${condicion.tipo_expediente})`, ip });
  return vista(condicion, 0);
}

export interface CambiosCondicion {
  nombre?: string;
  descripcion?: string;
  orden?: number;
  estado?: EstadoUsuario;
  tipo_expediente?: TipoExpediente;
}

async function cargar(id: string): Promise<CondicionApoyoDocument> {
  const condicion = Types.ObjectId.isValid(id) ? await CondicionApoyo.findById(id) : null;
  if (!condicion) throw new ApiError(404, 'Condición no encontrada.');
  return condicion;
}

/** El código no cambia nunca (los expedientes lo guardan). El tipo solo cambia mientras ningún expediente la use y si no es una de las del sistema. */
export async function actualizarCondicion(id: string, cambios: CambiosCondicion, usuario: UserDocument, ip?: string | null): Promise<CondicionVista> {
  exigirPermiso(usuario);
  const condicion = await cargar(id);
  const usos = await usosDe(condicion.codigo);

  if (condicion.sistema && cambios.estado === 'inactivo') throw new ApiError(409, `«${condicion.nombre}» la usa el sistema por defecto y no se puede desactivar.`);
  const cambiaTipo = cambios.tipo_expediente !== undefined && cambios.tipo_expediente !== condicion.tipo_expediente;
  if (cambiaTipo) {
    if (condicion.sistema) throw new ApiError(409, `«${condicion.nombre}» la usa el sistema por defecto y no puede cambiar de tipo de expediente.`);
    if (usos > 0) throw new ApiError(409, `«${condicion.nombre}» ya está en ${usos} expediente(s): no puede cambiar de tipo. Desactívala y crea otra.`);
  }

  const tipoFinal = cambios.tipo_expediente ?? condicion.tipo_expediente;
  const nombreFinal = cambios.nombre?.trim() ?? condicion.nombre;
  if (cambios.nombre !== undefined || cambiaTipo) await exigirNombreLibre(nombreFinal, tipoFinal, id);

  condicion.nombre = nombreFinal;
  condicion.tipo_expediente = tipoFinal;
  if (cambios.descripcion !== undefined) condicion.descripcion = cambios.descripcion.trim();
  if (cambios.orden !== undefined) condicion.orden = cambios.orden;
  if (cambios.estado !== undefined) condicion.estado = cambios.estado;
  await condicion.save();
  await registrarEvento({ usuario_id: usuario._id, accion: 'INCLUSION_CONDICION_ACTUALIZADA', entidad: 'CondicionApoyo', entidad_id: condicion._id, detalle: condicion.codigo, ip });
  return vista(condicion, usos);
}

export async function eliminarCondicion(id: string, usuario: UserDocument, ip?: string | null): Promise<void> {
  exigirPermiso(usuario);
  const condicion = await cargar(id);
  if (condicion.sistema) throw new ApiError(409, `«${condicion.nombre}» la usa el sistema por defecto y no se puede eliminar.`);
  const usos = await usosDe(condicion.codigo);
  if (usos > 0) throw new ApiError(409, `«${condicion.nombre}» está en ${usos} expediente(s): desactívala en vez de eliminarla.`);
  await condicion.deleteOne();
  await registrarEvento({ usuario_id: usuario._id, accion: 'INCLUSION_CONDICION_ELIMINADA', entidad: 'CondicionApoyo', entidad_id: condicion._id, detalle: condicion.codigo, ip });
}

/**
 * Busca la condición que se va a guardar en un expediente. Una desactivada ya no se ofrece para expedientes nuevos, pero sigue valiendo
 * donde ya estaba (`permitirInactiva`). Si se indica el tipo, la condición debe ser de ese tipo de expediente.
 */
export async function resolverCondicion(codigo: string, opciones: { tipo?: TipoExpediente; permitirInactiva?: boolean } = {}): Promise<CondicionApoyoDocument> {
  await asegurarCondicionesSembradas();
  const condicion = await CondicionApoyo.findOne({ codigo: codigo.trim().toUpperCase() });
  if (!condicion) throw new ApiError(400, `La condición «${codigo}» no existe en el catálogo.`);
  if (opciones.tipo && condicion.tipo_expediente !== opciones.tipo) {
    throw new ApiError(409, `La condición «${condicion.nombre}» corresponde a ${NOMBRE_TIPO[condicion.tipo_expediente]}, no a ${NOMBRE_TIPO[opciones.tipo]}.`);
  }
  if (condicion.estado === 'inactivo' && !opciones.permitirInactiva) throw new ApiError(409, `La condición «${condicion.nombre}» está desactivada.`);
  return condicion;
}

/** Nombres vigentes para congelarlos en un documento emitido (renombrar una condición no cambia lo ya emitido). */
export async function nombresDeCondiciones(codigos: (string | null | undefined)[]): Promise<Map<string, string>> {
  const buscados = [...new Set(codigos.filter((c): c is string => Boolean(c)))];
  if (buscados.length === 0) return new Map();
  await asegurarCondicionesSembradas();
  const condiciones = await CondicionApoyo.find({ codigo: { $in: buscados } }).select('codigo nombre');
  return new Map(condiciones.map((c) => [c.codigo, c.nombre]));
}
