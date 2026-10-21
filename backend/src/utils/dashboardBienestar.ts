/**
 * Cálculos de los paneles de convivencia y orientación (M30). Puros: reciben conteos ya leídos de M14, M15 y M16. Esos módulos guardan datos de
 * menores, así que aquí solo se cuenta: nada de lo que sale de estas funciones lleva hechos, nombres ni diagnósticos.
 */

const MS_DIA = 86_400_000;

export type AlcanceDeSedes = 'TODAS' | string[];

/**
 * Las sedes que un panel puede mirar: las que el rol tiene (todas, para rectoría) y, si se pide una sede, solo esa **si está dentro de ese alcance**.
 * Pedir una sede ajena no la abre: queda sin ninguna.
 */
export function sedesPermitidas(alcance: AlcanceDeSedes, solicitada?: string): AlcanceDeSedes {
  if (!solicitada) return alcance;
  if (alcance === 'TODAS') return [solicitada];
  return alcance.includes(solicitada) ? [solicitada] : [];
}

/** El filtro de Mongo para esas sedes: vacío para todas; con una lista vacía no coincide con nada (un rol sin sedes asignadas no ve nada). */
export function filtroDeSedes(sedes: AlcanceDeSedes): Record<string, unknown> {
  return sedes === 'TODAS' ? {} : { sede_id: { $in: sedes } };
}

/** Días completos desde `fecha` hasta `ahora`, o `null` si no hay fecha (p. ej. no hay nada pendiente). Nunca negativo. */
export function diasDesde(fecha: Date | null | undefined, ahora: Date): number | null {
  if (!fecha) return null;
  return Math.max(0, Math.floor((ahora.getTime() - fecha.getTime()) / MS_DIA));
}

/** Cuenta cuántos elementos caen en cada clave, partiendo de ceros para que la pantalla siempre tenga todas las claves. */
export function contarPorClave<K extends string>(claves: readonly K[], elementos: readonly K[]): Record<K, number> {
  const conteo = Object.fromEntries(claves.map((k) => [k, 0])) as Record<K, number>;
  for (const e of elementos) if (e in conteo) conteo[e] += 1;
  return conteo;
}

export interface AjusteParaSeguimiento {
  seguimientos: ReadonlyArray<{ periodo_numero: number }>;
}

/** Un ajuste del PIAR cumple cuando tiene seguimientos en al menos tantos periodos distintos como el mínimo que fijó el colegio (M16). */
export function resumirSeguimientoDeAjustes(ajustes: readonly AjusteParaSeguimiento[], minimo: number): { total: number; con_minimo: number } {
  const conMinimo = ajustes.filter((a) => new Set(a.seguimientos.map((s) => s.periodo_numero)).size >= minimo).length;
  return { total: ajustes.length, con_minimo: conMinimo };
}
