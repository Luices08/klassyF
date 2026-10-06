import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  ESTADOS_SOLICITUD_APOYO,
  EstadoSolicitudApoyo,
  MAX_TEXTO_CORTO,
  MAX_TEXTO_LARGO,
  ORIGENES_SOLICITUD_APOYO,
  OrigenSolicitudApoyo,
  RESULTADOS_SOLICITUD_APOYO,
  ResultadoSolicitudApoyo,
} from './inclusion.constants';

/**
 * Entrada única a M16: lo que secretaría registra al matricular, lo que el aspirante declara al preinscribirse o lo que un docente
 * observa. Es un traspaso (como `SolicitudCaso` de M14→M15): no lleva diagnóstico ni rótulo clínico, solo lo declarado u observado.
 * Orientación la valora y decide si abre un expediente.
 */
export interface ISolicitudApoyo {
  student_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  sede_id: Types.ObjectId;
  origen: OrigenSolicitudApoyo;
  /** Lo que declaró la familia o describió el docente, en sus palabras (no es un diagnóstico). */
  motivo_declarado: string;
  /** La familia entregó un soporte médico: va a orientación en físico o por M16; la solicitud solo lo registra. */
  aporta_soporte: boolean;
  observacion: string;
  solicitada_por: Types.ObjectId | null;
  estado: EstadoSolicitudApoyo;
  valoracion: { por: Types.ObjectId; fecha: Date } | null;
  resolucion: { por: Types.ObjectId; fecha: Date; resultado: ResultadoSolicitudApoyo; motivo: string } | null;
  expediente_id: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type SolicitudApoyoDocument = HydratedDocument<ISolicitudApoyo>;
type SolicitudApoyoModel = Model<ISolicitudApoyo>;

const solicitudApoyoSchema = new Schema<ISolicitudApoyo, SolicitudApoyoModel>(
  {
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    sede_id: { type: Schema.Types.ObjectId, ref: 'Campus', required: true },
    origen: { type: String, enum: ORIGENES_SOLICITUD_APOYO, required: true },
    motivo_declarado: { type: String, required: true, trim: true, maxlength: MAX_TEXTO_CORTO },
    aporta_soporte: { type: Boolean, default: false },
    observacion: { type: String, default: '', trim: true, maxlength: MAX_TEXTO_LARGO },
    solicitada_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    estado: { type: String, enum: ESTADOS_SOLICITUD_APOYO, default: 'PENDIENTE' },
    valoracion: {
      type: new Schema({ por: { type: Schema.Types.ObjectId, ref: 'User', required: true }, fecha: { type: Date, required: true } }, { _id: false }),
      default: null,
    },
    resolucion: {
      type: new Schema(
        {
          por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          fecha: { type: Date, required: true },
          resultado: { type: String, enum: RESULTADOS_SOLICITUD_APOYO, required: true },
          motivo: { type: String, required: true, maxlength: MAX_TEXTO_CORTO },
        },
        { _id: false }
      ),
      default: null,
    },
    expediente_id: { type: Schema.Types.ObjectId, ref: 'ExpedienteInclusion', default: null },
  },
  { timestamps: true }
);

// Una sola solicitud abierta por estudiante y año: reportar dos veces lo mismo no llena la bandeja.
solicitudApoyoSchema.index(
  { student_id: 1, academic_year_id: 1 },
  { unique: true, partialFilterExpression: { estado: { $in: ['PENDIENTE', 'EN_VALORACION'] } } }
);
solicitudApoyoSchema.index({ sede_id: 1, estado: 1, createdAt: -1 });

export const SolicitudApoyo = model<ISolicitudApoyo, SolicitudApoyoModel>('SolicitudApoyo', solicitudApoyoSchema);
export default SolicitudApoyo;
