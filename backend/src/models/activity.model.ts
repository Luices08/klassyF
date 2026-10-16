import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  CLAVES_FORMATO_EVIDENCIA,
  FormatoEvidencia,
  PROVEEDORES_VIDEO,
  ProveedorVideo,
  TIPOS_ACTIVIDAD,
  TIPOS_ADJUNTO,
  TipoActividad,
  TipoAdjunto,
} from '../constants/actividades';

/** Un archivo que el docente adjunta: vive en disco con el nombre de su huella, aquí solo su referencia. */
export interface IAdjuntoActividad {
  /** Huella SHA-256 del contenido; también es el nombre del archivo en el almacén. */
  id: string;
  nombre: string;
  tipo: TipoAdjunto;
  ext: string;
  bytes: number;
}

export interface IVideoActividad {
  proveedor: ProveedorVideo;
  video_id: string;
}

/** Plazo personal para un estudiante con una excusa válida: entrega pasada la fecha de la actividad sin que cuente como tardía. */
export interface IAccesoEspecial {
  student_id: Types.ObjectId;
  fecha_limite: Date;
  motivo: string;
  otorgado_por: Types.ObjectId;
  fecha: Date;
}

/** Qué se cambió de una actividad ya publicada (solo los nombres de los campos, nunca el contenido), para que no pase en silencio. */
export interface IModificacionActividad {
  fecha: Date;
  por: Types.ObjectId;
  campos: string[];
}

export interface IActivity {
  teacher_assignment_id: Types.ObjectId;
  periodo_numero: number;
  titulo: string;
  descripcion: string;
  tipo: TipoActividad;
  componente_siee: string;
  /** Porcentaje que pesa dentro de su bloque; null = automático (se reparte con las demás casillas sin peso). */
  peso_en_componente: number | null;
  /** Desde cuándo la ven los estudiantes (fecha de publicación). */
  fecha_apertura: Date;
  /** Límite de entrega. */
  fecha_entrega: Date;
  /** false = actividad de aula sin entregable digital (el docente califica directo). */
  requiere_entrega: boolean;
  /** Vacío con `requiere_entrega` = respuesta escrita en línea, sin archivo. */
  formatos_permitidos: FormatoEvidencia[];
  permite_entrega_tardia: boolean;
  /** Texto del editor, ya limpiado por el servidor. `descripcion` guarda su versión sin formato para listados y avisos. */
  contenido_html: string;
  adjuntos: IAdjuntoActividad[];
  videos: IVideoActividad[];
  /** false = una sola entrega por estudiante; true = puede volver a entregar y el docente elige cuál califica. */
  permite_multiples_entregas: boolean;
  /** El docente la cerró a mano: ya no se reciben entregas (salvo accesos especiales). */
  cerrada: boolean;
  cerrada_en: Date | null;
  /** Une las copias de una misma actividad publicada en varios grupos a la vez. */
  publicacion_id: Types.ObjectId | null;
  accesos_especiales: IAccesoEspecial[];
  modificaciones: IModificacionActividad[];
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
    peso_en_componente: { type: Number, default: null, min: 0, max: 100 },
    fecha_apertura: { type: Date, required: true },
    fecha_entrega: { type: Date, required: true },
    requiere_entrega: { type: Boolean, default: true },
    formatos_permitidos: { type: [{ type: String, enum: CLAVES_FORMATO_EVIDENCIA }], default: [] },
    permite_entrega_tardia: { type: Boolean, default: false },
    contenido_html: { type: String, default: '' },
    adjuntos: {
      type: [
        new Schema(
          {
            id: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
            nombre: { type: String, required: true, maxlength: 120 },
            tipo: { type: String, enum: TIPOS_ADJUNTO, required: true },
            ext: { type: String, required: true },
            bytes: { type: Number, required: true, min: 0 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    videos: {
      type: [
        new Schema(
          {
            proveedor: { type: String, enum: PROVEEDORES_VIDEO, required: true },
            video_id: { type: String, required: true, maxlength: 20 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    permite_multiples_entregas: { type: Boolean, default: false },
    cerrada: { type: Boolean, default: false },
    cerrada_en: { type: Date, default: null },
    publicacion_id: { type: Schema.Types.ObjectId, default: null },
    accesos_especiales: {
      type: [
        new Schema(
          {
            student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
            fecha_limite: { type: Date, required: true },
            motivo: { type: String, required: true, trim: true, maxlength: 300 },
            otorgado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
            fecha: { type: Date, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    modificaciones: {
      type: [
        new Schema(
          {
            fecha: { type: Date, required: true },
            por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
            campos: { type: [String], default: [] },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
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
activitySchema.index({ 'adjuntos.id': 1 });

export const Activity = model<IActivity, ActivityModel>('Activity', activitySchema);
export default Activity;
