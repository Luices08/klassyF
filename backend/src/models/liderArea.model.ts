import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_AREA, EstadoArea, NIVELES_EDUCATIVOS, NivelEducativo } from '../constants/enums';
import { ALCANCES_JORNADA, AlcanceJornada } from '../constants/planeacion';

/**
 * Líder de un área para una parte de la institución (M07). Un colegio pequeño tiene uno solo por área, con el alcance por
 * defecto (todos los niveles, todas las jornadas y todas las sedes); uno grande los separa por nivel y por diurna / nocturna, y
 * puede acotarlos a unas sedes. Es el único que carga el plan de área de lo que cubre; el plan cuelga de este registro y no de la
 * persona, así que cambiar al docente no toca el plan ya cargado. Dos líderes activos de la misma área no se solapan.
 */
export interface ILiderArea {
  area_id: Types.ObjectId;
  docente_id: Types.ObjectId;
  /** Vacío = todos los niveles. */
  niveles: NivelEducativo[];
  jornada: AlcanceJornada;
  /** Vacío = todas las sedes. */
  sedes_ids: Types.ObjectId[];
  /** Inactivo = ya no lidera (se conserva porque tiene planes cargados). */
  estado: EstadoArea;
  createdAt: Date;
  updatedAt: Date;
}

export type LiderAreaDocument = HydratedDocument<ILiderArea>;
type LiderAreaModel = Model<ILiderArea>;

const liderAreaSchema = new Schema<ILiderArea, LiderAreaModel>(
  {
    area_id: { type: Schema.Types.ObjectId, ref: 'Area', required: true },
    docente_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    niveles: { type: [{ type: String, enum: NIVELES_EDUCATIVOS }], default: [] },
    jornada: { type: String, enum: ALCANCES_JORNADA, default: 'TODAS' },
    sedes_ids: { type: [{ type: Schema.Types.ObjectId, ref: 'Campus' }], default: [] },
    estado: { type: String, enum: ESTADOS_AREA, default: 'activo' },
  },
  { timestamps: true }
);

liderAreaSchema.index({ area_id: 1, estado: 1 });
liderAreaSchema.index({ docente_id: 1, estado: 1 });

export const LiderArea = model<ILiderArea, LiderAreaModel>('LiderArea', liderAreaSchema);
export default LiderArea;
