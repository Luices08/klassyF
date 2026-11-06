/** Cuántos botones de número muestra la paginación a la vez: con cientos de páginas no se dibuja uno por página. */
export const MAX_BOTONES_PAGINA = 5;

/** Ventana de hasta `maximo` páginas alrededor de la actual, sin salirse de 1..paginas. */
export function paginasVisibles(pagina: number, paginas: number, maximo = MAX_BOTONES_PAGINA): number[] {
  const cantidad = Math.min(maximo, paginas);
  let inicio = Math.max(1, pagina - Math.floor(cantidad / 2));
  inicio = Math.min(inicio, paginas - cantidad + 1);
  return Array.from({ length: cantidad }, (_, i) => inicio + i);
}
