import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';

export interface IActivitySubmission {
  activity_id: Types.ObjectId;
  student_id: Types.ObjectId;
  texto_entrega: string;
  archivo_url: string | null;
  fecha_entrega: Date;
  calificacion_numerica: number | null;
  retroalimentacion: string;
  fecha_calificacion: Date | null;
  docente_id: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ActivitySubmissionDocument = HydratedDocument<IActivitySubmission>;
type ActivitySubmissionModel = Model<IActivitySubmission>;

const activitySubmissionSchema = new Schema<IActivitySubmission, ActivitySubmissionModel>(
  {
    activity_id: { type: Schema.Types.ObjectId, ref: 'Activity', required: true },
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    texto_entrega: { type: String, default: '' },
    archivo_url: { type: String, default: null },
    fecha_entrega: { type: Date, default: Date.now },
    // Sin tope fijo aqui: los limites reales (nota_minima/nota_maxima) salen de
    // AcademicYear.escala_evaluacion y se validan en el servicio (validacion
    // cruzada entre documentos, no forma propia del modelo — ver activity.service#gradeActivity).
    calificacion_numerica: { type: Number, min: 0, default: null },
    retroalimentacion: { type: String, default: '' },
    fecha_calificacion: { type: Date, default: null },
    docente_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Un estudiante solo puede tener una entrega/calificacion por actividad.
activitySubmissionSchema.index({ activity_id: 1, student_id: 1 }, { unique: true });

export const ActivitySubmission = model<IActivitySubmission, ActivitySubmissionModel>(
  'ActivitySubmission',
  activitySubmissionSchema
);
export default ActivitySubmission;
