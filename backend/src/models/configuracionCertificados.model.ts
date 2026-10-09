import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  CARGO_RECTORIA_INICIAL,
  CARGO_SECRETARIA_INICIAL,
  CLAVES_CERTIFICADO,
  ClaveCertificado,
  ELEMENTOS_AUTENTICACION,
  MODOS_ELEMENTO,
  POLITICA_INICIAL,
  PoliticaDeCertificado,
} from '../constants/certificados';
import { ImagenGuardada } from '../utils/certificados';

export interface IFirmante {
  /** Quien firma sale del usuario del sistema: nombre y cargo no se vuelven a digitar en cada documento. */
  usuario_id: Types.ObjectId | null;
  cargo: string;
  imagen: ImagenGuardada | null;
}

/** Quién firma los certificados, con qué imágenes y qué se estampa por defecto (una configuración por instalación). */
export interface IConfiguracionCertificados {
  institucion_id: Types.ObjectId;
  rectoria: IFirmante;
  secretaria: IFirmante;
  sello: { imagen: ImagenGuardada | null };
  /** Si la secretaría puede estampar la firma digitalizada de rectoría al expedir (el ADMIN siempre puede). */
  permitir_firma_rectoria_a_secretaria: boolean;
  politica: Record<ClaveCertificado, PoliticaDeCertificado>;
  createdAt: Date;
  updatedAt: Date;
}

export type ConfiguracionCertificadosDocument = HydratedDocument<IConfiguracionCertificados>;
type ConfiguracionCertificadosModel = Model<IConfiguracionCertificados>;

const imagenSchema = new Schema<ImagenGuardada>({ hash: { type: String, required: true }, ext: { type: String, required: true } }, { _id: false });

const firmanteSchema = (cargoInicial: string) =>
  new Schema<IFirmante>(
    {
      usuario_id: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      cargo: { type: String, trim: true, maxlength: 80, default: cargoInicial },
      imagen: { type: imagenSchema, default: null },
    },
    { _id: false }
  );

const politicaSchema = new Schema<PoliticaDeCertificado>(
  Object.fromEntries(ELEMENTOS_AUTENTICACION.map((el) => [el, { type: String, enum: MODOS_ELEMENTO, required: true }])),
  { _id: false }
);

const configuracionSchema = new Schema<IConfiguracionCertificados, ConfiguracionCertificadosModel>(
  {
    institucion_id: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, unique: true },
    rectoria: { type: firmanteSchema(CARGO_RECTORIA_INICIAL), default: () => ({}) },
    secretaria: { type: firmanteSchema(CARGO_SECRETARIA_INICIAL), default: () => ({}) },
    sello: { type: new Schema({ imagen: { type: imagenSchema, default: null } }, { _id: false }), default: () => ({}) },
    permitir_firma_rectoria_a_secretaria: { type: Boolean, default: true },
    politica: {
      type: new Schema(Object.fromEntries(CLAVES_CERTIFICADO.map((clave) => [clave, { type: politicaSchema, required: true }])), { _id: false }),
      default: () => structuredClone(POLITICA_INICIAL),
    },
  },
  { timestamps: true }
);

export const ConfiguracionCertificados = model<IConfiguracionCertificados, ConfiguracionCertificadosModel>('ConfiguracionCertificados', configuracionSchema);
export default ConfiguracionCertificados;
