import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';

/** Una excepción a lo que decidió el grupo: este estudiante (y sus acudientes) ve o no ve su boletín aunque el grupo diga lo contrario. */
export interface IExcepcionBoletin {
  student_id: Types.ObjectId;
  permitir: boolean;
  por: Types.ObjectId;
  fecha: Date;
}

/**
 * Quién de la familia puede ver el boletín de un periodo (M17): el administrador publica el boletín de un grupo y, si hace falta,
 * deja excepciones por estudiante. Sin este documento, o sin publicar, la familia no lo ve; el personal del colegio lo ve siempre.
 */
export interface IPublicacionBoletin {
  academic_year_id: Types.ObjectId;
  group_id: Types.ObjectId;
  periodo_numero: number;
  publicado: boolean;
  publicado_por: Types.ObjectId | null;
  publicado_at: Date | null;
  excepciones: Types.DocumentArray<IExcepcionBoletin>;
  createdAt: Date;
  updatedAt: Date;
}

export type PublicacionBoletinDocument = HydratedDocument<IPublicacionBoletin>;
type PublicacionBoletinModel = Model<IPublicacionBoletin>;

const excepcionSchema = new Schema<IExcepcionBoletin>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    permitir: { type: Boolean, required: true },
    por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fecha: { type: Date, required: true },
  },
  { _id: false }
);

const publicacionBoletinSchema = new Schema<IPublicacionBoletin, PublicacionBoletinModel>(
  {
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    group_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    periodo_numero: { type: Number, required: true, min: 1 },
    publicado: { type: Boolean, default: false },
    publicado_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    publicado_at: { type: Date, default: null },
    excepciones: { type: [excepcionSchema], default: [] },
  },
  { timestamps: true }
);

publicacionBoletinSchema.index({ group_id: 1, academic_year_id: 1, periodo_numero: 1 }, { unique: true });

export const PublicacionBoletin = model<IPublicacionBoletin, PublicacionBoletinModel>('PublicacionBoletin', publicacionBoletinSchema);
export default PublicacionBoletin;
