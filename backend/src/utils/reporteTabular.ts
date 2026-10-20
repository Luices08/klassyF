/** Un listado de cierre anual (recuperación final, retirados, servicio social…): lo arma un servicio y lo dibujan el escritor de Excel y el de PDF. */
export interface ColumnaReporte {
  clave: string;
  titulo: string;
  /** Ancho relativo; el PDF reparte la hoja en proporción y el Excel lo usa como ancho de columna. */
  ancho: number;
  alinear?: 'left' | 'center' | 'right';
  /** Se guarda como texto aunque parezca número (documentos con ceros a la izquierda). */
  texto?: boolean;
}

export type CeldaReporte = string | number | null;

export interface ReporteTabular {
  /** «Estudiantes en recuperación final», sin año ni institución. */
  titulo: string;
  institucion: string;
  anio: number;
  generado_en: Date;
  /** Qué abarca el listado: sede, jornada, grado y grupo elegidos. */
  alcance: string;
  /** El punto en que están los datos y qué tener en cuenta (se calcula al descargar). */
  leyenda: string;
  resumen: Array<[string, string | number]>;
  columnas: ColumnaReporte[];
  filas: Array<Record<string, CeldaReporte>>;
  /** Lo que se dice cuando no hay filas. */
  mensaje_vacio: string;
  /** Sin extensión. */
  nombre_archivo: string;
}

const limpiar = (texto: string): string => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();

export const nombreDeArchivo = (...partes: Array<string | number | null | undefined>): string => partes.filter((p) => p !== null && p !== undefined && p !== '').map((p) => limpiar(String(p))).join('-');
