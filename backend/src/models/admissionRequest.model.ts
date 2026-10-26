import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { Jornada, JORNADAS, PARENTESCOS, Parentesco, TIPOS_DOCUMENTO, TipoDocumento } from '../constants/enums';

// M04 (Admisiones): solicitud publica de cupo, separada de Enrollment a
// proposito — nadie sin autenticar debe poder crear cuentas de usuario ni
// consumir cupos de un grupo directamente. Secretaria la revisa aqui y, al
// aprobarla, recien ahi se crea el User + Enrollment (PREINSCRITO).
// CUPO_RESERVADO y EN_ESPERA son de la prematrícula: el cupo se reserva por grado, sede y jornada, sin grupo, cuenta ni matrícula (ver prematricula.service).
export const ESTADOS_SOLICITUD = ['PENDIENTE', 'EN_REVISION', 'CUPO_RESERVADO', 'EN_ESPERA', 'APROBADA', 'RECHAZADA'] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];

/** Quién radicó la solicitud: la familia desde el sitio público o secretaría en el mostrador. */
export const ORIGENES_SOLICITUD = ['PUBLICA', 'SECRETARIA'] as const;
export type OrigenSolicitud = (typeof ORIGENES_SOLICITUD)[number];

/** El cupo que se le reservó a una solicitud: grado (el que pidió), sede y jornada. Sin grupo: el grupo se elige al matricular. */
export interface IReservaDeCupo {
  sede_id: Types.ObjectId;
  jornada_id: Types.ObjectId;
  reservado_por: Types.ObjectId;
  fecha: Date;
}

/** Un documento recibido con la solicitud (antes de que haya matrícula). El archivo vive en el disco; la API nunca devuelve su ruta. */
export interface IDocumentoSolicitud {
  tipo_documento: string;
  archivo_path: string;
  cargado_por: Types.ObjectId;
  fecha_carga: Date;
}

export interface IAdmissionRequest {
  /** El nombre completo del aspirante (primer + segundo nombre) y sus apellidos: se arman de las cuatro partes de abajo cuando llegan. */
  nombre_aspirante: string;
  apellido_aspirante: string;
  primer_nombre?: string;
  segundo_nombre?: string;
  primer_apellido?: string;
  segundo_apellido?: string;
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
  /** Opcionales: la solicitud pública no los pide; secretaría sí los registra (con ellos se crea la ficha del acudiente y, más adelante, su acceso). */
  acudiente_tipo_documento: TipoDocumento | null;
  acudiente_numero_documento: string | null;
  acudiente_parentesco: Parentesco | null;
  observaciones: string;
  /** Lo que la familia declara sobre apoyos o diagnósticos previos; al aprobar pasa a la bandeja de inclusión (M16). */
  apoyo_declarado: { motivo_declarado: string; aporta_soporte: boolean; observacion: string } | null;
  estado: EstadoSolicitud;
  motivo_rechazo: string | null;
  revisado_por: Types.ObjectId | null;
  fecha_revision: Date | null;
  student_user_id: Types.ObjectId | null;
  enrollment_id: Types.ObjectId | null;
  origen: OrigenSolicitud;
  registrada_por: Types.ObjectId | null;
  /** El año al que apunta: el siguiente mientras su ventana de prematrícula está abierta, o el año en curso. null en las solicitudes anteriores a la prematrícula. */
  academic_year_id: Types.ObjectId | null;
  reserva: IReservaDeCupo | null;
  documentos: IDocumentoSolicitud[];
  createdAt: Date;
  updatedAt: Date;
}

export type AdmissionRequestDocument = HydratedDocument<IAdmissionRequest>;
type AdmissionRequestModel = Model<IAdmissionRequest>;

const documentoSolicitudSchema = new Schema<IDocumentoSolicitud>(
  {
    tipo_documento: { type: String, required: true, trim: true },
    archivo_path: { type: String, required: true },
    cargado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fecha_carga: { type: Date, required: true },
  },
  {
    _id: false,
    toJSON: {
      transform: (_doc, ret) => {
        delete (ret as { archivo_path?: string }).archivo_path;
        return ret;
      },
    },
  }
);

const reservaSchema = new Schema<IReservaDeCupo>(
  {
    sede_id: { type: Schema.Types.ObjectId, ref: 'Campus', required: true },
    jornada_id: { type: Schema.Types.ObjectId, ref: 'JornadaOperativa', required: true },
    reservado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fecha: { type: Date, required: true },
  },
  { _id: false }
);

const admissionRequestSchema = new Schema<IAdmissionRequest, AdmissionRequestModel>(
  {
    nombre_aspirante: { type: String, required: true, trim: true },
    apellido_aspirante: { type: String, required: true, trim: true },
    primer_nombre: { type: String, trim: true, maxlength: 60 },
    segundo_nombre: { type: String, trim: true, maxlength: 60 },
    primer_apellido: { type: String, trim: true, maxlength: 60 },
    segundo_apellido: { type: String, trim: true, maxlength: 60 },
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
    acudiente_tipo_documento: { type: String, enum: [...TIPOS_DOCUMENTO, null], default: null },
    acudiente_numero_documento: { type: String, trim: true, default: null },
    acudiente_parentesco: { type: String, enum: [...PARENTESCOS, null], default: null },
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
    origen: { type: String, enum: ORIGENES_SOLICITUD, default: 'PUBLICA' },
    registrada_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', default: null },
    reserva: { type: reservaSchema, default: null },
    documentos: { type: [documentoSolicitudSchema], default: [] },
  },
  { timestamps: true }
);

admissionRequestSchema.index({ numero_documento: 1, estado: 1 });
admissionRequestSchema.index({ academic_year_id: 1, estado: 1 });

export const AdmissionRequest = model<IAdmissionRequest, AdmissionRequestModel>(
  'AdmissionRequest',
  admissionRequestSchema
);
export default AdmissionRequest;
