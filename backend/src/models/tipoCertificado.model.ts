import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  DefinicionCertificado,
  ELEMENTOS_AUTENTICACION,
  ESTADOS_MATRICULA_EXPEDIBLES,
  ESTADOS_TIPO_CERTIFICADO,
  EstadoTipoCertificado,
  FUENTES_CERTIFICADO,
  MAX_DESCRIPCION_TIPO,
  MAX_NOMBRE_TIPO,
  MODOS_ELEMENTO,
  PATRON_CLAVE_CERTIFICADO,
  PATRON_PREFIJO_CERTIFICADO,
} from '../constants/certificados';

/**
 * Un tipo de documento que expide la secretaría (M26): constancia de estudio, paz y salvo, o el que el colegio cree. Es un DATO, no
 * código: lo crean, editan, archivan y eliminan Secretaría y el ADMIN (con las reglas del servicio). Lo ya expedido guarda su clave
 * y su texto congelado, así que archivar un tipo no afecta lo emitido.
 */
export interface ITipoCertificado extends DefinicionCertificado {
  estado: EstadoTipoCertificado;
  /** Orden en el que se ofrece al expedir. */
  orden: number;
  /** null = lo sembró el sistema. */
  creado_por: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type TipoCertificadoDocument = HydratedDocument<ITipoCertificado>;
type TipoCertificadoModel = Model<ITipoCertificado>;

const politicaSchema = new Schema(
  Object.fromEntries(ELEMENTOS_AUTENTICACION.map((el) => [el, { type: String, enum: MODOS_ELEMENTO, required: true }])),
  { _id: false }
);

const tipoSchema = new Schema<ITipoCertificado, TipoCertificadoModel>(
  {
    clave: { type: String, required: true, trim: true, match: PATRON_CLAVE_CERTIFICADO },
    nombre: { type: String, required: true, trim: true, maxlength: MAX_NOMBRE_TIPO },
    prefijo: { type: String, required: true, trim: true, match: PATRON_PREFIJO_CERTIFICADO },
    descripcion: { type: String, default: '', trim: true, maxlength: MAX_DESCRIPCION_TIPO },
    estados_matricula: { type: [{ type: String, enum: ESTADOS_MATRICULA_EXPEDIBLES }], default: [] },
    fuentes: { type: [{ type: String, enum: FUENTES_CERTIFICADO }], default: [] },
    variables_obligatorias: { type: [String], default: [] },
    politica: { type: politicaSchema, required: true },
    estado: { type: String, enum: ESTADOS_TIPO_CERTIFICADO, default: 'BORRADOR' },
    orden: { type: Number, default: 0 },
    creado_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// La clave identifica lo expedido y el prefijo define el código del documento: ninguno se repite (ni siquiera entre tipos archivados).
tipoSchema.index({ clave: 1 }, { unique: true });
tipoSchema.index({ prefijo: 1 }, { unique: true });

export const TipoCertificado = model<ITipoCertificado, TipoCertificadoModel>('TipoCertificado', tipoSchema);
export default TipoCertificado;
