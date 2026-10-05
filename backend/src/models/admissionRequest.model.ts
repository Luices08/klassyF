import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { Jornada, JORNADAS, TIPOS_DOCUMENTO, TipoDocumento } from '../constants/enums';

// M04 (Admisiones): solicitud publica de cupo, separada de Enrollment a
// proposito — nadie sin autenticar debe poder crear cuentas de usuario ni
// consumir cupos de un grupo directamente. Secretaria la revisa aqui y, al
// aprobarla, recien ahi se crea el User + Enrollment (PREINSCRITO).
export const ESTADOS_SOLICITUD = ['PENDIENTE', 'EN_REVISION', 'APROBADA', 'RECHAZADA'] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];

export interface IAdmissionRequest {
  nombre_aspirante: string;
  apellido_aspirante: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  fecha_nacimiento: Date;
  grado_deseado_id: Types.ObjectId;
  sede_deseada_id: Types.ObjectId | null;
  jornada_deseada: Jornada | null;
  acudiente_nombre: string;
  acudiente_apellido: string;
  acudiente_telefono: string;
  acudiente_email: string;
  observaciones: string;
  /** Lo que la familia declara sobre apoyos o diagnósticos previos; al aprobar pasa a la bandeja de inclusión (M16). */
  apoyo_declarado: { motivo_declarado: string; aporta_soporte: boolean; observacion: string } | null;
  estado: EstadoSolicitud;
  motivo_rechazo: string | null;
  revisado_por: Types.ObjectId | null;
  fecha_revision: Date | null;
  student_user_id: Types.ObjectId | null;
  enrollment_id: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AdmissionRequestDocument = HydratedDocument<IAdmissionRequest>;
type AdmissionRequestModel = Model<IAdmissionRequest>;

const admissionRequestSchema = new Schema<IAdmissionRequest, AdmissionRequestModel>(
  {
    nombre_aspirante: { type: String, required: true, trim: true },
    apellido_aspirante: { type: String, required: true, trim: true },
    tipo_documento: { type: String, enum: TIPOS_DOCUMENTO, required: true },
    numero_documento: { type: String, required: true, trim: true },
    fecha_nacimiento: { type: Date, required: true },
    grado_deseado_id: { type: Schema.Types.ObjectId, ref: 'Grade', required: true },
    sede_deseada_id: { type: Schema.Types.ObjectId, ref: 'Campus', default: null },
    jornada_deseada: { type: String, enum: JORNADAS, default: null },
    acudiente_nombre: { type: String, required: true, trim: true },
    acudiente_apellido: { type: String, required: true, trim: true },
    acudiente_telefono: { type: String, required: true, trim: true },
    acudiente_email: { type: String, required: true, trim: true, lowercase: true },
    observaciones: { type: String, default: '', trim: true },
    apoyo_declarado: {
      type: new Schema(
        {
          motivo_declarado: { type: String, required: true, trim: true, maxlength: 500 },
          aporta_soporte: { type: Boolean, default: false },
          observacion: { type: String, default: '', trim: true, maxlength: 2000 },
        },
        { _id: false }
      ),
      default: null,
    },
    estado: { type: String, enum: ESTADOS_SOLICITUD, default: 'PENDIENTE' },
    motivo_rechazo: { type: String, default: null },
    revisado_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    fecha_revision: { type: Date, default: null },
    student_user_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    enrollment_id: { type: Schema.Types.ObjectId, ref: 'Enrollment', default: null },
  },
  { timestamps: true }
);

admissionRequestSchema.index({ numero_documento: 1, estado: 1 });

export const AdmissionRequest = model<IAdmissionRequest, AdmissionRequestModel>(
  'AdmissionRequest',
  admissionRequestSchema
);
export default AdmissionRequest;
