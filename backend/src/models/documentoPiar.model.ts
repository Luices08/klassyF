import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  CLAVES_DOCUMENTO_PIAR,
  ClaveDocumentoPiar,
  ESTADOS_DOCUMENTO_PIAR,
  EstadoDocumentoPiar,
  ROLES_FIRMANTE,
  RolFirmante,
} from '../constants/inclusion';

export interface IFirmante {
  nombre: string;
  rol: RolFirmante;
}

/**
 * Un documento emitido (Anexo 1, PIAR, acta, informe, paquete): el contenido se CONGELA en `snapshot` al emitirlo y el PDF se
 * genera desde él, así lo firmado no cambia aunque el expediente siga evolucionando (el PIAR es progresivo). La huella (`hash`)
 * permite detectar cualquier alteración directa en la base, y se imprime corta en cada hoja para vincular el escaneo firmado.
 */
export interface IDocumentoPiar {
  expediente_id: Types.ObjectId;
  student_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  clave: ClaveDocumentoPiar;
  /** Versión de este documento dentro del expediente (1, 2…): re-emitir tras cambios crea una nueva y sustituye la anterior no firmada. */
  version: number;
  consecutivo: number;
  codigo: string;
  snapshot: unknown;
  hash: string;
  estado: EstadoDocumentoPiar;
  emitido_por: Types.ObjectId;
  fecha_emision: Date;
  firma: {
    por: Types.ObjectId;
    fecha: Date;
    firmantes: IFirmante[];
    soporte_path: string;
    soporte_hash: string;
    soporte_nombre: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

export type DocumentoPiarDocument = HydratedDocument<IDocumentoPiar>;
type DocumentoPiarModel = Model<IDocumentoPiar>;

const documentoSchema = new Schema<IDocumentoPiar, DocumentoPiarModel>(
  {
    expediente_id: { type: Schema.Types.ObjectId, ref: 'ExpedienteInclusion', required: true },
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    clave: { type: String, enum: CLAVES_DOCUMENTO_PIAR, required: true },
    version: { type: Number, required: true, min: 1 },
    consecutivo: { type: Number, required: true, min: 1 },
    codigo: { type: String, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
    hash: { type: String, required: true },
    estado: { type: String, enum: ESTADOS_DOCUMENTO_PIAR, default: 'EMITIDO' },
    emitido_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fecha_emision: { type: Date, required: true },
    firma: {
      type: new Schema(
        {
          por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          fecha: { type: Date, required: true },
          firmantes: {
            type: [new Schema<IFirmante>({ nombre: { type: String, required: true, maxlength: 120 }, rol: { type: String, enum: ROLES_FIRMANTE, required: true } }, { _id: false })],
            default: [],
          },
          soporte_path: { type: String, required: true },
          soporte_hash: { type: String, required: true },
          soporte_nombre: { type: String, required: true, maxlength: 120 },
        },
        { _id: false }
      ),
      default: null,
    },
  },
  { timestamps: true }
);

// El contenido emitido es inmutable en el modelo (no solo en el servicio): solo cambian el estado y el soporte firmado.
const CAMPOS_INMUTABLES = ['snapshot', 'hash', 'codigo', 'consecutivo', 'version', 'clave', 'expediente_id', 'student_id', 'fecha_emision', 'emitido_por'];
documentoSchema.pre('save', function protegerDocumentoEmitido(next) {
  if (!this.isNew) {
    const tocados = CAMPOS_INMUTABLES.filter((campo) => this.isModified(campo));
    if (tocados.length > 0) return next(new Error('Un documento emitido no se puede modificar: se emite una nueva versión.'));
    if (this.firma && this.isModified('firma') && this.estado !== 'FIRMADO') return next(new Error('La firma solo se registra al pasar el documento a FIRMADO.'));
  }
  next();
});

documentoSchema.index({ expediente_id: 1, clave: 1, version: 1 }, { unique: true });
documentoSchema.index({ codigo: 1 }, { unique: true });

export const DocumentoPiar = model<IDocumentoPiar, DocumentoPiarModel>('DocumentoPiar', documentoSchema);
export default DocumentoPiar;
