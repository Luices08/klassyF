import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { CLAVES_FORMATO_EVIDENCIA, ESTADOS_ENTREGA, EstadoEntrega, FormatoEvidencia } from '../constants/actividades';

export interface IActivitySubmission {
  activity_id: Types.ObjectId;
  student_id: Types.ObjectId;
  /** Respuesta escrita (o comentario que acompaña el archivo). */
  texto_entrega: string;
  /** Ruta relativa a la raíz del proceso, fuera de Mongo: se baja solo con sesión y permiso. */
  archivo_path: string | null;
  archivo_nombre: string | null;
  archivo_formato: FormatoEvidencia | null;
  archivo_bytes: number | null;
  /** null = el estudiante nunca entregó (p. ej. el docente calificó directo una actividad de aula). */
  fecha_entrega: Date | null;
  estado: EstadoEntrega;
  /** Se conserva al calificar: CALIFICADA no borra que la entrega llegó tarde. */
  con_retraso: boolean;
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
    texto_entrega: { type: String, default: '', maxlength: 10000 },
    archivo_path: { type: String, default: null },
    archivo_nombre: { type: String, default: null },
    archivo_formato: { type: String, enum: [...CLAVES_FORMATO_EVIDENCIA, null], default: null },
    archivo_bytes: { type: Number, default: null },
    fecha_entrega: { type: Date, default: null },
    estado: { type: String, enum: ESTADOS_ENTREGA, default: 'ENTREGADA' },
    con_retraso: { type: Boolean, default: false },
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
