import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  ESTADOS_USUARIO,
  EstadoUsuario,
  TIPOS_ASIGNACION_DOCENTE,
  TipoAsignacionDocente,
} from '../constants/enums';

export interface ITeacherAssignment {
  docente_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  tipo_asignacion: TipoAsignacionDocente;
  group_id?: Types.ObjectId | null;
  subject_id?: Types.ObjectId | null;
  horas_semanales: number;
  proyecto_nombre?: string;
  observaciones?: string;
  estado: EstadoUsuario;
  createdAt: Date;
  updatedAt: Date;
}

export type TeacherAssignmentDocument = HydratedDocument<ITeacherAssignment>;
type TeacherAssignmentModel = Model<ITeacherAssignment>;

const teacherAssignmentSchema = new Schema<ITeacherAssignment, TeacherAssignmentModel>(
  {
    docente_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    tipo_asignacion: {
      type: String,
      enum: TIPOS_ASIGNACION_DOCENTE,
      default: 'CLASE',
    },
    group_id: { type: Schema.Types.ObjectId, ref: 'Group', default: null },
    subject_id: { type: Schema.Types.ObjectId, ref: 'Subject', default: null },
    horas_semanales: { type: Number, required: true, min: 1 },
    proyecto_nombre: { type: String, trim: true, default: '' },
    observaciones: { type: String, trim: true, default: '' },
    estado: { type: String, enum: ESTADOS_USUARIO, default: 'activo' },
  },
  { timestamps: true }
);

// Evita asignar dos docentes titulares a la misma asignatura y grupo en el mismo año lectivo
teacherAssignmentSchema.index(
  { academic_year_id: 1, group_id: 1, subject_id: 1 },
  {
    unique: true,
    partialFilterExpression: {
      tipo_asignacion: 'CLASE',
      estado: 'activo',
      group_id: { $type: 'objectId' },
      subject_id: { $type: 'objectId' },
    },
  }
);

// Índice de consulta rápida por docente y año
teacherAssignmentSchema.index({ docente_id: 1, academic_year_id: 1, estado: 1 });
teacherAssignmentSchema.index({ group_id: 1, academic_year_id: 1 });

export const TeacherAssignment = model<ITeacherAssignment, TeacherAssignmentModel>(
  'TeacherAssignment',
  teacherAssignmentSchema
);
export default TeacherAssignment;
