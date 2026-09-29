import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  ESTADOS_DOCUMENTO_MATRICULA,
  ESTADOS_MATRICULA_CON_FOLIO,
  ESTADOS_MATRICULA,
  EstadoDocumentoMatricula,
  EstadoMatricula,
  TIPOS_DOCUMENTO_MATRICULA,
  TIPOS_INGRESO,
  TipoDocumentoMatricula,
  TipoIngreso,
} from '../constants/enums';

export interface IChecklistItem {
  tipo_documento: TipoDocumentoMatricula;
  estado: EstadoDocumentoMatricula;
  archivo_path: string | null;
  comentario: string | null;
  fecha_carga: Date | null;
  revisado_por: Types.ObjectId | null;
}

export interface IEnrollment {
  student_id: Types.ObjectId;
  group_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  /** null mientras esta PREINSCRITO: el folio se asigna al formalizar la matricula (ver enrollment.service). */
  folio_matricula: string | null;
  numero_libro: number | null;
  numero_folio: number | null;
  tipo_ingreso: TipoIngreso;
  estado: EstadoMatricula;
  fecha_matricula: Date;
  /** Plazo del acta de compromiso mientras la matricula esta MATRICULADO_CONDICIONAL. */
  fecha_limite_compromiso: Date | null;
  motivo_retiro: string | null;
  checklist: Types.DocumentArray<IChecklistItem>;
  createdAt: Date;
  updatedAt: Date;
}

export type EnrollmentDocument = HydratedDocument<IEnrollment>;
type EnrollmentModel = Model<IEnrollment>;

const checklistItemSchema = new Schema<IChecklistItem>(
  {
    tipo_documento: { type: String, enum: TIPOS_DOCUMENTO_MATRICULA, required: true },
    estado: { type: String, enum: ESTADOS_DOCUMENTO_MATRICULA, default: 'PENDIENTE' },
    archivo_path: { type: String, default: null },
    comentario: { type: String, default: null },
    fecha_carga: { type: Date, default: null },
    revisado_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false }
);

const enrollmentSchema = new Schema<IEnrollment, EnrollmentModel>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    group_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    folio_matricula: { type: String, default: null },
    numero_libro: { type: Number, default: null, min: 1 },
    numero_folio: { type: Number, default: null, min: 1 },
    tipo_ingreso: { type: String, enum: TIPOS_INGRESO, required: true },
    estado: { type: String, enum: ESTADOS_MATRICULA, default: 'PREINSCRITO' },
    fecha_matricula: { type: Date, default: Date.now },
    fecha_limite_compromiso: { type: Date, default: null },
    motivo_retiro: { type: String, default: null },
    checklist: { type: [checklistItemSchema], default: [] },
  },
  { timestamps: true }
);

enrollmentSchema.index({ student_id: 1, academic_year_id: 1 });
enrollmentSchema.index({ group_id: 1 });
// Unicos solo entre matriculas que ya tienen folio: los PREINSCRITOS (null) no chocan entre si.
enrollmentSchema.index({ folio_matricula: 1 }, { unique: true, partialFilterExpression: { folio_matricula: { $type: 'string' } } });
enrollmentSchema.index(
  { numero_libro: 1, numero_folio: 1 },
  { unique: true, partialFilterExpression: { numero_folio: { $type: 'number' } } }
);

// Invariante del Libro de Matricula: toda matricula formalizada tiene folio.
enrollmentSchema.pre('validate', function validarFolio(this: IEnrollment, next) {
  if (ESTADOS_MATRICULA_CON_FOLIO.includes(this.estado) && !this.folio_matricula) {
    return next(new Error('Una matrícula formalizada debe tener folio asignado.'));
  }
  next();
});

export const Enrollment = model<IEnrollment, EnrollmentModel>('Enrollment', enrollmentSchema);
export default Enrollment;
