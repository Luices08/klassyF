import { HydratedDocument, Model, Schema, model } from 'mongoose';
import { ESTADOS_ESCALA_EXTERNA, EstadoEscalaExterna, METODOS_CONVERSION, MetodoConversion, TIPOS_ESCALA_EXTERNA, TipoEscalaExterna } from '../constants/traslados';
import type { ConceptoEquivalencia, RangoEquivalencia } from '../utils/homologacion';

/**
 * Una escala de evaluación de otra institución (1–10, 0–100, conceptual...) con su equivalencia a la escala del colegio (configuración
 * institucional, M32). Las notas que se homologan copian la escala que se usó: editarla después no reescribe lo ya homologado.
 */
export interface IEscalaExterna {
  nombre: string;
  descripcion: string;
  tipo: TipoEscalaExterna;
  valor_minimo: number | null;
  valor_maximo: number | null;
  valor_aprobatorio: number | null;
  metodo: MetodoConversion;
  rangos: RangoEquivalencia[];
  conceptos: ConceptoEquivalencia[];
  estado: EstadoEscalaExterna;
  createdAt: Date;
  updatedAt: Date;
}

export type EscalaExternaDocument = HydratedDocument<IEscalaExterna>;
type EscalaExternaModel = Model<IEscalaExterna>;

const escalaExternaSchema = new Schema<IEscalaExterna, EscalaExternaModel>(
  {
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String, default: '', trim: true },
    tipo: { type: String, enum: TIPOS_ESCALA_EXTERNA, required: true },
    valor_minimo: { type: Number, default: null },
    valor_maximo: { type: Number, default: null },
    valor_aprobatorio: { type: Number, default: null },
    metodo: { type: String, enum: METODOS_CONVERSION, default: 'LINEAL' },
    rangos: {
      type: [new Schema({ desde: { type: Number, required: true }, hasta: { type: Number, required: true }, nota: { type: Number, required: true } }, { _id: false })],
      default: [],
    },
    conceptos: {
      type: [
        new Schema(
          { concepto: { type: String, required: true, trim: true }, abreviatura: { type: String, default: '', trim: true }, nota: { type: Number, required: true } },
          { _id: false }
        ),
      ],
      default: [],
    },
    estado: { type: String, enum: ESTADOS_ESCALA_EXTERNA, default: 'activo' },
  },
  { timestamps: true }
);

escalaExternaSchema.index({ nombre: 1 }, { unique: true, collation: { locale: 'es', strength: 1 } });

export const EscalaExterna = model<IEscalaExterna, EscalaExternaModel>('EscalaExterna', escalaExternaSchema);
export default EscalaExterna;
