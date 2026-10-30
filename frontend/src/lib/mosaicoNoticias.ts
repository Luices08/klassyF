import type { Noticia, TamanoMosaico } from '../hooks/useNoticias';
import type { Tone } from '../components/ui/Badge';

/**
 * Las reglas del mosaico (cuadrícula de 4 columnas en pantallas anchas y 2 en las pequeñas): cuánto ocupa cada tamaño, cómo se coloca y cuántas noticias caben.
 * El redactor elige el tamaño; aquí solo se decide cómo se acomodan juntas.
 */
export const ORDEN_TAMANOS: TamanoMosaico[] = ['PRINCIPAL', 'DESTACADA', 'ESTANDAR', 'BREVE', 'BANDA'];

export const INFO_TAMANO: Record<TamanoMosaico, { etiqueta: string; medida: string; descripcion: string; celdas: number }> = {
  PRINCIPAL: { etiqueta: 'Principal', medida: 'Grande 2x2', descripcion: 'La noticia del día: ocupa un cuadrado grande.', celdas: 4 },
  DESTACADA: { etiqueta: 'Destacada', medida: 'Horizontal 2x1', descripcion: 'Ancha y baja: para un evento o un comunicado importante.', celdas: 2 },
  ESTANDAR: { etiqueta: 'Estándar', medida: 'Vertical 1x2', descripcion: 'Alta y angosta: la noticia de todos los días.', celdas: 2 },
  BREVE: { etiqueta: 'Breve', medida: '1x1', descripcion: 'Un cuadro pequeño: un aviso corto.', celdas: 1 },
  BANDA: { etiqueta: 'Banda', medida: 'Ancho completo 4x1', descripcion: 'Una fila entera, con la foto a un lado y el texto al otro: para lo que no debe pasar desapercibido.', celdas: 4 },
};

/** Cuántas columnas y filas ocupa cada tamaño en la cuadrícula. Las clases van completas para que Tailwind las encuentre. */
export const CLASES_CELDA: Record<TamanoMosaico, string> = {
  PRINCIPAL: 'col-span-2 row-span-2',
  DESTACADA: 'col-span-2',
  ESTANDAR: 'row-span-2',
  BREVE: '',
  // En celular (2 columnas) la banda es de dos filas: la foto va arriba y el texto abajo.
  BANDA: 'col-span-2 row-span-2 md:col-span-4 md:row-span-1',
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

// --- Disposición: cuántas noticias hay decide cómo se dibujan ---

/** Con una o dos noticias vigentes se dibujan como bandas a todo el ancho (foto a un lado, texto al otro), sea cual sea su tamaño; con más, el mosaico. */
export const MAX_NOTICIAS_EN_BANDAS = 2;

/** Cuántas columnas y filas ocupa cada tamaño en la cuadrícula de 4 columnas (las mismas medidas de `CLASES_CELDA`). */
const MEDIDA: Record<TamanoMosaico, { ancho: number; alto: number }> = {
  PRINCIPAL: { ancho: 2, alto: 2 },
  DESTACADA: { ancho: 2, alto: 1 },
  ESTANDAR: { ancho: 1, alto: 2 },
  BREVE: { ancho: 1, alto: 1 },
  BANDA: { ancho: 4, alto: 1 },
};
const COLUMNAS = 4;

/**
 * Cuántas celdas quedan vacías en la cuadrícula de 4 columnas con el flujo «denso» de CSS: cada tarjeta, en orden, toma el primer lugar libre donde cabe (de arriba abajo y
 * de izquierda a derecha). Es la misma regla que aplica el navegador, así se sabe de antemano si una combinación de tamaños deja huecos.
 */
export function huecosDelMosaico(tamanos: TamanoMosaico[]): number {
  const ocupada = new Set<string>();
  const libre = (fila: number, col: number, ancho: number, alto: number) => {
    for (let f = fila; f < fila + alto; f++) for (let c = col; c < col + ancho; c++) if (ocupada.has(`${f}:${c}`)) return false;
    return true;
  };
  let filas = 0;
  let celdas = 0;
  for (const tamano of tamanos) {
    const { ancho, alto } = MEDIDA[tamano];
    colocar: for (let fila = 0; ; fila++) {
      for (let col = 0; col + ancho <= COLUMNAS; col++) {
        if (!libre(fila, col, ancho, alto)) continue;
        for (let f = fila; f < fila + alto; f++) for (let c = col; c < col + ancho; c++) ocupada.add(`${f}:${c}`);
        filas = Math.max(filas, fila + alto);
        celdas += ancho * alto;
        break colocar;
      }
    }
  }
  return filas * COLUMNAS - celdas;
}

/** A qué tamaños puede crecer una tarjeta para tapar un hueco, de la mejora más pequeña a la mayor. */
const MEJORAS: Record<TamanoMosaico, TamanoMosaico[]> = {
  BREVE: ['ESTANDAR', 'DESTACADA', 'PRINCIPAL', 'BANDA'],
  ESTANDAR: ['PRINCIPAL'],
  DESTACADA: ['BANDA', 'PRINCIPAL'],
  PRINCIPAL: [],
  BANDA: [],
};

/**
 * Deja el mosaico sin huecos. Primero agranda una tarjeta (la última que se pueda) o dos, un paso; si ninguna combinación cierra la última fila, quita la última
 * noticia y vuelve a intentar. Nunca agrega una segunda Principal (en el inicio solo la primera se ve grande).
 */
export function mosaicoSinHuecos(elegidas: NoticiaEnMosaico[]): NoticiaEnMosaico[] {
  let lista = elegidas;
  while (lista.length > MAX_NOTICIAS_EN_BANDAS && huecosDelMosaico(lista.map((e) => e.tamano)) > 0) {
    const cambiar = (indices: number[], tamanos: TamanoMosaico[]) => lista.map((e, i) => (indices.includes(i) ? { ...e, tamano: tamanos[indices.indexOf(i)] as TamanoMosaico } : e));
    const sirve = (prueba: NoticiaEnMosaico[]) => huecosDelMosaico(prueba.map((e) => e.tamano)) === 0 && prueba.filter((e) => e.tamano === 'PRINCIPAL').length <= 1;
    let arreglada: NoticiaEnMosaico[] | null = null;

    for (let i = lista.length - 1; i >= 0 && !arreglada; i--) {
      for (const mejora of MEJORAS[(lista[i] as NoticiaEnMosaico).tamano]) {
        const prueba = cambiar([i], [mejora]);
        if (sirve(prueba)) {
          arreglada = prueba;
          break;
        }
      }
    }
    for (let i = lista.length - 1; i >= 0 && !arreglada; i--) {
      for (let j = i - 1; j >= 0 && !arreglada; j--) {
        for (const a of MEJORAS[(lista[i] as NoticiaEnMosaico).tamano]) {
          for (const b of MEJORAS[(lista[j] as NoticiaEnMosaico).tamano]) {
            const prueba = cambiar([i, j], [a, b]);
            if (sirve(prueba)) {
              arreglada = prueba;
              break;
            }
          }
          if (arreglada) break;
        }
      }
    }
    lista = arreglada ?? lista.slice(0, -1);
  }
  return lista;
}

export type DisposicionNoticias = 'BANDAS' | 'MOSAICO';

/**
 * Cómo se muestran las noticias de un inicio. Con una o dos: bandas a todo el ancho, porque una tarjeta de mosaico estirada se vería mal (es una foto con texto encima
 * pensada para un cuadro pequeño). Con tres o más: el mosaico de siempre, con el tamaño que eligió cada redactor y sin huecos al final (`ajustar`, solo para la cuadrícula
 * de 4 columnas; la vista previa del formulario es angosta y no lo usa).
 */
export function disponerNoticias(noticias: Noticia[], presupuesto = 12, ajustar = true): { disposicion: DisposicionNoticias; elegidas: NoticiaEnMosaico[] } {
  const elegidas = paraMosaico(noticias, presupuesto);
  if (elegidas.length <= MAX_NOTICIAS_EN_BANDAS) return { disposicion: 'BANDAS', elegidas };
  const final = ajustar ? mosaicoSinHuecos(elegidas) : elegidas;
  return final.length <= MAX_NOTICIAS_EN_BANDAS ? { disposicion: 'BANDAS', elegidas: final } : { disposicion: 'MOSAICO', elegidas: final };
}
