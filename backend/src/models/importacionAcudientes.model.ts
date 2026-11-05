import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { CLASIFICACIONES_ACUDIENTES, ClasificacionAcudientes } from '../constants/importacionAcudientes';
import { ESTADOS_LOTE_SIMAT, EstadoLoteSimat, FORMATOS_SIMAT, FormatoSimat } from '../constants/importacionSimat';

export interface IOpcionesImportacionAcudientes {
  /** Abre la cuenta del portal al acudiente principal de un estudiante cuya matrícula ya está confirmada (clave temporal = su documento). */
  habilitar_portal: boolean;
}

/** Lo que quien importa debe leer antes de confirmar. */
export interface IAvisoPrevioAcudientes {
  clave: 'ESTUDIANTES_PREVIOS' | 'DATOS_PERSONALES' | 'IDENTIDAD' | 'PRINCIPAL' | 'PORTAL' | 'TELEFONO' | 'ERRORES';
  titulo: string;
  detalle: string;
  severidad: 'info' | 'warning';
  cantidad: number;
}

export interface IResumenImportacionAcudientes {
  filas_archivo: number;
  por_clasificacion: Record<string, number>;
  por_motivo: Record<string, number>;
  /** Estudiantes distintos del archivo. */
  estudiantes: number;
  /** Acudientes distintos que se crearán. */
  acudientes_por_crear: number;
  /** Acudientes distintos del archivo que ya tienen más de un hijo en él (o los tendrán al vincularse). */
  acudientes_con_varios_hijos: number;
  vinculos_por_crear: number;
  con_datos_por_completar: number;
  portal_por_abrir: number;
  advertencias: string[];
  avisos_previos: IAvisoPrevioAcudientes[];
}

export interface IProgresoImportacionAcudientes {
  total: number;
  procesadas: number;
  correctas: number;
  con_error: number;
}

export interface IImportacionAcudientes {
  usuario_id: Types.ObjectId;
  archivo_nombre: string;
  formato: FormatoSimat;
  hash: string;
  estado: EstadoLoteSimat;
  opciones: IOpcionesImportacionAcudientes;
  resumen: IResumenImportacionAcudientes;
  progreso: IProgresoImportacionAcudientes;
  aplicado_por: Types.ObjectId | null;
  fecha_aplicacion: Date | null;
  reservado_hasta: Date | null;
  error: string;
  expira_en: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export type ImportacionAcudientesDocument = HydratedDocument<IImportacionAcudientes>;

const loteSchema = new Schema<IImportacionAcudientes, Model<IImportacionAcudientes>>(
  {
    usuario_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    archivo_nombre: { type: String, default: '', maxlength: 200 },
    formato: { type: String, enum: FORMATOS_SIMAT, required: true },
    hash: { type: String, required: true },
    estado: { type: String, enum: ESTADOS_LOTE_SIMAT, default: 'SIMULADO' },
    opciones: { type: Schema.Types.Mixed, required: true },
    resumen: { type: Schema.Types.Mixed, required: true },
    progreso: { type: Schema.Types.Mixed, default: () => ({ total: 0, procesadas: 0, correctas: 0, con_error: 0 }) },
    aplicado_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    fecha_aplicacion: { type: Date, default: null },
    reservado_hasta: { type: Date, default: null },
    error: { type: String, default: '', maxlength: 500 },
    expira_en: { type: Date, default: null },
  },
  { timestamps: true, minimize: false }
);
loteSchema.index({ estado: 1, reservado_hasta: 1 });
loteSchema.index({ createdAt: -1 });
// Una simulación sin aplicar se borra sola (guarda datos de menores y de sus familias); al aplicarla `expira_en` queda en null.
loteSchema.index({ expira_en: 1 }, { expireAfterSeconds: 0 });

export const ImportacionAcudientes = model<IImportacionAcudientes>('ImportacionAcudientes', loteSchema);

export interface IResultadoFilaAcudientes {
  estado: 'CORRECTA' | 'ERROR';
  detalle: string;
  acudiente_creado: boolean;
  vinculo: 'CREADO' | 'EXISTENTE' | 'NINGUNO';
  campos_actualizados: string[];
}

export interface IImportacionAcudientesFila {
  lote_id: Types.ObjectId;
  /** Fila del archivo (la 1 es el encabezado). */
  numero: number;
  documento_estudiante: string;
  estudiante: string;
  documento_acudiente: string;
  acudiente: string;
  parentesco: string;
  clasificacion: ClasificacionAcudientes;
  codigo_motivo: string;
  motivo: string;
  avisos: string[];
  /** Diferencias con el acudiente ya registrado (no se aplican solas). */
  diferencias_identidad: string[];
  campos_a_actualizar: string[];
  /** La fila normalizada: se borra al aplicar (son datos personales de menores y de sus familias). */
  datos: unknown;
  resultado: IResultadoFilaAcudientes | null;
  expira_en: Date | null;
}
export type ImportacionAcudientesFilaDocument = HydratedDocument<IImportacionAcudientesFila>;

const filaSchema = new Schema<IImportacionAcudientesFila, Model<IImportacionAcudientesFila>>(
  {
    lote_id: { type: Schema.Types.ObjectId, ref: 'ImportacionAcudientes', required: true },
    numero: { type: Number, required: true },
    documento_estudiante: { type: String, default: '' },
    estudiante: { type: String, default: '' },
    documento_acudiente: { type: String, default: '' },
    acudiente: { type: String, default: '' },
    parentesco: { type: String, default: '' },
    clasificacion: { type: String, enum: CLASIFICACIONES_ACUDIENTES, required: true },
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

export const ImportacionAcudientesFila = model<IImportacionAcudientesFila>('ImportacionAcudientesFila', filaSchema);
