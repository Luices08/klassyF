import { Types } from 'mongoose';
import { TipoSituacion } from '../constants/convivencia';
import CasoConvivencia from '../models/casoConvivencia.model';
import Observacion from '../models/observacion.model';

export interface FaltaContada {
  student_id: string;
  gravedad: TipoSituacion;
  fecha: Date;
  /** Solo las faltas que nacieron como observación traen el periodo guardado; de un caso se deduce de la fecha. */
  periodo_numero: number | null;
}

export interface FiltroFaltas {
  academic_year_id: Types.ObjectId | string;
  estudiantes_ids?: (Types.ObjectId | string)[];
  desde?: Date;
  /** Condición adicional de sede (`{ sede_id: { $in: [...] } }`), igual para observaciones y casos. */
  porSede?: Record<string, unknown>;
  /** Quien se declaró impedido en un caso deja de contarlo (RN-15-11). */
  excluirImpedido?: Types.ObjectId;
}

const GRAVES: TipoSituacion[] = ['II', 'III'];

/**
 * Las faltas de convivencia que otros módulos cuentan (promoción, predictivo, ficha de la comisión, panel de convivencia), con un solo criterio:
 *
 * - **Tipo I:** las que el docente registró como falta en el Observador (antecedente pedagógico).
 * - **Tipo II y III:** solo cuentan los casos con **decisión en firme** (`decision` registrada y el caso sin anular), una vez por cada presunto responsable.
 *   Un reporte urgente o una solicitud aún sin resolver no es una falta: la presunción de inocencia manda y un caso descartado no deja rastro.
 * - **Una Tipo II resuelta por el docente** (sin enviarla a coordinación) queda como observación y cuenta como II mientras no esté ligada a un caso; lo mismo una II/III de
 *   los registros anteriores al reporte urgente. Si ya tiene caso, cuenta el caso (y solo con decisión), para no contarla dos veces.
 * - **Una Tipo I escalada** que luego se vuelve un caso II/III con decisión cuenta como el caso, no como I y además como II/III.
 */
export async function faltasContadas(filtro: FiltroFaltas): Promise<FaltaContada[]> {
  const anio = new Types.ObjectId(String(filtro.academic_year_id));
  const estudiantes = filtro.estudiantes_ids?.map((s) => new Types.ObjectId(String(s)));
  const porEstudiante = estudiantes ? { student_id: { $in: estudiantes } } : {};
  const porSede = filtro.porSede ?? {};

  const casos = await CasoConvivencia.find({
    academic_year_id: anio,
    estado: { $ne: 'ANULADO' },
    ...(filtro.excluirImpedido ? { 'impedidos.usuario_id': { $ne: filtro.excluirImpedido } } : {}),
    ...(estudiantes ? { 'involucrados.student_id': { $in: estudiantes } } : {}),
    ...porSede,
  })
    .select('tipo_situacion decision.fecha involucrados.student_id involucrados.rol observacion_ids')
    .lean();

  const ligadas = casos.flatMap((c) => (c.observacion_ids ?? []).map(String));
  // Lo que ya cuenta por un caso grave con decisión no se cuenta además como la falta leve de la que nació.
  const ligadasACasoContado = casos.filter((c) => GRAVES.includes(c.tipo_situacion) && c.decision?.fecha).flatMap((c) => (c.observacion_ids ?? []).map(String));
  const observaciones = await Observacion.find({
    academic_year_id: anio,
    clase: 'FALTA',
    estado: 'ACTIVA',
    ...(filtro.desde ? { fecha_hecho: { $gte: filtro.desde } } : {}),
    // Una grave que ya tiene caso se cuenta por el caso.
    $or: [
      { 'falta.gravedad': 'I', _id: { $nin: ligadasACasoContado.map((id) => new Types.ObjectId(id)) } },
      { 'falta.gravedad': { $in: GRAVES }, _id: { $nin: ligadas.map((id) => new Types.ObjectId(id)) } },
    ],
    ...porEstudiante,
    ...porSede,
  })
    .select('student_id fecha_hecho periodo_numero falta.gravedad')
    .lean();

  const filas: FaltaContada[] = [];
  for (const o of observaciones) {
    const gravedad = o.falta?.gravedad;
    if (gravedad) filas.push({ student_id: String(o.student_id), gravedad, fecha: o.fecha_hecho, periodo_numero: o.periodo_numero ?? null });
  }

  const idsDeInteres = estudiantes ? new Set(estudiantes.map(String)) : null;
  for (const caso of casos) {
    const fecha = caso.decision?.fecha;
    if (!fecha || !GRAVES.includes(caso.tipo_situacion)) continue;
    if (filtro.desde && fecha < filtro.desde) continue;
    for (const involucrado of caso.involucrados) {
      if (involucrado.rol !== 'PRESUNTO_RESPONSABLE') continue;
      const id = String(involucrado.student_id);
      if (idsDeInteres && !idsDeInteres.has(id)) continue;
      filas.push({ student_id: id, gravedad: caso.tipo_situacion, fecha, periodo_numero: null });
    }
  }
  return filas;
}

/** Cuántas faltas tiene cada estudiante, por gravedad (`{ I: 2, III: 1 }`). */
export function contarPorEstudiante(faltas: readonly FaltaContada[]): Map<string, Record<string, number>> {
  const conteo = new Map<string, Record<string, number>>();
  for (const f of faltas) {
    const acumulado = conteo.get(f.student_id) ?? {};
    acumulado[f.gravedad] = (acumulado[f.gravedad] ?? 0) + 1;
    conteo.set(f.student_id, acumulado);
  }
  return conteo;
}
