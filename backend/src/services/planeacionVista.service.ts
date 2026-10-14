import { Types } from 'mongoose';
import { EstadoPlan } from '../constants/planeacion';
import type { IAdopcion, IRevisionPlan, IVersionPlan } from '../models/planeacionSubesquemas';
import User from '../models/user.model';

/**
 * Cómo viajan por la API el plan de área y el plan de aula: nunca la ruta del archivo (se baja con sesión y permiso por su
 * endpoint) y siempre con el nombre de quien subió o revisó, no solo su id.
 */

export interface PersonaVista {
  _id: string;
  nombre: string;
  apellido: string;
}

export async function cargarPersonas(ids: ReadonlyArray<Types.ObjectId | string | null | undefined>): Promise<Map<string, PersonaVista>> {
  const limpios = [...new Set(ids.filter((id): id is Types.ObjectId | string => Boolean(id)).map(String))];
  if (limpios.length === 0) return new Map();
  const usuarios = await User.find({ _id: { $in: limpios } }).select('nombre apellido').lean();
  return new Map(usuarios.map((u) => [String(u._id), { _id: String(u._id), nombre: u.nombre, apellido: u.apellido }]));
}

interface PlanConHistorial {
  _id: Types.ObjectId;
  estado: EstadoPlan;
  versiones: ReadonlyArray<IVersionPlan>;
  revisiones: ReadonlyArray<IRevisionPlan>;
}

/** Los usuarios que aparecen en un plan, para resolver sus nombres de una sola vez. */
export function personasDePlan(plan: PlanConHistorial): Types.ObjectId[] {
  const adoptados = plan.versiones.map((v) => v.adoptado_de?.docente_id);
  return [...plan.versiones.map((v) => v.subido_por), ...plan.revisiones.map((r) => r.revisor_id), ...adoptados].filter((id): id is Types.ObjectId => Boolean(id));
}

export function vistaVersion(v: IVersionPlan, personas: Map<string, PersonaVista>) {
  const adopcion: IAdopcion | null = v.adoptado_de;
  return {
    numero: v.numero,
    titulo: v.titulo,
    descripcion: v.descripcion,
    archivo: { nombre: v.archivo.nombre, bytes: v.archivo.bytes },
    origen: v.origen,
    adoptado_de: adopcion ? { docente: personas.get(String(adopcion.docente_id)) ?? null, version: adopcion.version } : null,
    subido_por: personas.get(String(v.subido_por)) ?? null,
    fecha: v.fecha,
  };
}

export function vistaRevision(r: IRevisionPlan, personas: Map<string, PersonaVista>) {
  return {
    accion: r.accion,
    version: r.version,
    comentario: r.comentario,
    fecha: r.fecha,
    automatica: r.automatica,
    revisor: r.revisor_id ? (personas.get(String(r.revisor_id)) ?? null) : null,
  };
}

/** Lo mínimo de un plan para una tarjeta o una fila de bandeja; el detalle completo se pide aparte. */
export function resumenDePlan(plan: PlanConHistorial, personas: Map<string, PersonaVista>) {
  const ultima = plan.versiones.at(-1);
  const revision = plan.revisiones.at(-1);
  return {
    _id: String(plan._id),
    estado: plan.estado,
    version_actual: ultima?.numero ?? 0,
    titulo: ultima?.titulo ?? '',
    descripcion: ultima?.descripcion ?? '',
    archivo_nombre: ultima?.archivo.nombre ?? '',
    radicado_en: ultima?.fecha ?? null,
    origen: plan.versiones[0]?.origen ?? 'CARGADA',
    adoptado_de: ultima?.adoptado_de ? { docente: personas.get(String(ultima.adoptado_de.docente_id)) ?? null } : null,
    ultima_revision: revision ? vistaRevision(revision, personas) : null,
  };
}

export type ResumenPlan = ReturnType<typeof resumenDePlan>;

/** El texto de una fecha de calendario (medianoche UTC) como la lee una persona: «12 de febrero de 2026». */
export function textoDeDia(fecha: Date): string {
  return fecha.toLocaleDateString('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
}
