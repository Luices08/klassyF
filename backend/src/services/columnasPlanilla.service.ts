import { Types } from 'mongoose';
import Activity from '../models/activity.model';
import CalificacionAsignatura from '../models/calificacionAsignatura.model';
import ColumnaPlanilla from '../models/columnaPlanilla.model';
import { UserDocument } from '../models/user.model';
import ApiError from '../utils/ApiError';
import { runTransaction } from '../utils/runTransaction';
import { asegurarAnioNoCerrado } from './academicYear.service';
import { updateActivity, asignacionDelDocente } from './activity.service';
import { registrarEvento } from './audit.service';
import { casillasDeClase, exigirCasillaDisponible, exigirPesosValidos } from './casillasBloque.service';
import { BloquePlanilla, armarBloques, cargarContextoPlanilla, ContextoPlanilla, resolverAcceso } from './notas.service';
import { exigirPlanillaAbierta } from './notasEstado.service';
import { assertPeriodNotLocked } from './periodLock.service';

/**
 * Las casillas de la planilla que el docente arma: notas sueltas que crea, renombra, mueve de bloque, pesa y elimina, y el
 * peso/bloque de las actividades de M11 (que ya son casillas por sí mismas). Todo exige ser el titular, que el periodo admita
 * notas y que la planilla no esté cerrada. El molde del colegio manda: el bloque debe existir y tener lugar.
 */

interface ClaseEditable {
  ctx: ContextoPlanilla;
  nombreDe: (clave: string) => string;
}

async function claseEditable(asignacionId: string, periodoNumero: number, docente: UserDocument): Promise<ClaseEditable> {
  const asignacion = await asignacionDelDocente(asignacionId, docente);
  await asegurarAnioNoCerrado(String(asignacion.academic_year_id));
  const ctx = await cargarContextoPlanilla(asignacion, periodoNumero);
  await assertPeriodNotLocked(asignacion.academic_year_id, asignacion.group_id as Types.ObjectId, periodoNumero, docente._id);
  await exigirPlanillaAbierta(asignacion._id, periodoNumero, 'cambiar las casillas de la planilla');
  const nombres = new Map(ctx.bloques.map((b) => [b.clave, b.nombre]));
  return { ctx, nombreDe: (clave) => nombres.get(clave) ?? clave };
}

export interface CrearCasillaInput {
  teacher_assignment_id: string;
  periodo_numero: number;
  bloque_clave: string;
  nombre: string;
  peso?: number | null;
}

/** El docente agrega una nota suelta (sin actividad) a un bloque de su planilla. */
export async function crearCasilla(input: CrearCasillaInput, docente: UserDocument, ip?: string | null) {
  const { ctx, nombreDe } = await claseEditable(input.teacher_assignment_id, input.periodo_numero, docente);
  await exigirCasillaDisponible(ctx.asignacion, input.periodo_numero, input.bloque_clave);
  const existentes = await casillasDeClase(ctx.asignacion._id, input.periodo_numero);
  exigirPesosValidos([...existentes, { id: 'nueva', bloque: input.bloque_clave, peso: input.peso ?? null }], nombreDe);

  const casilla = await ColumnaPlanilla.create({
    academic_year_id: ctx.asignacion.academic_year_id,
    teacher_assignment_id: ctx.asignacion._id,
    periodo_numero: input.periodo_numero,
    bloque_clave: input.bloque_clave,
    nombre: input.nombre,
    peso: input.peso ?? null,
    orden: (await ColumnaPlanilla.countDocuments({ teacher_assignment_id: ctx.asignacion._id, periodo_numero: input.periodo_numero })) + 1,
    creada_por: docente._id,
  });

  await registrarEvento({
    usuario_id: docente._id,
    accion: 'CASILLA_PLANILLA_CREADA',
    entidad: 'ColumnaPlanilla',
    entidad_id: casilla._id,
    detalle: `Periodo ${input.periodo_numero}, bloque ${nombreDe(input.bloque_clave)}: «${input.nombre}».`,
    ip,
  });
  return casilla;
}

export interface ActualizarCasillaInput {
  nombre?: string;
  bloque_clave?: string;
  peso?: number | null;
}

/**
 * Cambia una casilla. Una nota suelta se puede renombrar, mover y pesar; una actividad de M11 solo se mueve de bloque y se
 * pesa (su título y sus fechas son de Actividades y tareas).
 */
export async function actualizarCasilla(id: string, cambios: ActualizarCasillaInput, docente: UserDocument, ip?: string | null) {
  const actividad = await Activity.findById(id).select('_id');
  if (actividad) {
    if (cambios.nombre !== undefined) throw new ApiError(400, 'El título de una actividad se cambia en «Actividades y tareas», no en la planilla.');
    await updateActivity(
      id,
      {
        ...(cambios.bloque_clave !== undefined ? { componente_siee: cambios.bloque_clave } : {}),
        ...(cambios.peso !== undefined ? { peso_en_componente: cambios.peso } : {}),
      },
      docente,
      ip
    );
    return { _id: id, tipo: 'ACTIVIDAD' as const };
  }

  const casilla = await ColumnaPlanilla.findById(id);
  if (!casilla) throw new ApiError(404, 'Casilla no encontrada.');
  const { ctx, nombreDe } = await claseEditable(String(casilla.teacher_assignment_id), casilla.periodo_numero, docente);

  const bloque = cambios.bloque_clave ?? casilla.bloque_clave;
  const peso = cambios.peso !== undefined ? cambios.peso : (casilla.peso ?? null);
  if (bloque !== casilla.bloque_clave) await exigirCasillaDisponible(ctx.asignacion, casilla.periodo_numero, bloque, casilla._id);
  const otras = (await casillasDeClase(ctx.asignacion._id, casilla.periodo_numero)).filter((c) => c.id !== String(casilla._id));
  exigirPesosValidos([...otras, { id: String(casilla._id), bloque, peso }], nombreDe);

  if (cambios.nombre !== undefined) casilla.nombre = cambios.nombre;
  casilla.bloque_clave = bloque;
  casilla.peso = peso;
  await casilla.save();

  await registrarEvento({
    usuario_id: docente._id,
    accion: 'CASILLA_PLANILLA_ACTUALIZADA',
    entidad: 'ColumnaPlanilla',
    entidad_id: casilla._id,
    detalle: `Periodo ${casilla.periodo_numero}: ${Object.keys(cambios).join(', ')}.`,
    ip,
  });
  return { _id: String(casilla._id), tipo: 'MANUAL' as const };
}

/** Quita una nota suelta con todas las notas que los estudiantes tenían en ella. Las actividades se eliminan en M11. */
export async function eliminarCasilla(id: string, docente: UserDocument, ip?: string | null): Promise<void> {
  if (await Activity.exists({ _id: id })) {
    throw new ApiError(400, 'Una actividad se elimina en «Actividades y tareas», no en la planilla.');
  }
  const casilla = await ColumnaPlanilla.findById(id);
  if (!casilla) throw new ApiError(404, 'Casilla no encontrada.');
  const { nombreDe } = await claseEditable(String(casilla.teacher_assignment_id), casilla.periodo_numero, docente);

  await runTransaction(async (session) => {
    await CalificacionAsignatura.updateMany(
      { teacher_assignment_id: casilla.teacher_assignment_id, periodo_numero: casilla.periodo_numero },
      { $pull: { notas_columnas: { columna_id: casilla._id } } },
      { session }
    );
    await casilla.deleteOne({ session });
  });

  await registrarEvento({
    usuario_id: docente._id,
    accion: 'CASILLA_PLANILLA_ELIMINADA',
    entidad: 'ColumnaPlanilla',
    entidad_id: casilla._id,
    detalle: `Periodo ${casilla.periodo_numero}, bloque ${nombreDe(casilla.bloque_clave)}: «${casilla.nombre}».`,
    ip,
  });
}

export interface EstablecerPesosInput {
  teacher_assignment_id: string;
  periodo_numero: number;
  /** `peso: null` devuelve la casilla a automático. Solo viajan las que cambian. */
  pesos: Array<{ casilla_id: string; peso: number | null }>;
}

/**
 * Cambia de una vez los pesos de varias casillas (actividades o notas sueltas), validando antes el resultado final: en cada
 * bloque lo puesto no pasa de 100% y se escribe todo o nada.
 */
export async function establecerPesos(input: EstablecerPesosInput, docente: UserDocument, ip?: string | null): Promise<BloquePlanilla[]> {
  const { ctx, nombreDe } = await claseEditable(input.teacher_assignment_id, input.periodo_numero, docente);

  const porId = new Map(ctx.casillas.map((c) => [c.id, c]));
  const nuevos = new Map<string, number | null>();
  for (const p of input.pesos) {
    if (!porId.has(p.casilla_id)) throw new ApiError(400, 'Una de las casillas no pertenece a esta clase y periodo.');
    if (nuevos.has(p.casilla_id)) throw new ApiError(400, 'Una casilla viene repetida en la solicitud.');
    nuevos.set(p.casilla_id, p.peso);
  }
  exigirPesosValidos(
    ctx.casillas.map((c) => ({ id: c.id, bloque: c.bloque, peso: nuevos.has(c.id) ? (nuevos.get(c.id) as number | null) : c.peso })),
    nombreDe
  );

  await runTransaction(async (session) => {
    for (const [casillaId, peso] of nuevos) {
      const modelo = porId.get(casillaId)?.tipo === 'ACTIVIDAD' ? Activity : ColumnaPlanilla;
      await (modelo as typeof Activity).updateOne({ _id: casillaId }, { $set: modelo === Activity ? { peso_en_componente: peso } : { peso } }, { session });
    }
  });

  await registrarEvento({
    usuario_id: docente._id,
    accion: 'PESOS_PLANILLA_ACTUALIZADOS',
    entidad: 'TeacherAssignment',
    entidad_id: ctx.asignacion._id,
    detalle: `Periodo ${input.periodo_numero}: ${nuevos.size} casilla(s).`,
    ip,
  });
  return armarBloques(await cargarContextoPlanilla(ctx.asignacion, input.periodo_numero));
}

/** Los bloques de la clase con sus casillas usadas y su máximo: lo que necesita Actividades y tareas para elegir un bloque con lugar. */
export async function obtenerBloques(asignacionId: string, periodoNumero: number, usuario: UserDocument): Promise<BloquePlanilla[]> {
  const asignacion = await resolverAcceso(asignacionId, usuario);
  return armarBloques(await cargarContextoPlanilla(asignacion, periodoNumero));
}
