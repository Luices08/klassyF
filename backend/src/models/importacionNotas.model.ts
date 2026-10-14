import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { RESULTADOS_IMPORTACION_NOTAS, ResultadoImportacionNotasRegistro } from '../constants/notas';

export interface IErrorImportacionNotas {
  fila: number;
  documento: string | null;
  motivo: string;
  /** La celda la cambió el sistema después de que el docente descargó el archivo (no es un error de digitación). */
  conflicto: boolean;
}

/**
 * M22 — registro de cada Excel que un docente subió: quién, cuándo, qué archivo (solo su huella; el archivo no se conserva),
 * qué produjo y, si no se aplicó, por qué (errores de fila y conflictos). No guarda las notas: esas ya tienen su historial.
 */
export interface IImportacionNotas {
  usuario_id: Types.ObjectId;
  /** null cuando el archivo ni siquiera se reconoció como una planilla de Klassy. */
  teacher_assignment_id: Types.ObjectId | null;
  periodo_numero: number | null;
  archivo_nombre: string;
  hash: string;
  descargado_en: Date | null;
  resultado: ResultadoImportacionNotasRegistro;
  /** Motivo cuando el archivo se rechazó entero (no es un Excel de Klassy, planilla cerrada...) o la escritura se interrumpió. */
  mensaje: string | null;
  notas_guardadas: number;
  sin_cambios: number;
  casillas_creadas: number;
  casillas_renombradas: number;
  pesos_actualizados: number;
  total_errores: number;
  total_conflictos: number;
  /** Solo los primeros: el total real está en `total_errores`. */
  errores: IErrorImportacionNotas[];
  createdAt: Date;
}
export type ImportacionNotasDocument = HydratedDocument<IImportacionNotas>;

const errorSchema = new Schema<IErrorImportacionNotas>(
  {
    fila: { type: Number, required: true },
    documento: { type: String, default: null },
    motivo: { type: String, required: true, maxlength: 500 },
    conflicto: { type: Boolean, default: false },
  },
  { _id: false }
);

const importacionNotasSchema = new Schema<IImportacionNotas, Model<IImportacionNotas>>(
  {
    usuario_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    teacher_assignment_id: { type: Schema.Types.ObjectId, ref: 'TeacherAssignment', default: null },
    periodo_numero: { type: Number, default: null },
    archivo_nombre: { type: String, default: '', maxlength: 200 },
    hash: { type: String, required: true },
    descargado_en: { type: Date, default: null },
    resultado: { type: String, enum: RESULTADOS_IMPORTACION_NOTAS, required: true },
    mensaje: { type: String, default: null, maxlength: 500 },
    notas_guardadas: { type: Number, default: 0 },
    sin_cambios: { type: Number, default: 0 },
    casillas_creadas: { type: Number, default: 0 },
    casillas_renombradas: { type: Number, default: 0 },
    pesos_actualizados: { type: Number, default: 0 },
    total_errores: { type: Number, default: 0 },
    total_conflictos: { type: Number, default: 0 },
    errores: { type: [errorSchema], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
importacionNotasSchema.index({ teacher_assignment_id: 1, periodo_numero: 1, createdAt: -1 });
importacionNotasSchema.index({ usuario_id: 1, createdAt: -1 });

export const ImportacionNotas = model<IImportacionNotas>('ImportacionNotas', importacionNotasSchema);
export default ImportacionNotas;
