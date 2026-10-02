/**
 * Cargas masivas de convivencia (M14). Una plantilla por proceso; el sistema define las columnas y el archivo se lee por
 * la misma vía (Excel o CSV) y se valida completo antes de escribir. Aquí viven las columnas: la plantilla, la hoja de
 * instrucciones y la validación salen de esta única fuente. La guía del frontend (lib/columnasImportacion.ts) las refleja.
 */
export const PROCESOS_IMPORTACION = ['tipos', 'categorias', 'frases', 'observaciones'] as const;
export type ProcesoImportacion = (typeof PROCESOS_IMPORTACION)[number];

export const NOMBRES_PROCESO_IMPORTACION: Record<ProcesoImportacion, string> = {
  tipos: 'Tipos de observación',
  categorias: 'Categorías',
  frases: 'Frases y faltas del manual',
  observaciones: 'Observaciones académicas y comportamentales',
};

export interface ColumnaImportacion {
  nombre: string;
  obligatoria: boolean;
  descripcion: string;
  ejemplo: string;
}

export const COLUMNAS_IMPORTACION: Record<ProcesoImportacion, ColumnaImportacion[]> = {
  tipos: [
    { nombre: 'nombre', obligatoria: true, descripcion: 'Nombre del tipo. Si ya existe, se actualiza.', ejemplo: 'Comportamental' },
    { nombre: 'familia', obligatoria: true, descripcion: 'ACADEMICA, COMPORTAMENTAL o DISCIPLINARIA. No se cambia en un tipo ya creado.', ejemplo: 'COMPORTAMENTAL' },
    { nombre: 'visible_estudiante', obligatoria: false, descripcion: 'SI o NO: si el estudiante ve estas observaciones (vacío = NO).', ejemplo: 'SI' },
    { nombre: 'orden', obligatoria: false, descripcion: 'Número entero para ordenar (vacío = 0).', ejemplo: '2' },
    { nombre: 'estado', obligatoria: false, descripcion: 'ACTIVO o INACTIVO (vacío = ACTIVO).', ejemplo: 'ACTIVO' },
  ],
  categorias: [
    { nombre: 'nombre', obligatoria: true, descripcion: 'Nombre de la categoría. Si ya existe, se actualiza.', ejemplo: 'Compromisos académicos' },
    { nombre: 'orden', obligatoria: false, descripcion: 'Número entero para ordenar (vacío = 0).', ejemplo: '1' },
    { nombre: 'estado', obligatoria: false, descripcion: 'ACTIVO o INACTIVO (vacío = ACTIVO).', ejemplo: 'ACTIVO' },
  ],
  frases: [
    { nombre: 'tipo', obligatoria: true, descripcion: 'Nombre de un tipo de observación que ya existe.', ejemplo: 'Disciplinaria' },
    { nombre: 'categoria', obligatoria: false, descripcion: 'Nombre de una categoría que ya existe (cárgala antes).', ejemplo: 'Compromisos académicos' },
    { nombre: 'codigo', obligatoria: false, descripcion: 'Código de la falta en el manual (identifica la fila dentro de su tipo).', ejemplo: '1.3' },
    { nombre: 'texto', obligatoria: true, descripcion: 'Texto de la frase o falta (máximo 400 caracteres).', ejemplo: 'Debe estar puntual en clase.' },
    { nombre: 'tipo_situacion', obligatoria: false, descripcion: 'I, II o III. Solo en tipos disciplinarios.', ejemplo: 'I' },
    { nombre: 'descuento_decimas', obligatoria: false, descripcion: 'Décimas que descuenta el manual. Solo se guarda; no se aplica a notas.', ejemplo: '0,3' },
    { nombre: 'orden', obligatoria: false, descripcion: 'Número entero para ordenar (vacío = 0).', ejemplo: '3' },
    { nombre: 'estado', obligatoria: false, descripcion: 'ACTIVO o INACTIVO (vacío = ACTIVO).', ejemplo: 'ACTIVO' },
  ],
  observaciones: [
    { nombre: 'numero_documento', obligatoria: true, descripcion: 'Documento del estudiante, como texto (conserva los ceros).', ejemplo: '1098765432' },
    { nombre: 'fecha_hecho', obligatoria: true, descripcion: 'AAAA-MM-DD o DD/MM/AAAA. No puede ser futura.', ejemplo: '2026-03-12' },
    { nombre: 'tipo', obligatoria: true, descripcion: 'Nombre de un tipo académico o comportamental. Lo disciplinario no se carga por archivo.', ejemplo: 'Comportamental' },
    { nombre: 'descriptores', obligatoria: false, descripcion: 'Códigos o textos de frases del tipo, separados con |. Hay que poner frases o comentario.', ejemplo: 'C-01|C-04' },
    { nombre: 'comentario', obligatoria: false, descripcion: 'Texto libre (máximo 2000 caracteres).', ejemplo: 'Participó activamente en el debate.' },
  ],
};

export const MAX_BYTES_IMPORTACION = 2 * 1024 * 1024;
export const MAX_FILAS_IMPORTACION: Record<ProcesoImportacion, number> = { tipos: 200, categorias: 200, frases: 1000, observaciones: 500 };
export const VERSION_PLANTILLA_IMPORTACION = 1;
