/**
 * Carga masiva de las faltas del manual de convivencia (M15). El manual ya existe en un documento y tiene decenas de faltas:
 * cargarlas por archivo evita digitarlas una por una. Es la única carga masiva de convivencia: las observaciones se
 * registran una a una porque cada una exige criterio del docente. La plantilla, la hoja de instrucciones y la validación
 * salen de estas columnas; la guía del frontend (lib/columnasImportacion.ts) las refleja.
 */
export const PROCESOS_IMPORTACION = ['faltas'] as const;
export type ProcesoImportacion = (typeof PROCESOS_IMPORTACION)[number];

export interface ColumnaImportacion {
  nombre: string;
  obligatoria: boolean;
  descripcion: string;
  ejemplo: string;
}

export const COLUMNAS_FALTAS: ColumnaImportacion[] = [
  { nombre: 'codigo', obligatoria: true, descripcion: 'Numeral de la falta en el manual. Identifica la fila: si ya existe, se actualiza.', ejemplo: '2.15' },
  { nombre: 'descripcion', obligatoria: true, descripcion: 'Texto de la falta (máximo 400 caracteres).', ejemplo: 'Debe portar los tenis correspondientes al uniforme.' },
  { nombre: 'gravedad', obligatoria: true, descripcion: 'I, II o III, según el manual.', ejemplo: 'I' },
  { nombre: 'descuento_decimas', obligatoria: false, descripcion: 'Décimas que descuenta el manual (0 a 5, con coma o punto). Solo se guarda; no se aplica a notas.', ejemplo: '0,2' },
  { nombre: 'estado', obligatoria: false, descripcion: 'ACTIVO o INACTIVO (vacío = ACTIVO).', ejemplo: 'ACTIVO' },
];

export const MAX_BYTES_IMPORTACION = 2 * 1024 * 1024;
export const MAX_FILAS_IMPORTACION = 1000;
export const VERSION_PLANTILLA_IMPORTACION = 1;
