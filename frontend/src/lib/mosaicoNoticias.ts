import type { Noticia, TamanoMosaico } from '../hooks/useNoticias';
import type { Tone } from '../components/ui/Badge';

/**
 * Las reglas del mosaico (cuadrícula de 4 columnas en pantallas anchas y 2 en las pequeñas): cuánto ocupa cada tamaño, cómo se coloca y cuántas noticias caben.
 * El redactor elige el tamaño; aquí solo se decide cómo se acomodan juntas.
 */
export const ORDEN_TAMANOS: TamanoMosaico[] = ['PRINCIPAL', 'DESTACADA', 'ESTANDAR', 'BREVE'];

export const INFO_TAMANO: Record<TamanoMosaico, { etiqueta: string; medida: string; descripcion: string; celdas: number }> = {
  PRINCIPAL: { etiqueta: 'Principal', medida: 'Grande 2x2', descripcion: 'La noticia del día: ocupa un cuadrado grande.', celdas: 4 },
  DESTACADA: { etiqueta: 'Destacada', medida: 'Horizontal 2x1', descripcion: 'Ancha y baja: para un evento o un comunicado importante.', celdas: 2 },
  ESTANDAR: { etiqueta: 'Estándar', medida: 'Vertical 1x2', descripcion: 'Alta y angosta: la noticia de todos los días.', celdas: 2 },
  BREVE: { etiqueta: 'Breve', medida: '1x1', descripcion: 'Un cuadro pequeño: un aviso corto.', celdas: 1 },
};

/** Cuántas columnas y filas ocupa cada tamaño en la cuadrícula. Las clases van completas para que Tailwind las encuentre. */
export const CLASES_CELDA: Record<TamanoMosaico, string> = {
  PRINCIPAL: 'col-span-2 row-span-2',
  DESTACADA: 'col-span-2',
  ESTANDAR: 'row-span-2',
  BREVE: '',
};

/** El fondo de una tarjeta sin portada (solo las noticias anteriores a la portada obligatoria): el color suave de su categoría, nunca un color nuevo. */
export const FONDO_DE_TONO: Record<Tone, string> = {
  blue: 'bg-primary-soft',
  green: 'bg-success-soft',
  orange: 'bg-warning-soft',
  red: 'bg-danger-soft',
  neutral: 'bg-soft',
};

export interface NoticiaEnMosaico {
  noticia: Noticia;
  /** El tamaño con el que se dibuja: el que eligió el redactor, salvo una segunda Principal, que baja a Destacada. */
  tamano: TamanoMosaico;
}

/**
 * Qué noticias se muestran y con qué tamaño. Solo la primera Principal se ve grande (varias Principales dejarían el mosaico sin respiro: las demás se dibujan como
 * Destacadas), y `presupuesto` limita cuántas celdas se ocupan en total (en un inicio no se muestra todo; en la página de noticias sí, con `Infinity`). Una noticia que
 * no cabe se salta, y una más pequeña que viene después sí puede entrar: así el mosaico se llena sin dejar huecos grandes. La primera siempre entra.
 */
export function paraMosaico(noticias: Noticia[], presupuesto = 12): NoticiaEnMosaico[] {
  const elegidas: NoticiaEnMosaico[] = [];
  let principalUsada = false;
  let celdasUsadas = 0;
  for (const noticia of noticias) {
    let tamano = noticia.tamano_mosaico;
    if (tamano === 'PRINCIPAL') {
      if (principalUsada) tamano = 'DESTACADA';
      else principalUsada = true;
    }
    const celdas = INFO_TAMANO[tamano].celdas;
    if (elegidas.length > 0 && celdasUsadas + celdas > presupuesto) continue;
    elegidas.push({ noticia, tamano });
    celdasUsadas += celdas;
  }
  return elegidas;
}
