import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_JUSTIFICACION, EstadoJustificacion } from '../../../constants/enums';

/**
 * Excusa de una inasistencia puntual (M13): se ancla al registro (`registro_id`) de la planilla.
 * El soporte vive en disco (uploads/asistencia), nunca en Mongo: puede ser una incapacidad médica.
 */
export interface IAttendanceJustification {
  attendance_id: Types.ObjectId;
  registro_id: Types.ObjectId;
  /** Redundante con el registro, para listar/filtrar por estudiante sin abrir la planilla. */
  student_id: Types.ObjectId;
  acudiente_id: Types.ObjectId | null;
  motivo: string;
  archivo_path: string | null;
  archivo_nombre: string | null;
  estado: EstadoJustificacion;
  registrado_por: Types.ObjectId;
  revisado_por: Types.ObjectId | null;
  fecha_revision: Date | null;
  comentario_revision: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AttendanceJustificationDocument = HydratedDocument<IAttendanceJustification>;
type AttendanceJustificationModel = Model<IAttendanceJustification>;

const attendanceJustificationSchema = new Schema<IAttendanceJustification, AttendanceJustificationModel>(
  {
    attendance_id: { type: Schema.Types.ObjectId, ref: 'Attendance', required: true },
    registro_id: { type: Schema.Types.ObjectId, required: true },
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    acudiente_id: { type: Schema.Types.ObjectId, ref: 'Guardian', default: null },
    motivo: { type: String, required: true, trim: true, maxlength: 1000 },
    archivo_path: { type: String, default: null },
    archivo_nombre: { type: String, default: null },
    estado: { type: String, enum: ESTADOS_JUSTIFICACION, default: 'PENDIENTE' },
    registrado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    revisado_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    fecha_revision: { type: Date, default: null },
    comentario_revision: { type: String, trim: true, default: null },
  },
  { timestamps: true }
);

// Una inasistencia tiene a lo sumo una excusa viva (pendiente o aprobada); si la rechazan, se puede volver a enviar.
attendanceJustificationSchema.index(
  { registro_id: 1 },
  { unique: true, partialFilterExpression: { estado: { $in: ['PENDIENTE', 'APROBADA'] } } }
);
attendanceJustificationSchema.index({ student_id: 1, estado: 1 });
attendanceJustificationSchema.index({ estado: 1, createdAt: -1 });

export const AttendanceJustification = model<IAttendanceJustification, AttendanceJustificationModel>(
  'AttendanceJustification',
  attendanceJustificationSchema
);
export default AttendanceJustification;
