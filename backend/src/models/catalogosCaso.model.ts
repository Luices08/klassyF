import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { TIPOS_SITUACION, TipoSituacion } from '../constants/convivencia';
import { ESTADOS_USUARIO, EstadoUsuario } from '../constants/enums';

const COLACION = { locale: 'es', strength: 2 } as const;

/** Medida pedagógica, restaurativa o correctiva del manual (p. ej. "Trabajo social en contrajornada"). Catálogo de cada colegio. */
export interface IMedidaConvivencia {
  institucion_id: Types.ObjectId;
  nombre: string;
  descripcion: string;
  /** Si la medida se aplica por días (p. ej. desescolarización): al registrarla se pide la duración. */
  se_aplica_por_dias: boolean;
  orden: number;
  estado: EstadoUsuario;
}
export type MedidaConvivenciaDocument = HydratedDocument<IMedidaConvivencia>;

const medidaSchema = new Schema<IMedidaConvivencia, Model<IMedidaConvivencia>>(
  {
    institucion_id: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
    nombre: { type: String, required: true, trim: true, maxlength: 120 },
    descripcion: { type: String, default: '', trim: true, maxlength: 1000 },
    se_aplica_por_dias: { type: Boolean, default: false },
    orden: { type: Number, default: 0 },
    estado: { type: String, enum: ESTADOS_USUARIO, default: 'activo' },
  },
  { timestamps: true }
);
medidaSchema.index({ institucion_id: 1, nombre: 1 }, { unique: true, collation: COLACION });
export const MedidaConvivencia = model<IMedidaConvivencia>('MedidaConvivencia', medidaSchema);

/** Entidad a la que se remite un caso (ICBF, comisaría de familia, policía de infancia y adolescencia, EPS…). */
export interface IEntidadExterna {
  institucion_id: Types.ObjectId;
  nombre: string;
  descripcion: string;
  orden: number;
  estado: EstadoUsuario;
}
export type EntidadExternaDocument = HydratedDocument<IEntidadExterna>;

const entidadSchema = new Schema<IEntidadExterna, Model<IEntidadExterna>>(
  {
    institucion_id: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
    nombre: { type: String, required: true, trim: true, maxlength: 150 },
    descripcion: { type: String, default: '', trim: true, maxlength: 500 },
    orden: { type: Number, default: 0 },
    estado: { type: String, enum: ESTADOS_USUARIO, default: 'activo' },
  },
  { timestamps: true }
);
entidadSchema.index({ institucion_id: 1, nombre: 1 }, { unique: true, collation: COLACION });
export const EntidadExterna = model<IEntidadExterna>('EntidadExterna', entidadSchema);

/** Protocolo de un tipo de situación: lista ordenada de pasos que se copia al abrir (o escalar) un caso. */
export interface IPasoProtocolo {
  nombre: string;
  obligatorio: boolean;
  orden: number;
}

export interface IProtocoloConvivencia {
  institucion_id: Types.ObjectId;
  tipo_situacion: TipoSituacion;
  pasos: IPasoProtocolo[];
}
export type ProtocoloConvivenciaDocument = HydratedDocument<IProtocoloConvivencia>;

const protocoloSchema = new Schema<IProtocoloConvivencia, Model<IProtocoloConvivencia>>(
  {
    institucion_id: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
    tipo_situacion: { type: String, enum: TIPOS_SITUACION, required: true },
    pasos: {
      type: [
        new Schema<IPasoProtocolo>(
          {
            nombre: { type: String, required: true, trim: true, maxlength: 200 },
            obligatorio: { type: Boolean, default: false },
            orden: { type: Number, default: 0 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);
protocoloSchema.index({ institucion_id: 1, tipo_situacion: 1 }, { unique: true });
export const ProtocoloConvivencia = model<IProtocoloConvivencia>('ProtocoloConvivencia', protocoloSchema);
