import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';

export interface IPeriodoProrroga {
  academic_year_id: Types.ObjectId;
  periodo_numero: number;
  // Al menos uno de los dos: un docente concreto, un grupo concreto, o ambos
  // (entonces aplica solo a ese docente en ese grupo).
  docente_id: Types.ObjectId | null;
  group_id: Types.ObjectId | null;
  hasta: Date;
  justificacion: string;
  otorgada_por_id: Types.ObjectId;
  revocada: boolean;
  revocada_por_id: Types.ObjectId | null;
  revocada_at: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type PeriodoProrrogaDocument = HydratedDocument<IPeriodoProrroga>;
type PeriodoProrrogaModel = Model<IPeriodoProrroga>;

const periodoProrrogaSchema = new Schema<IPeriodoProrroga, PeriodoProrrogaModel>(
  {
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    periodo_numero: { type: Number, required: true, min: 1, max: 4 },
    docente_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    group_id: { type: Schema.Types.ObjectId, ref: 'Group', default: null },
    hasta: { type: Date, required: true },
    justificacion: { type: String, required: true, trim: true, minlength: 10 },
    otorgada_por_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    revocada: { type: Boolean, default: false },
    revocada_por_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    revocada_at: { type: Date, default: null },
  },
  { timestamps: true }
);

periodoProrrogaSchema.index({ academic_year_id: 1, periodo_numero: 1, hasta: -1 });

periodoProrrogaSchema.pre('validate', function validarAlcance(this: IPeriodoProrroga, next) {
  if (!this.docente_id && !this.group_id) {
    const err = new Error('La prórroga debe dirigirse a un docente, a un grupo o a ambos.') as Error & {
      statusCode?: number;
    };
    err.statusCode = 400;
    return next(err);
  }
  next();
});

export const PeriodoProrroga = model<IPeriodoProrroga, PeriodoProrrogaModel>('PeriodoProrroga', periodoProrrogaSchema);
export default PeriodoProrroga;
