import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_USUARIO, EstadoUsuario, TIPOS_REFERENTE, TipoReferente } from '../constants/enums';

export interface IDBABank {
  tipo_referente: TipoReferente;
  grade_id?: Types.ObjectId | null;
  area_id: Types.ObjectId;
  numero_dba?: number | null;
  enunciado: string;
  evidencias_aprendizaje: string[];
  eje_tematico: string;
  organizador: string;
  ejemplo?: string;
  grupo_grados?: string;
  competencia?: string;
  componente?: string;
  etiquetas: string[];
  version: string;
  fuente: string;
  estado: EstadoUsuario;
  createdAt: Date;
  updatedAt: Date;
}

export type DBABankDocument = HydratedDocument<IDBABank>;
type DBABankModel = Model<IDBABank>;

const dbaBankSchema = new Schema<IDBABank, DBABankModel>(
  {
    tipo_referente: { type: String, enum: TIPOS_REFERENTE, default: 'DBA' },
    grade_id: { type: Schema.Types.ObjectId, ref: 'Grade', default: null },
    area_id: { type: Schema.Types.ObjectId, ref: 'Area', required: true },
    numero_dba: { type: Number, min: 1, default: null },
    enunciado: { type: String, required: true, trim: true },
    evidencias_aprendizaje: { type: [String], default: [] },
    eje_tematico: { type: String, trim: true, default: '' },
    organizador: { type: String, trim: true, default: '' },
    ejemplo: { type: String, trim: true, default: '' },
    grupo_grados: { type: String, trim: true, default: '' },
    competencia: { type: String, trim: true, default: '' },
    componente: { type: String, trim: true, default: '' },
    etiquetas: { type: [String], default: [] },
    version: { type: String, default: 'V2', trim: true },
    fuente: { type: String, default: 'MEN - Colombia Aprende', trim: true },
    estado: { type: String, enum: ESTADOS_USUARIO, default: 'activo' },
  },
  { timestamps: true }
);

dbaBankSchema.pre('validate', function syncOrganizadores(next) {
  if (!this.organizador && this.eje_tematico) {
    this.organizador = this.eje_tematico;
  }
  if (!this.eje_tematico && this.organizador) {
    this.eje_tematico = this.organizador;
  }
  next();
});

// Índice único para DBA por grado, área y número
dbaBankSchema.index(
  { grade_id: 1, area_id: 1, numero_dba: 1 },
  { unique: true, partialFilterExpression: { tipo_referente: 'DBA', numero_dba: { $type: 'number' } } }
);

dbaBankSchema.index({ area_id: 1, grade_id: 1, organizador: 1 });
dbaBankSchema.index({ tipo_referente: 1, area_id: 1 });
dbaBankSchema.index({ etiquetas: 1 });

export const DBABank = model<IDBABank, DBABankModel>('DBABank', dbaBankSchema);
export default DBABank;
