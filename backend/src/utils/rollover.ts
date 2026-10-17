import { RESULTADOS_FINALES, ResultadoPromocion } from '../constants/promocion';

// Funciones puras del paso de un año al siguiente (M19, fase 7): a dónde va cada estudiante según su cierre y cómo se reparten los cupos.

/**
 * - GRADO_SIGUIENTE: promovido → pre-matrícula como ANTIGUO en el grado siguiente.
 * - MISMO_GRADO: no promovido → pre-matrícula como REPITENTE en el mismo grado.
 * - TERMINA_CICLO: promovido en el último grado; lo que sigue es la titulación, no una matrícula.
 * - NO_RENUEVA_CUPO: una regla del colegio decidió no renovarle el cupo (consecuencia de permanencia, nunca académica).
 * - SIN_DECISION: su promoción aún no es un resultado final (recuperación, comisión, retiro por confirmar o notas): no se pre-matricula.
 */
export type DestinoRollover = 'GRADO_SIGUIENTE' | 'MISMO_GRADO' | 'TERMINA_CICLO' | 'NO_RENUEVA_CUPO' | 'SIN_DECISION';

export interface EntradaDestino {
  /** null = el estudiante no tiene cierre de promoción vigente. */
  resultado: ResultadoPromocion | null;
  no_renueva_cupo: boolean;
  hay_grado_siguiente: boolean;
}

export function destinoDeRollover(e: EntradaDestino): { destino: DestinoRollover; motivo: string } {
  if (e.resultado === null) return { destino: 'SIN_DECISION', motivo: 'Su grupo aún no tiene cierre de promoción.' };
  if (!RESULTADOS_FINALES.includes(e.resultado)) return { destino: 'SIN_DECISION', motivo: `Su promoción sigue en ${e.resultado}.` };
  if (e.no_renueva_cupo) return { destino: 'NO_RENUEVA_CUPO', motivo: 'Una regla del colegio dispuso no renovar el cupo.' };
  if (e.resultado === 'NO_PROMOVIDO') return { destino: 'MISMO_GRADO', motivo: 'No promovido: repite el grado.' };
  if (!e.hay_grado_siguiente) return { destino: 'TERMINA_CICLO', motivo: 'Terminó el último grado: lo que sigue es su titulación.' };
  return { destino: 'GRADO_SIGUIENTE', motivo: '' };
}

export interface SolicitudDeCupo {
  id: string;
  /** Grupos donde puede ir, del preferido al último recurso. */
  candidatos: readonly string[];
}

/**
 * Reparte los cupos en el orden en que llegan las solicitudes: cada una toma el primer candidato con lugar. Devuelve `null` para quien
 * no encontró cupo. Es determinista, así la simulación y la ejecución dan exactamente el mismo reparto.
 */
export function asignarCupos(solicitudes: readonly SolicitudDeCupo[], libres: ReadonlyMap<string, number>): Map<string, string | null> {
  const restantes = new Map(libres);
  const asignado = new Map<string, string | null>();
  for (const s of solicitudes) {
    const elegido = s.candidatos.find((g) => (restantes.get(g) ?? 0) > 0) ?? null;
    if (elegido) restantes.set(elegido, (restantes.get(elegido) as number) - 1);
    asignado.set(s.id, elegido);
  }
  return asignado;
}
