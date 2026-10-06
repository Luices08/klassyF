import { ComponenteSiee } from '../../../constants/enums';

/**
 * Ponderacion por defecto del SIEE (Decreto 1290) usada para calcular la nota final de una
 * asignatura a partir de sus 3 componentes evaluativos: se aplica mientras la institucion no
 * personalice `AcademicYear.ponderacion_componentes` (CU-ADM-04) — ver
 * `utils/siee#ponderacionEfectiva`. Ya no es un valor institucional fijo, solo el respaldo.
 */
export const PONDERACION_COMPONENTES_POR_DEFECTO: Record<ComponenteSiee, number> = {
  COGNITIVO_SABER: 0.4,
  PROCEDIMENTAL_HACER: 0.4,
  ACTITUDINAL_SER: 0.2,
};
