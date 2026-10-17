import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { FIRMAS_REQUERIDAS, MAYORIAS } from '../constants/comision';
import { FALTAS_COMPUTABLES } from '../constants/promocion';
import { CONFIGURACION_INICIAL, ConfiguracionDeComision } from '../utils/comision';

/** Lo que cada colegio decide para el tablero de riesgo y las sesiones de M20. Una por instalación; nace con los valores de partida. */
export interface IConfiguracionComision extends ConfiguracionDeComision {
  actualizado_por: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ConfiguracionComisionDocument = HydratedDocument<IConfiguracionComision>;
type ConfiguracionComisionModel = Model<IConfiguracionComision>;

const D = CONFIGURACION_INICIAL;
const numero = (valor: number, min: number, max: number) => ({ type: Number, min, max, default: valor });

const configuracionSchema = new Schema<IConfiguracionComision, ConfiguracionComisionModel>(
  {
    semaforo: {
      type: new Schema(
        {
          amarillo_desde: numero(D.semaforo.amarillo_desde, 1, 50),
          naranja_desde: numero(D.semaforo.naranja_desde, 1, 50),
          rojo_desde: numero(D.semaforo.rojo_desde, 1, 50),
          inasistencia_roja_pct: numero(D.semaforo.inasistencia_roja_pct, 1, 100),
          faltas: { type: String, enum: FALTAS_COMPUTABLES, default: D.semaforo.faltas },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    reprobacion_masiva: {
      type: new Schema({ porcentaje: numero(D.reprobacion_masiva.porcentaje, 1, 100), minimo_estudiantes: numero(D.reprobacion_masiva.minimo_estudiantes, 1, 500) }, { _id: false }),
      default: () => ({}),
    },
    quorum_porcentaje: numero(D.quorum_porcentaje, 1, 100),
    mayoria: { type: String, enum: MAYORIAS, default: D.mayoria },
    firmas_requeridas: { type: String, enum: FIRMAS_REQUERIDAS, default: D.firmas_requeridas },
    actualizado_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

export const ConfiguracionComision = model<IConfiguracionComision, ConfiguracionComisionModel>('ConfiguracionComision', configuracionSchema);
export default ConfiguracionComision;
