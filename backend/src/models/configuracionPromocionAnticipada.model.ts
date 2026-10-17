import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { TRATAMIENTOS_NOTAS } from '../constants/promocionAnticipada';
import { CONFIGURACION_ANTICIPADA_INICIAL, ConfiguracionAnticipada } from '../utils/promocionAnticipada';

/** Criterios y pasos de la promoción anticipada de cada colegio (M19, fase 6). Una por instalación; nace con los valores de partida. */
export interface IConfiguracionPromocionAnticipada extends ConfiguracionAnticipada {
  actualizado_por: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ConfiguracionPromocionAnticipadaDocument = HydratedDocument<IConfiguracionPromocionAnticipada>;
type ConfiguracionPromocionAnticipadaModel = Model<IConfiguracionPromocionAnticipada>;

const D = CONFIGURACION_ANTICIPADA_INICIAL;

const criterio = (porDefecto: ConfiguracionAnticipada['rendimiento_excepcional']) => ({
  type: new Schema(
    {
      activo: { type: Boolean, default: porDefecto.activo },
      promedio_minimo: { type: Number, min: 0.01, default: porDefecto.promedio_minimo },
      nota_minima_asignatura: { type: Number, min: 0.01, default: porDefecto.nota_minima_asignatura },
    },
    { _id: false }
  ),
  default: () => ({}),
});

const configuracionSchema = new Schema<IConfiguracionPromocionAnticipada, ConfiguracionPromocionAnticipadaModel>(
  {
    activa: { type: Boolean, default: D.activa },
    periodo_evaluacion: { type: Number, min: 1, max: 12, default: D.periodo_evaluacion },
    dias_ventana_tras_cierre: { type: Number, min: 0, max: 365, default: D.dias_ventana_tras_cierre },
    rendimiento_excepcional: criterio(D.rendimiento_excepcional),
    reiniciantes: criterio(D.reiniciantes),
    exige: {
      type: new Schema(
        {
          concepto_comision: { type: Boolean, default: D.exige.concepto_comision },
          consentimiento_familia: { type: Boolean, default: D.exige.consentimiento_familia },
          decision_consejo_directivo: { type: Boolean, default: D.exige.decision_consejo_directivo },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
    tratamiento_notas: { type: String, enum: TRATAMIENTOS_NOTAS, default: D.tratamiento_notas },
    actualizado_por: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

export const ConfiguracionPromocionAnticipada = model<IConfiguracionPromocionAnticipada, ConfiguracionPromocionAnticipadaModel>('ConfiguracionPromocionAnticipada', configuracionSchema);
export default ConfiguracionPromocionAnticipada;
