import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  CLAVES_FORMATO_EVIDENCIA,
  FormatoEvidencia,
  TIPOS_ACTIVIDAD,
  TipoActividad,
} from '../constants/actividades';

export interface IActivity {
  teacher_assignment_id: Types.ObjectId;
  periodo_numero: number;
  titulo: string;
  descripcion: string;
  tipo: TipoActividad;
  componente_siee: string;
  peso_en_componente: number;
  /** Desde cuándo la ven los estudiantes (fecha de publicación). */
  fecha_apertura: Date;
  /** Límite de entrega. */
  fecha_entrega: Date;
  /** false = actividad de aula sin entregable digital (el docente califica directo). */
  requiere_entrega: boolean;
  /** Vacío con `requiere_entrega` = respuesta escrita en línea, sin archivo. */
  formatos_permitidos: FormatoEvidencia[];
  permite_entrega_tardia: boolean;
  /** Planeación M07 APROBADA con la que se programó; los DBA y la competencia se validan contra ella. */
  desarrollo_curricular_id: Types.ObjectId | null;
  dba_id: Types.ObjectId | null;
  competencia_evaluada: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ActivityDocument = HydratedDocument<IActivity>;
type ActivityModel = Model<IActivity>;

const activitySchema = new Schema<IActivity, ActivityModel>(
  {
    teacher_assignment_id: { type: Schema.Types.ObjectId, ref: 'TeacherAssignment', required: true },
    periodo_numero: { type: Number, required: true, min: 1, max: 4 },
    titulo: { type: String, required: true, trim: true, maxlength: 150 },
    descripcion: { type: String, required: true, trim: true, maxlength: 5000 },
    // Las actividades anteriores a M11 no lo tienen guardado: se leen como TAREA.
    tipo: { type: String, enum: TIPOS_ACTIVIDAD, default: 'TAREA' },
    componente_siee: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z0-9_]{2,40}$/ },
    peso_en_componente: { type: Number, required: true, min: 0 },
    fecha_apertura: { type: Date, required: true },
    fecha_entrega: { type: Date, required: true },
    requiere_entrega: { type: Boolean, default: true },
    formatos_permitidos: { type: [{ type: String, enum: CLAVES_FORMATO_EVIDENCIA }], default: [] },
    permite_entrega_tardia: { type: Boolean, default: false },
    desarrollo_curricular_id: { type: Schema.Types.ObjectId, ref: 'CurricularDevelopment', default: null },
    dba_id: { type: Schema.Types.ObjectId, ref: 'ReferenteCurricular', default: null },
    competencia_evaluada: { type: String, trim: true, maxlength: 600, default: null },
  },
  { timestamps: true }
);

activitySchema.pre('validate', function validateFechas(this: IActivity, next) {
  if (this.fecha_apertura && this.fecha_entrega && this.fecha_entrega < this.fecha_apertura) {
    return next(new Error('fecha_entrega no puede ser anterior a fecha_apertura.'));
  }
  if (!this.requiere_entrega && this.formatos_permitidos?.length > 0) {
    return next(new Error('Una actividad sin entregable digital no define formatos de archivo.'));
  }
  next();
});

activitySchema.index({ teacher_assignment_id: 1, periodo_numero: 1 });
activitySchema.index({ teacher_assignment_id: 1, fecha_entrega: 1 });

export const Activity = model<IActivity, ActivityModel>('Activity', activitySchema);
export default Activity;
