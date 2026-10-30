/** Grupos del SISBEN IV (DNP): A1–A5, B1–B7, C1–C18 y D1–D21. Espejo de `backend/src/constants/sisben.ts`: si cambia uno, cambia el otro. */
export const SUBGRUPOS_SISBEN = { A: 5, B: 7, C: 18, D: 21 } as const;

export const LETRAS_SISBEN = Object.keys(SUBGRUPOS_SISBEN) as Array<keyof typeof SUBGRUPOS_SISBEN>;

export const gruposDeSisben = (letra: keyof typeof SUBGRUPOS_SISBEN): string[] => Array.from({ length: SUBGRUPOS_SISBEN[letra] }, (_, i) => `${letra}${i + 1}`);

export const GRUPOS_SISBEN: string[] = LETRAS_SISBEN.flatMap(gruposDeSisben);
