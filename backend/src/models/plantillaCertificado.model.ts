import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ClaveCertificado, FUENTES_ENTIDAD } from '../constants/certificados';
import { ESTILOS_BLOQUE, ContenidoPlantilla } from '../constants/plantillasCertificado';

export const ESTADOS_PLANTILLA = ['VIGENTE', 'ARCHIVADA'] as const;
export type EstadoPlantilla = (typeof ESTADOS_PLANTILLA)[number];

/**
 * Una versión de la plantilla de un tipo de certificado (M26). Cada publicación crea una versión nueva; la anterior queda ARCHIVADA y
 * no se edita ni se borra. Lo ya expedido no depende de esto: el texto resuelto queda congelado en el documento.
 */
export interface IPlantillaCertificado extends ContenidoPlantilla {
  tipo: ClaveCertificado;
  version: number;
  estado: EstadoPlantilla;
  /** Huella del contenido (`huellaDeContenido`). */
  hash: string;
  nota: string;
  /** null = la versión de partida que crea el sistema. */
  publicada_por: Types.ObjectId | null;
  publicada_at: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type PlantillaCertificadoDocument = HydratedDocument<IPlantillaCertificado>;
type PlantillaCertificadoModel = Model<IPlantillaCertificado>;

const bloqueSchema = new Schema(
  {
    id: { type: String, required: true, trim: true, maxlength: 40 },
    estilo: { type: String, enum: ESTILOS_BLOQUE, required: true },
    texto: { type: String, default: '' },
    condicion: {
      type: new Schema({ variable: { type: String, required: true }, tipo: { type: String, enum: ['HAY', 'NO_HAY'], required: true } }, { _id: false }),
      default: null,
    },
    activo: { type: Boolean, default: true },
  },
  { _id: false }
);

const destinatarioSchema = new Schema(
  { clave: { type: String, required: true }, etiqueta: { type: String, required: true }, frase: { type: String, required: true }, fuente_entidad: { type: String, enum: [...FUENTES_ENTIDAD, null], default: undefined } },
  { _id: false }
);

const plantillaSchema = new Schema<IPlantillaCertificado, PlantillaCertificadoModel>(
  {
    tipo: { type: String, required: true },
    version: { type: Number, required: true, min: 1 },
    estado: { type: String, enum: ESTADOS_PLANTILLA, default: 'VIGENTE' },
    titulo: { type: String, required: true, trim: true },
    bloques: { type: [bloqueSchema], default: [] },
    destinatarios: { type: [destinatarioSchema], default: [] },
    frase_otro: { type: String, required: true },
    vigencia_dias: { type: Number, default: null },
    hash: { type: String, required: true },
    nota: { type: String, default: '', maxlength: 300 },
    publicada_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    publicada_at: { type: Date, required: true },
  },
  { timestamps: true }
);

// Una versión publicada no se edita: lo único que cambia es su estado (VIGENTE → ARCHIVADA).
const CAMPOS_INMUTABLES = ['tipo', 'version', 'titulo', 'bloques', 'destinatarios', 'frase_otro', 'vigencia_dias', 'hash', 'publicada_por', 'publicada_at'];
plantillaSchema.pre('save', function protegerVersion(next) {
  if (!this.isNew && CAMPOS_INMUTABLES.some((campo) => this.isModified(campo))) return next(new Error('Una versión publicada de la plantilla no se puede modificar: se publica una nueva.'));
  next();
});

plantillaSchema.index({ tipo: 1, version: 1 }, { unique: true });
// Una sola versión vigente por tipo, garantizada por la base además del servicio.
plantillaSchema.index({ tipo: 1 }, { unique: true, partialFilterExpression: { estado: 'VIGENTE' } });

export const PlantillaCertificado = model<IPlantillaCertificado, PlantillaCertificadoModel>('PlantillaCertificado', plantillaSchema);
export default PlantillaCertificado;
