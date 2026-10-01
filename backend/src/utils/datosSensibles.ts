import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';

/**
 * Campos de salud de StudentProfile que exigen autorizacion explicita para
 * guardarse (Ley 1581 de 2012, art. 5-6: "dato sensible"; art. 7 para menores
 * de edad). `alergias_condiciones` entra aqui tambien (es dato de salud), pero
 * a diferencia de los otros 3 SI se le muestra a DOCENTE: un profesor necesita
 * conocerla por seguridad del estudiante (ver CAMPOS_SALUD_ADMINISTRATIVA).
 */
export const CAMPOS_SALUD_SENSIBLES = ['eps', 'rh', 'regimen_salud', 'alergias_condiciones'] as const;

/**
 * Subconjunto puramente administrativo/de aseguramiento (sin relevancia para
 * la labor diaria de un docente): se oculta a DOCENTE por minimizacion de
 * datos (Ley 1581, principio de finalidad). `alergias_condiciones` queda
 * fuera a proposito — ver comentario arriba.
 */
const CAMPOS_SALUD_ADMINISTRATIVA = ['eps', 'rh', 'regimen_salud'] as const;

/** true si el perfil trae algun dato de salud que requeriria autorizacion para guardarse. */
export function tieneDatoSaludSensible(valores: object): boolean {
  const v = valores as Record<string, unknown>;
  return CAMPOS_SALUD_SENSIBLES.some((campo) => v[campo] !== undefined && v[campo] !== null && v[campo] !== '');
}

/**
 * Oculta los campos de salud puramente administrativos cuando quien consulta
 * es DOCENTE. ADMIN/COORDINADOR/SECRETARIA (gestion de matricula, salud,
 * convivencia) y el propio flujo administrativo siguen viendo todo.
 */
export function ocultarSaludAdministrativa<T extends object>(perfil: T, rolSolicitante: Rol): T {
  if (rolSolicitante !== ROLES.DOCENTE) return perfil;
  const copia = { ...perfil } as Record<string, unknown>;
  for (const campo of CAMPOS_SALUD_ADMINISTRATIVA) delete copia[campo];
  return copia as T;
}
