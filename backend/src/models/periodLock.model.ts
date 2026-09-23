import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_PERIODO, EstadoPeriodo } from '../constants/enums';

export interface IPeriodLock {
  academic_year_id: Types.ObjectId;
  periodo_numero: number;
  group_id: Types.ObjectId;
  estado: EstadoPeriodo;
  createdAt: Date;
  updatedAt: Date;
}

export type PeriodLockDocument = HydratedDocument<IPeriodLock>;
type PeriodLockModel = Model<IPeriodLock>;

const periodLockSchema = new Schema<IPeriodLock, PeriodLockModel>(
  {
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    periodo_numero: { type: Number, required: true, min: 1, max: 4 },
    group_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    estado: { type: String, enum: ESTADOS_PERIODO, default: 'ABIERTO' },
  },
  { timestamps: true }
);

periodLockSchema.index({ academic_year_id: 1, periodo_numero: 1, group_id: 1 }, { unique: true });

export const PeriodLock = model<IPeriodLock, PeriodLockModel>('PeriodLock', periodLockSchema);
export default PeriodLock;
