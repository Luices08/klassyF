import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { NIVELES_EDUCATIVOS, NivelEducativo, TIPOS_INGRESO, TipoIngreso } from '../constants/enums';
import {
  APROBACIONES_AUTOMATICAS,
  AprobacionAutomatica,
  CATEGORIAS_REQUISITO,
  CONDICIONES_REQUISITO,
  CondicionRequisito,
  MAX_INDICACION_REQUISITO,
  MAX_NOMBRE_REQUISITO,
  PATRON_CLAVE_DOCUMENTO,
} from '../constants/requisitosDocumentales';

/**
 * Un documento que el colegio pide al matricular (M04): qué es, para qué grados y tipos de ingreso aplica, si es obligatorio y bajo qué condición.
 * Es el catálogo configurable del checklist: al matricular se copia (nombre, indicación, categoría y obligatoriedad) en cada ítem, así editar el
 * catálogo no cambia matrículas ya creadas. Sin grados, niveles ni tipos de ingreso marcados aplica a todos.
 */
export interface IRequisitoDocumental {
  /** Identificador estable del documento (lo usa el checklist de cada matrícula); no se edita. */
  clave: string;
  nombre: string;
  indicacion: string;
  categoria: (typeof CATEGORIAS_REQUISITO)[number];
  obligatorio: boolean;
  niveles: NivelEducativo[];
  /** Números de grado (-2 a 11, como el catálogo de grados): no dependen de los ids del catálogo. */
  grados_numeros: number[];
  tipos_ingreso: TipoIngreso[];
  condicion_especial: CondicionRequisito;
  /** Un módulo del sistema aprueba solo este documento (hoy, el paz y salvo del año anterior). Lo siembra el sistema; no se edita. */
  aprobacion_automatica: AprobacionAutomatica | null;
  orden: number;
  estado: 'activo' | 'inactivo';
  actualizado_por: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type RequisitoDocumentalDocument = HydratedDocument<IRequisitoDocumental>;
type RequisitoDocumentalModel = Model<IRequisitoDocumental>;

const requisitoDocumentalSchema = new Schema<IRequisitoDocumental, RequisitoDocumentalModel>(
  {
    clave: { type: String, required: true, trim: true, match: PATRON_CLAVE_DOCUMENTO, unique: true },
    nombre: { type: String, required: true, trim: true, maxlength: MAX_NOMBRE_REQUISITO },
    indicacion: { type: String, trim: true, maxlength: MAX_INDICACION_REQUISITO, default: '' },
    categoria: { type: String, enum: CATEGORIAS_REQUISITO, default: 'INSTITUCIONAL' },
    obligatorio: { type: Boolean, default: true },
    niveles: { type: [{ type: String, enum: NIVELES_EDUCATIVOS }], default: [] },
    grados_numeros: { type: [{ type: Number, min: -2, max: 11 }], default: [] },
    tipos_ingreso: { type: [{ type: String, enum: TIPOS_INGRESO }], default: [] },
    condicion_especial: { type: String, enum: CONDICIONES_REQUISITO, default: 'NINGUNA' },
    aprobacion_automatica: { type: String, enum: [...APROBACIONES_AUTOMATICAS, null], default: null },
    orden: { type: Number, default: 100 },
    estado: { type: String, enum: ['activo', 'inactivo'], default: 'activo' },
    actualizado_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

export const RequisitoDocumental = model<IRequisitoDocumental, RequisitoDocumentalModel>('RequisitoDocumental', requisitoDocumentalSchema);
export default RequisitoDocumental;
