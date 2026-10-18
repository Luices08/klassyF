import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { MOMENTOS_PROMOCION, MomentoPromocion, RESULTADOS_PROMOCION, ResultadoPromocion } from '../constants/promocion';

/**
 * El cierre de UN estudiante en UN año (M19): resultado académico, lo que lo explica y las entradas y la política con que se calculó, todo
 * congelado. Es inmutable: corregirlo (reclamación aprobada, recuperación final) crea una versión nueva y la anterior deja de ser vigente,
 * sin tocar el cierre de los demás estudiantes. Es la fuente que leen M26 (certificados), M17 (boletín final) y M04 (renovación de matrícula).
 */
export interface IEvaluacionPromocionEstudiante {
  academic_year_id: Types.ObjectId;
  student_id: Types.ObjectId;
  enrollment_id: Types.ObjectId;
  group_id: Types.ObjectId;
  grado_id: Types.ObjectId;
  version: number;
  vigente: boolean;
  momento: MomentoPromocion;
  resultado: ResultadoPromocion;
  detalle: unknown;
  entrada: unknown;
  politica: unknown;
  /** Obligatorio desde la versión 2: por qué se corrigió. */
  motivo: string;
  calculado_por: Types.ObjectId;
  huella: string;
  createdAt: Date;
}

export type EvaluacionPromocionDocument = HydratedDocument<IEvaluacionPromocionEstudiante>;
type EvaluacionPromocionModel = Model<IEvaluacionPromocionEstudiante>;

const evaluacionSchema = new Schema<IEvaluacionPromocionEstudiante, EvaluacionPromocionModel>(
  {
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    enrollment_id: { type: Schema.Types.ObjectId, ref: 'Enrollment', required: true },
    group_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    grado_id: { type: Schema.Types.ObjectId, ref: 'Grade', required: true },
    version: { type: Number, required: true, min: 1 },
    vigente: { type: Boolean, default: true },
    momento: { type: String, enum: MOMENTOS_PROMOCION, required: true },
    resultado: { type: String, enum: RESULTADOS_PROMOCION, required: true },
    detalle: { type: Schema.Types.Mixed, required: true },
    entrada: { type: Schema.Types.Mixed, required: true },
    politica: { type: Schema.Types.Mixed, required: true },
    motivo: { type: String, trim: true, default: '' },
    calculado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    huella: { type: String, required: true },
  },
  // `minimize: false`: un objeto vacío (p. ej. sin faltas de convivencia) debe guardarse tal cual o la huella no coincidiría al recalcularla.
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false }
);

// Una sola versión vigente por estudiante y año; las anteriores quedan como historia.
evaluacionSchema.index({ academic_year_id: 1, student_id: 1, version: 1 }, { unique: true });
evaluacionSchema.index({ academic_year_id: 1, student_id: 1 }, { unique: true, partialFilterExpression: { vigente: true }, name: 'evaluacion_vigente_unica' });
evaluacionSchema.index({ academic_year_id: 1, group_id: 1, vigente: 1 });
evaluacionSchema.index({ enrollment_id: 1, vigente: 1 });

// Lo cerrado no se edita: solo se puede dejar de ser vigente (al llegar una versión nueva).
evaluacionSchema.pre('save', function (next) {
  if (!this.isNew && this.modifiedPaths().some((p) => p !== 'vigente')) {
    return next(new Error('Un cierre de promoción no se edita: se corrige con una versión nueva.'));
  }
  next();
});

export const EvaluacionPromocionEstudiante = model<IEvaluacionPromocionEstudiante, EvaluacionPromocionModel>('EvaluacionPromocionEstudiante', evaluacionSchema);
export default EvaluacionPromocionEstudiante;
