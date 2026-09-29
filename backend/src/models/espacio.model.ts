import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import {
  ESTADOS_ESPACIO,
  EstadoEspacio,
  RECURSOS_ESPACIO,
  RecursoEspacio,
  TIPOS_ESPACIO,
  TipoEspacio,
} from '../constants/enums';

// M10: un espacio fisico de una sede (aula, laboratorio, cancha...). Es opcional en el sistema: una
// institucion que no los registra sigue creando grupos sin aula (Group.aula_id = null).
export interface IEspacio {
  sede_id: Types.ObjectId;
  nombre: string;
  tipo_espacio: TipoEspacio;
  /** Aforo: puestos de trabajo disponibles. Tope del cupo de los grupos cuyo salon titular es este espacio. */
  capacidad: number;
  estado: EstadoEspacio;
  /** Ubicacion fisica, ej. "Bloque A - Piso 2". */
  piso_bloque: string | null;
  recursos: RecursoEspacio[];
  computadores_operativos: number;
  /** Areas que pueden usar el espacio (ej. el laboratorio solo Ciencias Naturales). Vacio = uso general. */
  areas_exclusivas: Types.ObjectId[];
  /** false (lo usual): un solo grupo a la vez. true: varios grupos simultaneos (cancha, patio). */
  admite_grupos_simultaneos: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type EspacioDocument = HydratedDocument<IEspacio>;
type EspacioModel = Model<IEspacio>;

const espacioSchema = new Schema<IEspacio, EspacioModel>(
  {
    sede_id: { type: Schema.Types.ObjectId, ref: 'Campus', required: true },
    nombre: { type: String, required: true, trim: true },
    tipo_espacio: { type: String, enum: TIPOS_ESPACIO, required: true },
    capacidad: {
      type: Number,
      required: true,
      min: [1, 'La capacidad debe ser al menos 1.'],
      validate: { validator: Number.isInteger, message: 'La capacidad debe ser un numero entero.' },
    },
    estado: { type: String, enum: ESTADOS_ESPACIO, default: 'DISPONIBLE' },
    piso_bloque: { type: String, default: null, trim: true },
    recursos: {
      type: [{ type: String, enum: RECURSOS_ESPACIO }],
      default: [],
      validate: {
        validator: (r: string[]) => new Set(r).size === r.length,
        message: 'Los recursos no pueden repetirse.',
      },
    },
    computadores_operativos: {
      type: Number,
      default: 0,
      min: [0, 'Los computadores operativos no pueden ser negativos.'],
      validate: { validator: Number.isInteger, message: 'Los computadores operativos deben ser un numero entero.' },
    },
    areas_exclusivas: { type: [{ type: Schema.Types.ObjectId, ref: 'Area' }], default: [] },
    admite_grupos_simultaneos: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// El nombre de un espacio es unico dentro de su sede.
espacioSchema.index({ sede_id: 1, nombre: 1 }, { unique: true });

export const Espacio = model<IEspacio, EspacioModel>('Espacio', espacioSchema);
export default Espacio;
