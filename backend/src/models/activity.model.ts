import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { COMPONENTES_SIEE, ComponenteSiee } from '../constants/enums';

export interface IActivity {
  teacher_assignment_id: Types.ObjectId;
  periodo_numero: number;
  titulo: string;
  descripcion: string;
  componente_siee: ComponenteSiee;
  peso_en_componente: number;
  fecha_apertura: Date;
  fecha_entrega: Date;
  dba_id: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ActivityDocument = HydratedDocument<IActivity>;
type ActivityModel = Model<IActivity>;

const activitySchema = new Schema<IActivity, ActivityModel>(
  {
    teacher_assignment_id: { type: Schema.Types.ObjectId, ref: 'TeacherAssignment', required: true },
    periodo_numero: { type: Number, required: true, min: 1, max: 4 },
    titulo: { type: String, required: true, trim: true },
    descripcion: { type: String, required: true, trim: true },
    componente_siee: { type: String, enum: COMPONENTES_SIEE, required: true },
    peso_en_componente: { type: Number, required: true, min: 0 },
    fecha_apertura: { type: Date, required: true },
    fecha_entrega: { type: Date, required: true },
    dba_id: { type: Schema.Types.ObjectId, ref: 'DBABank', default: null },
  },
  { timestamps: true }
);

activitySchema.pre('validate', function validateFechas(this: IActivity, next) {
  if (this.fecha_apertura && this.fecha_entrega && this.fecha_entrega < this.fecha_apertura) {
    return next(new Error('fecha_entrega no puede ser anterior a fecha_apertura.'));
  }
  next();
});

activitySchema.index({ teacher_assignment_id: 1, periodo_numero: 1 });

export const Activity = model<IActivity, ActivityModel>('Activity', activitySchema);
export default Activity;
