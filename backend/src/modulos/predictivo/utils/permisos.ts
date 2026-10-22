/**
 * Quién puede hacer qué en el módulo predictivo. Lista de permitidos, sin herencia entre roles (como `checkRole`). Pura y con pruebas.
 * - Solo el ADMIN entrena la IA y ve sus versiones.
 * - Coordinación (académica y de convivencia), orientación y docentes buscan a cualquier estudiante y ven su análisis con la probabilidad.
 * - El estudiante ve el suyo y el acudiente el de cada hijo: el FODA y la nota que le falta, nunca el porcentaje del modelo.
 * - Lo de convivencia solo se nombra al ADMIN y a coordinación de convivencia (M14/M15); para los demás pesa en el cálculo sin nombrarse.
 * Secretaría no entra: no hace seguimiento académico.
 */
import { Rol } from '../../../constants/enums';
import { ROLES } from '../../../constants/roles';

export const ACCIONES_PREDICTIVO = ['ENTRENAR', 'VER_MODELOS', 'BUSCAR_ESTUDIANTES', 'VER_PROBABILIDAD', 'VER_CONVIVENCIA', 'VER_PROPIO', 'VER_HIJOS'] as const;
export type AccionPredictivo = (typeof ACCIONES_PREDICTIVO)[number];

const PERSONAL: readonly Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.COORDINADOR_CONVIVENCIA, ROLES.ORIENTADOR, ROLES.DOCENTE];

const MATRIZ: Record<AccionPredictivo, readonly Rol[]> = {
  ENTRENAR: [ROLES.ADMIN],
  VER_MODELOS: [ROLES.ADMIN],
  BUSCAR_ESTUDIANTES: PERSONAL,
  VER_PROBABILIDAD: PERSONAL,
  VER_CONVIVENCIA: [ROLES.ADMIN, ROLES.COORDINADOR_CONVIVENCIA],
  VER_PROPIO: [ROLES.ESTUDIANTE],
  VER_HIJOS: [ROLES.ACUDIENTE],
};

export const ROLES_PERSONAL_PREDICTIVO = PERSONAL;

export function puedePredictivo(rol: Rol | string | undefined | null, accion: AccionPredictivo): boolean {
  return !!rol && (MATRIZ[accion] as readonly string[]).includes(rol);
}

/** Lo que un perfil puede ver dentro de un análisis: la pantalla lo recibe del servidor y solo lo refleja. */
export function vistaDelAnalisis(rol: Rol | string | undefined | null): { probabilidad: boolean; convivencia: boolean } {
  return { probabilidad: puedePredictivo(rol, 'VER_PROBABILIDAD'), convivencia: puedePredictivo(rol, 'VER_CONVIVENCIA') };
}
