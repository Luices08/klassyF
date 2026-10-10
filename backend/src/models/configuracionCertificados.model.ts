import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  CARGO_RECTORIA_INICIAL,
  CARGO_SECRETARIA_INICIAL,
  CLAVES_CERTIFICADO,
  ClaveCertificado,
  DEPENDENCIAS_PAZ_Y_SALVO_INICIALES,
  DependenciaPazYSalvo,
  ELEMENTOS_AUTENTICACION,
  MAX_NOMBRE_DEPENDENCIA,
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
  /** Las dependencias que el colegio exige para el paz y salvo (cada una se confirma al expedirlo). */
  paz_y_salvo: { dependencias: DependenciaPazYSalvo[] };
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

const dependenciaSchema = new Schema<DependenciaPazYSalvo>(
  {
    clave: { type: String, required: true, trim: true, maxlength: 40 },
    nombre: { type: String, required: true, trim: true, maxlength: MAX_NOMBRE_DEPENDENCIA },
    activa: { type: Boolean, default: true },
  },
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
      // Cada tipo trae su valor de partida: una configuración guardada antes de que existiera un tipo nuevo sigue siendo válida.
      type: new Schema(
        Object.fromEntries(CLAVES_CERTIFICADO.map((clave) => [clave, { type: politicaSchema, required: true, default: () => structuredClone(POLITICA_INICIAL[clave]) }])),
        { _id: false }
      ),
      default: () => structuredClone(POLITICA_INICIAL),
    },
    paz_y_salvo: {
      type: new Schema({ dependencias: { type: [dependenciaSchema], default: () => structuredClone(DEPENDENCIAS_PAZ_Y_SALVO_INICIALES) } }, { _id: false }),
      default: () => ({}),
    },
  },
  { timestamps: true }
);

export const ConfiguracionCertificados = model<IConfiguracionCertificados, ConfiguracionCertificadosModel>('ConfiguracionCertificados', configuracionSchema);
export default ConfiguracionCertificados;
