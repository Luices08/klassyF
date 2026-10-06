import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  ESTADOS_REMISION_ORIENTACION,
  EstadoRemisionOrientacion,
  ORIGENES_REMISION_ORIENTACION,
  OrigenRemisionOrientacion,
  ROLES_INVOLUCRADO,
  RolInvolucrado,
  TIPOS_SITUACION,
  TipoSituacion,
} from '../comun/convivencia.constants';

/** Lo que orientación escribe en una sesión: confidencial, solo lo lee quien la escribió (y un ADMIN). */
export interface IAtencionOrientacion {
  fecha: Date;
  descripcion: string;
  por: Types.ObjectId;
}

/**
 * Un estudiante remitido a orientación desde un caso de convivencia (M15). Es una colección aparte para que orientación vea
 * la remisión sin ver el caso (ni a los demás involucrados) y para que las atenciones, que son confidenciales, no viajen en el
 * expediente de convivencia. El contexto del caso (código, tipo, hechos) se copia al crearla.
 */
export interface IRemisionOrientacion {
  caso_id: Types.ObjectId;
  caso_codigo: string;
  sede_id: Types.ObjectId;
  tipo_situacion: TipoSituacion;
  hechos: string;
  student_id: Types.ObjectId;
  group_id: Types.ObjectId;
  rol: RolInvolucrado;
  origen: OrigenRemisionOrientacion;
  /** Nombre de la medida o del paso que la originó; en una manual, el motivo que escribió convivencia. */
  origen_detalle: string;
  /** Hace idempotente la remisión automática (caso+estudiante+medida/paso): aplicar o cumplir dos veces no la duplica. */
  clave?: string;
  estado: EstadoRemisionOrientacion;
  remitida_por: Types.ObjectId;
  atenciones: Types.DocumentArray<IAtencionOrientacion>;
  atendida: { por: Types.ObjectId; fecha: Date } | null;
  createdAt: Date;
  updatedAt: Date;
}

export type RemisionOrientacionDocument = HydratedDocument<IRemisionOrientacion>;
type RemisionOrientacionModel = Model<IRemisionOrientacion>;

const atencionSchema = new Schema<IAtencionOrientacion>({
  fecha: { type: Date, required: true },
  descripcion: { type: String, required: true, maxlength: 4000 },
  por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

const remisionSchema = new Schema<IRemisionOrientacion, RemisionOrientacionModel>(
  {
    caso_id: { type: Schema.Types.ObjectId, ref: 'CasoConvivencia', required: true },
    caso_codigo: { type: String, required: true },
    sede_id: { type: Schema.Types.ObjectId, ref: 'Campus', required: true },
    tipo_situacion: { type: String, enum: TIPOS_SITUACION, required: true },
    hechos: { type: String, required: true, maxlength: 4000 },
    student_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    group_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    rol: { type: String, enum: ROLES_INVOLUCRADO, required: true },
    origen: { type: String, enum: ORIGENES_REMISION_ORIENTACION, required: true },
    origen_detalle: { type: String, default: '', maxlength: 500 },
    clave: { type: String },
    estado: { type: String, enum: ESTADOS_REMISION_ORIENTACION, default: 'PENDIENTE' },
    remitida_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    atenciones: { type: [atencionSchema], default: [] },
    atendida: {
      type: new Schema({ por: { type: Schema.Types.ObjectId, ref: 'User', required: true }, fecha: { type: Date, required: true } }, { _id: false }),
      default: null,
    },
  },
  { timestamps: true }
);

// Solo las automáticas tienen clave; las manuales (sin clave) no se restringen en el índice.
remisionSchema.index({ clave: 1 }, { unique: true, partialFilterExpression: { clave: { $type: 'string' } } });
remisionSchema.index({ sede_id: 1, estado: 1, createdAt: -1 });
remisionSchema.index({ caso_id: 1 });

export const RemisionOrientacion = model<IRemisionOrientacion, RemisionOrientacionModel>('RemisionOrientacion', remisionSchema);
export default RemisionOrientacion;
