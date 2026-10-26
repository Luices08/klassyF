import type { EsquemaFoliatura } from '../hooks/useFoliatura';

// Espejo de `backend/src/utils/foliatura.ts`, solo para la vista previa en vivo de la pantalla del Libro de Matrícula: el servidor es quien valida
// la máscara y asigna los folios. Si cambia una, cambia la otra.

const PARTE = /\{(libro|folio|año|anio)(?::(\d{1,2}))?\}/g;

/** Arma el código del folio reemplazando las partes de la máscara. */
export function renderizarMascara(mascara: string, partes: { libro: number; folio: number; anio: number }): string {
  return mascara.replace(PARTE, (_todo, nombre: string, ancho?: string) => {
    const n = nombre === 'libro' ? partes.libro : nombre === 'folio' ? partes.folio : partes.anio;
    return ancho ? String(n).padStart(Number(ancho), '0') : String(n);
  });
}

/** El libro y el folio que saldrían con estos valores (el continuo con capacidad abre el libro siguiente al llenarse). */
export function siguienteDelFormulario(f: { esquema: EsquemaFoliatura; libro: number; ultimoFolio: number; capacidad: number | null }): { libro: number; folio: number } {
  if (f.esquema === 'CONTINUO' && f.capacidad !== null && f.ultimoFolio >= f.capacidad) return { libro: f.libro + 1, folio: 1 };
  return { libro: f.libro, folio: f.ultimoFolio + 1 };
}
