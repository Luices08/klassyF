import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  CLAVES_FORMATO_EVIDENCIA,
  ESTADOS_ENTREGA,
  EstadoEntrega,
  FormatoEvidencia,
  ORIGENES_NOTA,
  OrigenNota,
} from '../constants/actividades';

/** Un archivo de una entrega: vive en disco, aquí solo su referencia. */
export interface IArchivoEntrega {
  path: string;
  nombre: string;
  formato: FormatoEvidencia;
  bytes: number;
}

/** Cada vez que el estudiante entrega queda un intento; los campos de la entrega de abajo reflejan el que cuenta. */
export interface IIntentoEntrega {
  numero: number;
  texto_entrega: string;
  /** Lo escrito en el editor de texto (ya limpiado por el servidor); vacío si la actividad no lo ofrece. */
  respuesta_html: string;
  /** Todos los archivos de la entrega; los campos `archivo_*` de abajo repiten el primero por compatibilidad. */
  archivos: IArchivoEntrega[];
  archivo_path: string | null;
  archivo_nombre: string | null;
  archivo_formato: FormatoEvidencia | null;
  archivo_bytes: number | null;
  fecha_entrega: Date;
  con_retraso: boolean;
  /** Se entregó dentro del plazo personal que el docente le dio a este estudiante. */
  acceso_especial: boolean;
}

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
  /** Cada cambio de la nota (M12): quién, cuándo y de qué valor a cuál. Nunca se borra. */
  historial_notas: Array<{ valor_anterior: number | null; valor_nuevo: number; por: Types.ObjectId; fecha: Date; origen?: OrigenNota }>;
  /** Todas las entregas del estudiante, de la primera a la última. Las de antes de las entregas múltiples no lo tienen: se leen como un solo intento. */
  intentos: IIntentoEntrega[];
  /** El intento que el docente eligió para calificar; null = el último. */
  intento_valido: number | null;
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
    historial_notas: {
      type: [
        new Schema(
          {
            valor_anterior: { type: Number, default: null },
            valor_nuevo: { type: Number, required: true },
            por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
            fecha: { type: Date, required: true },
            origen: { type: String, enum: ORIGENES_NOTA },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    intentos: {
      type: [
        new Schema(
          {
            numero: { type: Number, required: true, min: 1 },
            texto_entrega: { type: String, default: '', maxlength: 10000 },
            respuesta_html: { type: String, default: '' },
            archivos: {
              type: [
                new Schema(
                  {
                    path: { type: String, required: true },
                    nombre: { type: String, required: true },
                    formato: { type: String, enum: CLAVES_FORMATO_EVIDENCIA, required: true },
                    bytes: { type: Number, required: true },
                  },
                  { _id: false }
                ),
              ],
              default: [],
            },
            archivo_path: { type: String, default: null },
            archivo_nombre: { type: String, default: null },
            archivo_formato: { type: String, enum: [...CLAVES_FORMATO_EVIDENCIA, null], default: null },
            archivo_bytes: { type: Number, default: null },
            fecha_entrega: { type: Date, required: true },
            con_retraso: { type: Boolean, default: false },
            acceso_especial: { type: Boolean, default: false },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    intento_valido: { type: Number, default: null, min: 1 },
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
