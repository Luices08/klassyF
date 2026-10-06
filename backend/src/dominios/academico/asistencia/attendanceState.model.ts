import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  ESTADOS_USUARIO,
  EstadoUsuario,
  TONOS_ESTADO_ASISTENCIA,
  TonoEstadoAsistencia,
} from '../../../constants/enums';

/**
 * Estado de asistencia parametrizable por institución (M13). Las reglas que dependen de él
 * (qué cuenta como falla, qué es retardo, qué ya viene justificado) viven en estas banderas y
 * no en el nombre: renombrar "Ausencia" a "Inasistencia" no cambia ningún reporte ni el boletín.
 */
export interface IAttendanceState {
  institucion_id: Types.ObjectId;
  nombre: string;
  abreviatura: string;
  tono: TonoEstadoAsistencia;
  cuenta_como_falla: boolean;
  /** Llegada tarde: se reporta aparte de las fallas (no suma como inasistencia). */
  es_retardo: boolean;
  /** Falla que ya nace justificada (ej. "Excusa"): no necesita soporte para contar como justificada. */
  es_justificada: boolean;
  /** El que trae marcado cada fila de la planilla; solo uno activo a la vez. */
  es_predeterminado: boolean;
  orden: number;
  estado: EstadoUsuario;
  createdAt: Date;
  updatedAt: Date;
}

export type AttendanceStateDocument = HydratedDocument<IAttendanceState>;
type AttendanceStateModel = Model<IAttendanceState>;

const attendanceStateSchema = new Schema<IAttendanceState, AttendanceStateModel>(
  {
    institucion_id: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
    nombre: { type: String, required: true, trim: true, maxlength: 40 },
    abreviatura: { type: String, required: true, trim: true, uppercase: true, maxlength: 3 },
    tono: { type: String, enum: TONOS_ESTADO_ASISTENCIA, default: 'neutral' },
    cuenta_como_falla: { type: Boolean, default: false },
    es_retardo: { type: Boolean, default: false },
    es_justificada: { type: Boolean, default: false },
    es_predeterminado: { type: Boolean, default: false },
    orden: { type: Number, default: 0 },
    estado: { type: String, enum: ESTADOS_USUARIO, default: 'activo' },
  },
  { timestamps: true }
);

// Un estado es falla, retardo o ninguno de los dos: así cada registro suma en un solo contador del reporte.
attendanceStateSchema.pre('validate', function (next) {
  if (this.es_retardo && this.cuenta_como_falla) {
    this.invalidate('es_retardo', 'Un estado no puede ser a la vez retardo y falla.');
  }
  if (this.es_justificada && !this.cuenta_como_falla) {
    this.invalidate('es_justificada', 'Un estado justificado debe contar como falla.');
  }
  if (this.es_predeterminado && (this.cuenta_como_falla || this.es_retardo)) {
    this.invalidate('es_predeterminado', 'El estado predeterminado de la planilla no puede ser una falla ni un retardo.');
  }
  next();
});

const COLACION_SIN_MAYUSCULAS = { locale: 'es', strength: 2 } as const;
attendanceStateSchema.index({ institucion_id: 1, nombre: 1 }, { unique: true, collation: COLACION_SIN_MAYUSCULAS });
attendanceStateSchema.index({ institucion_id: 1, abreviatura: 1 }, { unique: true });

export const AttendanceState = model<IAttendanceState, AttendanceStateModel>('AttendanceState', attendanceStateSchema);
export default AttendanceState;
