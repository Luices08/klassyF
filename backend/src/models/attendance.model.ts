import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';

export interface IAttendanceRegistro {
  student_id: Types.ObjectId;
  state_id: Types.ObjectId;
  /** Novedad en texto libre del docente (ej. "Llegó tarde por problemas de transporte"). */
  novedad: string;
}

export interface IAttendance {
  group_id: Types.ObjectId;
  subject_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  fecha: Date;
  periodo_numero: number;
  registros: Types.DocumentArray<IAttendanceRegistro>;
  registrado_por: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type AttendanceDocument = HydratedDocument<IAttendance>;
type AttendanceModel = Model<IAttendance>;

// El `_id` de cada registro es estable: una justificación (M13) se ancla a él, así que editar la planilla
// actualiza el registro existente en lugar de reemplazar el arreglo.
const registroSchema = new Schema<IAttendanceRegistro>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    state_id: { type: Schema.Types.ObjectId, ref: 'AttendanceState', required: true },
    novedad: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { _id: true }
);

const attendanceSchema = new Schema<IAttendance, AttendanceModel>(
  {
    group_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    subject_id: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    fecha: { type: Date, required: true },
    periodo_numero: { type: Number, required: true, min: 1, max: 4 },
    registros: { type: [registroSchema], default: [] },
    registrado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Una sola planilla de asistencia por grupo+asignatura+dia.
attendanceSchema.index({ group_id: 1, subject_id: 1, fecha: 1 }, { unique: true });
attendanceSchema.index({ academic_year_id: 1, periodo_numero: 1, group_id: 1 });
attendanceSchema.index({ 'registros.student_id': 1, academic_year_id: 1 });

export const Attendance = model<IAttendance, AttendanceModel>('Attendance', attendanceSchema);
export default Attendance;
