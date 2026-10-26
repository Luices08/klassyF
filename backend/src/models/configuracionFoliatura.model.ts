import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  ESQUEMAS_FOLIATURA,
  EsquemaFoliatura,
  ID_CONFIGURACION_FOLIATURA,
  MASCARA_INICIAL,
  MAX_CAPACIDAD_POR_LIBRO,
  MAX_LIBRO,
} from '../constants/foliatura';

/**
 * Cómo numera el colegio su Libro de Matrícula (M04): una por instalación, con el punto de partida del archivo físico. El colegio que adopta
 * Klassy con 60 años de historia dice en qué libro y folio va, y el sistema sigue desde ahí; uno nuevo arranca en cero.
 * Los folios que se asignan salen de `contadores` con una sola actualización atómica (la misma transacción de la matrícula), así que no hay huecos
 * ni repetidos. Lo ya asentado no se reescribe nunca: cambiar la máscara solo afecta los folios nuevos.
 */
export interface IConfiguracionFoliatura {
  _id: string;
  esquema: EsquemaFoliatura;
  /** Cómo se arma el código visible del folio (`folio_matricula`). */
  mascara: string;
  /** Folios por libro; al llenarse se abre el siguiente con el folio en 1. Solo cuenta en el esquema continuo (en el anual el libro es el año). */
  capacidad_por_libro: number | null;
  /** El libro que va corriendo en el esquema continuo; en el anual es solo el año del que se fijó el último folio. */
  libro_actual: number | null;
  /** Último folio asignado en cada libro (clave = número de libro). */
  contadores: Map<string, number>;
  /** false = valores de partida que nadie con permiso ha revisado todavía. */
  confirmada: boolean;
  actualizado_por: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ConfiguracionFoliaturaDocument = HydratedDocument<IConfiguracionFoliatura>;
type ConfiguracionFoliaturaModel = Model<IConfiguracionFoliatura>;

const configuracionSchema = new Schema<IConfiguracionFoliatura, ConfiguracionFoliaturaModel>(
  {
    _id: { type: String, default: ID_CONFIGURACION_FOLIATURA },
    esquema: { type: String, enum: ESQUEMAS_FOLIATURA, default: 'ANUAL' },
    mascara: { type: String, default: MASCARA_INICIAL, trim: true },
    capacidad_por_libro: { type: Number, min: 1, max: MAX_CAPACIDAD_POR_LIBRO, default: null },
    libro_actual: { type: Number, min: 1, max: MAX_LIBRO, default: null },
    contadores: { type: Map, of: Number, default: () => new Map() },
    confirmada: { type: Boolean, default: false },
    actualizado_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, minimize: false }
);

export const ConfiguracionFoliatura = model<IConfiguracionFoliatura, ConfiguracionFoliaturaModel>('ConfiguracionFoliatura', configuracionSchema);
export default ConfiguracionFoliatura;
