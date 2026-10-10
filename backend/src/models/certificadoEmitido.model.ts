import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ClaveCertificado, ESTADOS_CERTIFICADO, EstadoCertificado, MAX_MOTIVO_ANULACION, TIPOS_SOLICITANTE, TipoSolicitante } from '../constants/certificados';

/**
 * Un certificado o constancia expedido (M26). El contenido se CONGELA en `snapshot` y el PDF se dibuja solo desde él, así
 * una reimpresión es el mismo documento con el mismo código. `hash` es el HMAC del contenido; `token_verificacion` es lo
 * único que va dentro del QR. Nada se borra: un documento mal expedido se anula con motivo.
 */
/** A quién se entregó el documento. Se guarda al expedir y no se edita; no se imprime en el documento. */
export interface SolicitanteCertificado {
  tipo: TipoSolicitante;
  nombre: string;
  tipo_documento: string | null;
  numero_documento: string | null;
  /** Parentesco (acudiente), relación con el estudiante (tercero) o número de oficio (autoridad). */
  detalle: string | null;
  guardian_id: Types.ObjectId | null;
}

export interface ICertificadoEmitido {
  tipo: ClaveCertificado;
  codigo: string;
  consecutivo: number;
  anio_emision: number;
  student_id: Types.ObjectId;
  /** La sede de la matrícula: define quién (secretaría de esa sede) puede ver y reimprimir el documento. Los anteriores se completan con la migración. */
  sede_id: Types.ObjectId | null;
  enrollment_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  snapshot: unknown;
  hash: string;
  token_verificacion: string;
  estado: EstadoCertificado;
  anulacion: { por: Types.ObjectId; fecha: Date; motivo: string } | null;
  emitido_por: Types.ObjectId;
  fecha_emision: Date;
  /** Los documentos anteriores a este registro no lo tienen. */
  solicitante?: SolicitanteCertificado | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CertificadoEmitidoDocument = HydratedDocument<ICertificadoEmitido>;
type CertificadoEmitidoModel = Model<ICertificadoEmitido>;

const certificadoSchema = new Schema<ICertificadoEmitido, CertificadoEmitidoModel>(
  {
    // La clave de un TipoCertificado (dato del colegio): lo expedido la conserva aunque el tipo se archive.
    tipo: { type: String, required: true },
    codigo: { type: String, required: true },
    consecutivo: { type: Number, required: true, min: 1 },
    anio_emision: { type: Number, required: true },
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sede_id: { type: Schema.Types.ObjectId, ref: 'Campus', default: null },
    enrollment_id: { type: Schema.Types.ObjectId, ref: 'Enrollment', required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    hash: { type: String, required: true },
    token_verificacion: { type: String, required: true },
    estado: { type: String, enum: ESTADOS_CERTIFICADO, default: 'VIGENTE' },
    anulacion: {
      type: new Schema(
        {
          por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          fecha: { type: Date, required: true },
          motivo: { type: String, required: true, maxlength: MAX_MOTIVO_ANULACION },
        },
        { _id: false }
      ),
      default: null,
    },
    emitido_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fecha_emision: { type: Date, required: true },
    solicitante: {
      type: new Schema(
        {
          tipo: { type: String, enum: TIPOS_SOLICITANTE, required: true },
          nombre: { type: String, required: true, trim: true, maxlength: 120 },
          tipo_documento: { type: String, default: null, trim: true, maxlength: 10 },
          numero_documento: { type: String, default: null, trim: true, maxlength: 30 },
          detalle: { type: String, default: null, trim: true, maxlength: 120 },
          guardian_id: { type: Schema.Types.ObjectId, ref: 'Guardian', default: null },
        },
        { _id: false }
      ),
      default: null,
    },
  },
  { timestamps: true }
);

// Lo expedido es inmutable en el modelo (no solo en el servicio): únicamente cambian el estado y la anulación.
const CAMPOS_INMUTABLES = ['tipo', 'codigo', 'consecutivo', 'anio_emision', 'student_id', 'sede_id', 'enrollment_id', 'academic_year_id', 'snapshot', 'hash', 'token_verificacion', 'emitido_por', 'fecha_emision', 'solicitante'];
certificadoSchema.pre('save', function protegerCertificado(next) {
  if (!this.isNew) {
    if (CAMPOS_INMUTABLES.some((campo) => this.isModified(campo))) return next(new Error('Un certificado expedido no se puede modificar: se anula y se expide uno nuevo.'));
    if (this.isModified('estado') && this.estado === 'ANULADO' && !this.anulacion) return next(new Error('Anular un certificado exige el motivo.'));
  }
  next();
});

certificadoSchema.index({ codigo: 1 }, { unique: true });
certificadoSchema.index({ token_verificacion: 1 }, { unique: true });
certificadoSchema.index({ student_id: 1, fecha_emision: -1 });
certificadoSchema.index({ sede_id: 1, fecha_emision: -1 });
certificadoSchema.index({ tipo: 1, anio_emision: 1, consecutivo: 1 }, { unique: true });

export const CertificadoEmitido = model<ICertificadoEmitido, CertificadoEmitidoModel>('CertificadoEmitido', certificadoSchema);
export default CertificadoEmitido;
