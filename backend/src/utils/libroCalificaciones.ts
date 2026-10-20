import { RESULTADOS_FINALES } from '../constants/promocion';

interface FilaParaLibro {
  numero_documento: string;
  nombres: string;
  apellidos: string;
  promocion: { codigo: string; oficial: boolean } | null;
}

/**
 * Quiénes impiden emitir el libro: un libro es un registro definitivo y no se corrige después, así que cada estudiante debe tener el cierre de
 * promoción **oficial** y con un resultado final (promovido o no promovido). Quien espera recuperación, comisión, una persona o notas, o aún no tiene
 * cierre, bloquea. Devuelve «grupo · apellidos nombres (documento)» de cada uno; vacío = se puede emitir.
 */
export function estudiantesQueBloqueanElLibro(grupos: ReadonlyArray<{ etiqueta: string; filas: readonly FilaParaLibro[] }>): string[] {
  const bloquean: string[] = [];
  for (const g of grupos) {
    for (const f of g.filas) {
      const final = f.promocion?.oficial && (RESULTADOS_FINALES as readonly string[]).includes(f.promocion.codigo);
      if (!final) bloquean.push(`${g.etiqueta} · ${f.apellidos} ${f.nombres} (${f.numero_documento})`);
    }
  }
  return bloquean;
}

/** `LC-2026-001`. */
export const codigoDeLibro = (anio: number, consecutivo: number): string => `LC-${anio}-${String(consecutivo).padStart(3, '0')}`;

/**
 * Los folios que ocupa un libro dados los ya usados en el año: el contador devuelve el último folio tras reservar `paginas`, así que el libro va del
 * siguiente al anterior al reservado hasta ese último. Sin huecos ni repeticiones entre libros.
 */
export function rangoDeFolios(ultimoFolio: number, paginas: number): { inicial: number; final: number } {
  return { inicial: ultimoFolio - paginas + 1, final: ultimoFolio };
}
