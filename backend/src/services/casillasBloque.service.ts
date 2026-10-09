import { Types } from 'mongoose';
import AcademicYear from '../models/academicYear.model';
import Activity from '../models/activity.model';
import ColumnaPlanilla from '../models/columnaPlanilla.model';
import ApiError from '../utils/ApiError';
import { bloquesConPesoExcedido, CasillaCalculo } from '../utils/calculoNotas';
import { componentesEfectivos } from '../utils/siee';

/**
 * Las casillas de la planilla de una clase y periodo: cada actividad de M11 y cada nota suelta (`ColumnaPlanilla`) ocupa
 * una casilla de su bloque, y el molde del colegio dice cuántas admite cada bloque. Va aparte de `notas.service` porque M11
 * también lo necesita al programar una actividad, y M12 depende de M11 (no al revés).
 */

export interface CasillaDeClase extends CasillaCalculo {
  tipo: 'ACTIVIDAD' | 'MANUAL';
}

type Asignacion = { _id: Types.ObjectId | string; academic_year_id: Types.ObjectId | string };

export async function casillasDeClase(teacherAssignmentId: Types.ObjectId | string, periodoNumero: number): Promise<CasillaDeClase[]> {
  const [actividades, sueltas] = await Promise.all([
    Activity.find({ teacher_assignment_id: teacherAssignmentId, periodo_numero: periodoNumero }).select('componente_siee peso_en_componente').lean(),
    ColumnaPlanilla.find({ teacher_assignment_id: teacherAssignmentId, periodo_numero: periodoNumero }).select('bloque_clave peso').lean(),
  ]);
  return [
    ...actividades.map((a) => ({ id: String(a._id), tipo: 'ACTIVIDAD' as const, bloque: a.componente_siee, peso: a.peso_en_componente ?? null })),
    ...sueltas.map((c) => ({ id: String(c._id), tipo: 'MANUAL' as const, bloque: c.bloque_clave, peso: c.peso ?? null })),
  ];
}

/** El bloque debe existir en el molde del año y tener una casilla libre (sin contar `excluirId`, la que se está moviendo o editando). */
export async function exigirCasillaDisponible(
  asignacion: Asignacion,
  periodoNumero: number,
  bloqueClave: string,
  excluirId?: Types.ObjectId | string
): Promise<void> {
  const anio = await AcademicYear.findById(asignacion.academic_year_id).select('componentes_evaluativos ponderacion_componentes');
  if (!anio) throw new ApiError(404, 'Año lectivo de la asignación académica no encontrado.');
  const bloque = componentesEfectivos(anio).find((c) => c.clave === bloqueClave);
  if (!bloque) throw new ApiError(400, `El bloque «${bloqueClave}» no existe en el molde de la planilla de este año.`);

  const usadas = (await casillasDeClase(asignacion._id, periodoNumero)).filter((c) => c.bloque === bloqueClave && c.id !== String(excluirId ?? ''));
  if (usadas.length >= bloque.max_casillas) {
    throw new ApiError(
      409,
      `El bloque «${bloque.nombre}» ya tiene ${usadas.length} casilla(s) en este periodo y su máximo es ${bloque.max_casillas}. Usa otro bloque o pídele a coordinación que amplíe el máximo en el creador de planillas.`
    );
  }
}

/** Los pesos puestos dentro de un bloque no pueden pasar de 100%: de lo contrario no hay cómo repartir. */
export function exigirPesosValidos(casillas: readonly CasillaCalculo[], nombreDe: (clave: string) => string = (c) => c): void {
  const excedidos = bloquesConPesoExcedido(casillas);
  if (excedidos.length > 0) {
    const detalle = excedidos.map((e) => `«${nombreDe(e.bloque)}» suma ${e.suma}%`).join('; ');
    throw new ApiError(400, `Los pesos de un bloque no pueden sumar más de 100%: ${detalle}.`);
  }
}
