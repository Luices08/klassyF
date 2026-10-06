import { ROLES_QUE_SE_REMITEN, RolInvolucrado } from '../comun/convivencia.constants';

/** Clave de idempotencia de una remisión automática: el mismo estudiante no se remite dos veces por la misma medida o paso. */
export const claveDeRemision = (casoId: string, studentId: string, origen: 'MEDIDA' | 'PASO', origenId: string): string =>
  `${casoId}:${studentId}:${origen}:${origenId}`;

/** De los involucrados de un caso, a quiénes se remite: afectados y presuntos responsables (no testigos ni reportantes). */
export function involucradosARemitir<T extends { rol: RolInvolucrado }>(involucrados: readonly T[]): T[] {
  return involucrados.filter((i) => ROLES_QUE_SE_REMITEN.includes(i.rol));
}
