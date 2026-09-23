import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';

export interface IDBABank {
  grade_id: Types.ObjectId;
  area_id: Types.ObjectId;
  numero_dba: number;
  enunciado: string;
  evidencias_aprendizaje: string[];
  eje_tematico: string;
  createdAt: Date;
  updatedAt: Date;
}

export type DBABankDocument = HydratedDocument<IDBABank>;
type DBABankModel = Model<IDBABank>;

const dbaBankSchema = new Schema<IDBABank, DBABankModel>(
  {
    grade_id: { type: Schema.Types.ObjectId, ref: 'Grade', required: true },
    area_id: { type: Schema.Types.ObjectId, ref: 'Area', required: true },
    numero_dba: { type: Number, required: true, min: 1 },
    enunciado: { type: String, required: true, trim: true },
    evidencias_aprendizaje: { type: [String], default: [] },
    eje_tematico: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

dbaBankSchema.index({ grade_id: 1, area_id: 1, numero_dba: 1 }, { unique: true });

export const DBABank = model<IDBABank, DBABankModel>('DBABank', dbaBankSchema);
export default DBABank;
