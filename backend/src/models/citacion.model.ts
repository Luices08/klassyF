import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ROLES as ROLES_LIST, Rol } from '../constants/enums';
import {
  ESTADOS_CITACION,
  EstadoCitacion,
  MAX_DESCRIPCION_CITACION,
  MAX_LUGAR_CITACION,
  MAX_MOTIVO_CANCELACION,
  MAX_TITULO_CITACION,
  MOTIVOS_CITACION,
  MotivoCitacion,
  TIPOS_CITACION,
  TipoCitacion,
} from '../constants/citaciones';

export interface ICitacion {
  tipo: TipoCitacion;
  motivo: MotivoCitacion;
  titulo: string;
  descripcion: string;
  fecha_hora: Date;
  lugar: string;
  convocante_id: Types.ObjectId;
  /** Perfil con el que convocó (docente, coordinación…): es el cargo que sale en el correo. */
  convocante_rol: Rol;
  academic_year_id: Types.ObjectId;
  sede_id: Types.ObjectId;
  /** Citación general: los grupos convocados. */
  grupo_ids: Types.ObjectId[];
  /** Citación particular: el estudiante. */
  student_id: Types.ObjectId | null;
  /** Particular: si se convoca a todos los acudientes del estudiante y no solo al principal. */
  todos_los_acudientes: boolean;
  /** Si la citación nace de un caso de convivencia (M15): solo es un enlace, el caso no guarda ni lee nada de la citación. */
  caso_id: Types.ObjectId | null;
  estado: EstadoCitacion;
  /** Sube cuando cambia la fecha o el lugar: las confirmaciones anteriores dejan de valer. */
  version: number;
  cancelacion: { motivo: string; por: Types.ObjectId; fecha: Date } | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CitacionDocument = HydratedDocument<ICitacion>;

const citacionSchema = new Schema<ICitacion, Model<ICitacion>>(
  {
    tipo: { type: String, enum: TIPOS_CITACION, required: true },
    motivo: { type: String, enum: MOTIVOS_CITACION, required: true },
    titulo: { type: String, required: true, trim: true, maxlength: MAX_TITULO_CITACION },
    descripcion: { type: String, default: '', trim: true, maxlength: MAX_DESCRIPCION_CITACION },
    fecha_hora: { type: Date, required: true },
    lugar: { type: String, required: true, trim: true, maxlength: MAX_LUGAR_CITACION },
    convocante_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    convocante_rol: { type: String, enum: ROLES_LIST, required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    sede_id: { type: Schema.Types.ObjectId, ref: 'Campus', required: true },
    grupo_ids: { type: [{ type: Schema.Types.ObjectId, ref: 'Group' }], default: [] },
    student_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    todos_los_acudientes: { type: Boolean, default: false },
    caso_id: { type: Schema.Types.ObjectId, ref: 'CasoConvivencia', default: null },
    estado: { type: String, enum: ESTADOS_CITACION, default: 'PROGRAMADA' },
    version: { type: Number, default: 1 },
    cancelacion: {
      type: new Schema(
        {
          motivo: { type: String, required: true, maxlength: MAX_MOTIVO_CANCELACION },
          por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          fecha: { type: Date, required: true },
        },
        { _id: false }
      ),
      default: null,
    },
  },
  { timestamps: true }
);

// Una citación general lleva grupos y una particular un estudiante: nunca las dos cosas ni ninguna.
citacionSchema.pre('validate', function validarObjetivo(next) {
  if (this.tipo === 'GENERAL' && (this.grupo_ids.length === 0 || this.student_id)) {
    return next(new Error('Una citación general se dirige a uno o más grupos, no a un estudiante.'));
  }
  if (this.tipo === 'PARTICULAR' && (!this.student_id || this.grupo_ids.length > 0)) {
    return next(new Error('Una citación particular se dirige a un estudiante, no a grupos.'));
  }
  next();
});

citacionSchema.index({ academic_year_id: 1, fecha_hora: -1 });
citacionSchema.index({ convocante_id: 1, fecha_hora: -1 });
citacionSchema.index({ caso_id: 1 }, { sparse: true });

export const Citacion = model<ICitacion, Model<ICitacion>>('Citacion', citacionSchema);
export default Citacion;
