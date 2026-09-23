import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_ASISTENCIA, EstadoAsistencia } from '../constants/enums';

export interface IAttendanceRegistro {
  student_id: Types.ObjectId;
  estado: EstadoAsistencia;
  observacion: string;
}

export interface IAttendance {
  group_id: Types.ObjectId;
  subject_id: Types.ObjectId;
  fecha: Date;
  periodo_numero: number;
  registros: Types.DocumentArray<IAttendanceRegistro>;
  createdAt: Date;
  updatedAt: Date;
}

export type AttendanceDocument = HydratedDocument<IAttendance>;
type AttendanceModel = Model<IAttendance>;

const registroSchema = new Schema<IAttendanceRegistro>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    estado: { type: String, enum: ESTADOS_ASISTENCIA, required: true },
    observacion: { type: String, default: '' },
  },
  { _id: true }
);

const attendanceSchema = new Schema<IAttendance, AttendanceModel>(
  {
    group_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    subject_id: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    fecha: { type: Date, required: true },
    periodo_numero: { type: Number, required: true, min: 1, max: 4 },
    registros: { type: [registroSchema], default: [] },
  },
  { timestamps: true }
);

// Una sola planilla de asistencia por grupo+asignatura+dia.
attendanceSchema.index({ group_id: 1, subject_id: 1, fecha: 1 }, { unique: true });

export const Attendance = model<IAttendance, AttendanceModel>('Attendance', attendanceSchema);
export default Attendance;
