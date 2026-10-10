/**
 * El texto de un párrafo de plantilla se guarda con variables escritas `{{modulo.dato}}` (así lo valida y lo resuelve el servidor). El editor
 * las muestra como fichas; estas funciones convierten entre las dos formas sin perder nada. El formato guardado no cambia.
 */
export type SegmentoPlantilla = { tipo: 'texto'; texto: string } | { tipo: 'variable'; clave: string };

const PATRON_VARIABLE = /\{\{\s*([a-z_]+(?:\.[a-z_]+)*)\s*\}\}/g;

/** Parte un texto guardado en trozos de texto y variables, en orden. Las llaves mal cerradas se quedan como texto (el servidor las rechaza al publicar). */
export function aSegmentos(texto: string): SegmentoPlantilla[] {
  const segmentos: SegmentoPlantilla[] = [];
  let desde = 0;
  for (const coincidencia of texto.matchAll(PATRON_VARIABLE)) {
    const inicio = coincidencia.index ?? 0;
    if (inicio > desde) segmentos.push({ tipo: 'texto', texto: texto.slice(desde, inicio) });
    segmentos.push({ tipo: 'variable', clave: coincidencia[1] as string });
    desde = inicio + coincidencia[0].length;
  }
  if (desde < texto.length) segmentos.push({ tipo: 'texto', texto: texto.slice(desde) });
  return segmentos;
}

/** La forma guardada: cada variable como `{{clave}}`. */
export function aTexto(segmentos: SegmentoPlantilla[]): string {
  return segmentos.map((s) => (s.tipo === 'texto' ? s.texto : `{{${s.clave}}}`)).join('');
}

/** Lo que se pega se limpia: una sola línea, sin saltos ni espacios extraños (un párrafo de plantilla es un solo párrafo). */
export function limpiarPegado(texto: string): string {
  return texto.replace(/ /g, ' ').replace(/\s*[\r\n]+\s*/g, ' ');
}
