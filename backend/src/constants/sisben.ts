/**
 * Grupos del SISBEN IV (DNP): cuatro letras con un número de subgrupo cada una. «NO APLICA» no es un grupo: es no tener
 * SISBEN, y se guarda como vacío. Validar con el esquema vigente del DNP si cambia la clasificación.
 */
const SUBGRUPOS_POR_LETRA = { A: 5, B: 7, C: 18, D: 21 } as const;

export const GRUPOS_SISBEN: readonly string[] = Object.entries(SUBGRUPOS_POR_LETRA).flatMap(([letra, cantidad]) =>
  Array.from({ length: cantidad }, (_, i) => `${letra}${i + 1}`)
);

export type GrupoSisben = string;

/** `A4`, `a 4` o ` B12 ` -> `A4`/`B12`. Vacío o «NO APLICA» -> null (sin SISBEN). Un valor que no es un grupo -> undefined. */
export function normalizarGrupoSisben(valor: unknown): string | null | undefined {
  const texto = String(valor ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (texto === '' || texto === 'NOAPLICA' || texto === 'NA' || texto === 'N/A') return null;
  return GRUPOS_SISBEN.includes(texto) ? texto : undefined;
}
