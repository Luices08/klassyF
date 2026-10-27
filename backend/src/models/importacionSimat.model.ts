import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { CLASIFICACIONES_SIMAT, ClasificacionSimat, ESTADOS_LOTE_SIMAT, EstadoLoteSimat, FORMATOS_SIMAT, FormatoSimat } from '../constants/importacionSimat';

export interface IOpcionesImportacionSimat {
  /** Reincorporar a quien SIMAT muestra matriculado y en Klassy está retirado o inactivo (cada una queda auditada). */
  reincorporar_retirados: boolean;
  /** El colegio declara que cuenta con la autorización de las familias para tratar EPS y tipo de sangre; sin esto no se importan. */
  autorizacion_datos_salud: boolean;
  /** Cupo de los grupos que la importación crea (el archivo no lo trae); nunca menor al número de estudiantes. */
  cupo_por_defecto: number;
  /** Plazo del acta de compromiso de las matrículas que nacen condicionales. */
  dias_compromiso: number;
}

export interface IGrupoPorCrear {
  sede_id: Types.ObjectId;
  sede_nombre: string;
  jornada_id: Types.ObjectId;
  jornada_nombre: string;
  grade_id: Types.ObjectId;
  grado_nombre: string;
  codigo_simat: string;
  estudiantes: number;
}

/** Lo que el usuario debe leer antes de confirmar (acudiente por crear, información por revisar, marca de los registros…). */
export interface IAvisoPrevio {
  clave: 'ACUDIENTE' | 'REVISION' | 'MARCA' | 'SALUD' | 'FOLIOS' | 'GRUPOS' | 'CONFLICTOS';
  titulo: string;
  detalle: string;
  severidad: 'info' | 'warning';
  cantidad: number;
}

export interface IResumenImportacionSimat {
  filas_archivo: number;
  filas_otras_instituciones: number;
  filas_sin_institucion: number;
  filas_institucion: number;
  instituciones_en_archivo: number;
  por_clasificacion: Record<string, number>;
  por_motivo: Record<string, number>;
  /** Cuántos estudiantes quedarán sin acudiente (todos los nuevos; los antiguos solo si no tienen uno vinculado). */
  sin_acudiente: number;
  con_datos_de_salud: number;
  con_cambios: number;
  /** Matrículas que se crearán, formalizarán o confirmarán. */
  matriculas_por_crear: number;
  matriculas_por_formalizar: number;
  matriculas_confirmadas: number;
  /** FECHAINI más reciente del archivo: da idea de qué tan viejo es el corte. */
  fecha_mas_reciente: Date | null;
  advertencias: string[];
  avisos_previos: IAvisoPrevio[];
}

export interface IProgresoImportacionSimat {
  total: number;
  procesadas: number;
  correctas: number;
  con_error: number;
}

export interface IImportacionSimat {
  institucion_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  usuario_id: Types.ObjectId;
  archivo_nombre: string;
  formato: FormatoSimat;
  hash: string;
  estado: EstadoLoteSimat;
  opciones: IOpcionesImportacionSimat;
  resumen: IResumenImportacionSimat;
  grupos_por_crear: IGrupoPorCrear[];
  progreso: IProgresoImportacionSimat;
  /** Sedes que el usuario podía importar al simular (null = todas): se vuelve a respetar al aplicar. */
  sedes_permitidas: Types.ObjectId[] | null;
  aplicado_por: Types.ObjectId | null;
  fecha_aplicacion: Date | null;
  reservado_hasta: Date | null;
  error: string;
  expira_en: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export type ImportacionSimatDocument = HydratedDocument<IImportacionSimat>;

const loteSchema = new Schema<IImportacionSimat, Model<IImportacionSimat>>(
  {
    institucion_id: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    usuario_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    archivo_nombre: { type: String, default: '', maxlength: 200 },
    formato: { type: String, enum: FORMATOS_SIMAT, required: true },
    hash: { type: String, required: true },
    estado: { type: String, enum: ESTADOS_LOTE_SIMAT, default: 'SIMULADO' },
    opciones: { type: Schema.Types.Mixed, required: true },
    resumen: { type: Schema.Types.Mixed, required: true },
    grupos_por_crear: { type: Schema.Types.Mixed, default: () => [] },
    progreso: { type: Schema.Types.Mixed, default: () => ({ total: 0, procesadas: 0, correctas: 0, con_error: 0 }) },
    sedes_permitidas: { type: Schema.Types.Mixed, default: null },
    aplicado_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    fecha_aplicacion: { type: Date, default: null },
    reservado_hasta: { type: Date, default: null },
    error: { type: String, default: '', maxlength: 500 },
    expira_en: { type: Date, default: null },
  },
  { timestamps: true, minimize: false }
);
loteSchema.index({ estado: 1, reservado_hasta: 1 });
loteSchema.index({ institucion_id: 1, createdAt: -1 });
// Una simulación sin aplicar se borra sola (guarda datos de menores); al aplicarla `expira_en` queda en null y deja de vencer.
loteSchema.index({ expira_en: 1 }, { expireAfterSeconds: 0 });

export const ImportacionSimat = model<IImportacionSimat>('ImportacionSimat', loteSchema);

export interface IResultadoFilaSimat {
  estado: 'CORRECTA' | 'ERROR' | 'OMITIDA';
  detalle: string;
  estudiante_creado: boolean;
  matricula: 'CREADA' | 'FORMALIZADA' | 'CONFIRMADA' | 'NINGUNA';
  campos_actualizados: string[];
  folio: string | null;
}

export interface IImportacionSimatFila {
  lote_id: Types.ObjectId;
  /** Fila del archivo (la 1 es el encabezado). */
  numero: number;
  documento: string;
  nombre: string;
  grado: string;
  grupo: string;
  sede: string;
  clasificacion: ClasificacionSimat;
  codigo_motivo: string;
  motivo: string;
  avisos: string[];
  /** Diferencias de identidad con lo que ya hay en Klassy (no se aplican solas). */
  diferencias_identidad: string[];
  /** Campos del perfil que cambiarán al aplicar. */
  campos_a_actualizar: string[];
  /** La fila normalizada: se borra al aplicar (contiene datos de salud y de menores). */
  datos: unknown;
  resultado: IResultadoFilaSimat | null;
  expira_en: Date | null;
}
export type ImportacionSimatFilaDocument = HydratedDocument<IImportacionSimatFila>;

const filaSchema = new Schema<IImportacionSimatFila, Model<IImportacionSimatFila>>(
  {
    lote_id: { type: Schema.Types.ObjectId, ref: 'ImportacionSimat', required: true },
    numero: { type: Number, required: true },
    documento: { type: String, default: '' },
    nombre: { type: String, default: '' },
    grado: { type: String, default: '' },
    grupo: { type: String, default: '' },
    sede: { type: String, default: '' },
    clasificacion: { type: String, enum: CLASIFICACIONES_SIMAT, required: true },
    codigo_motivo: { type: String, default: '' },
    motivo: { type: String, default: '' },
    avisos: { type: [String], default: [] },
    diferencias_identidad: { type: [String], default: [] },
    campos_a_actualizar: { type: [String], default: [] },
    datos: { type: Schema.Types.Mixed, default: null, select: false },
    resultado: { type: Schema.Types.Mixed, default: null },
    expira_en: { type: Date, default: null },
  },
  { timestamps: false, minimize: false }
);
filaSchema.index({ lote_id: 1, numero: 1 });
filaSchema.index({ lote_id: 1, clasificacion: 1 });
filaSchema.index({ expira_en: 1 }, { expireAfterSeconds: 0 });

export const ImportacionSimatFila = model<IImportacionSimatFila>('ImportacionSimatFila', filaSchema);
