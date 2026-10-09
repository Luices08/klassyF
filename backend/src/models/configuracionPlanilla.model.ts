import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { MAX_FIRMAS_PLANILLA, PLANTILLA_PLANILLA_INICIAL } from '../constants/notas';

export interface IFirmaPlanilla {
  cargo: string;
  /** Nombre fijo de quien firma (rector, coordinadora...). Vacío = solo la línea para firmar a mano. */
  nombre: string;
  /** La firma es la del docente de la clase: su nombre sale de la asignación, no se escribe aquí. */
  usa_docente: boolean;
}

export interface IColumnasPlanilla {
  /** Número de documento bajo el nombre del estudiante. */
  documento: boolean;
  /** Promedio de cada componente que se alimenta de actividades. */
  promedios_componente: boolean;
  /** Peso de cada actividad bajo su título. */
  pesos: boolean;
  desempeno: boolean;
  estado: boolean;
}

/**
 * Plantilla de la planilla de notas del colegio (una por instalación, M21 en su versión mínima): cómo se rotula y qué
 * columnas calculadas lleva la planilla que ve el docente, el Excel y el PDF. NO cambia el cálculo ni las notas: solo la
 * presentación. Las columnas de nota (actividades y notas directas) y la nota de la asignatura no se pueden ocultar.
 */
export interface IConfiguracionPlanilla {
  institucion_id: Types.ObjectId;
  titulo: string;
  subtitulo: string;
  pie: string;
  mostrar_logo: boolean;
  columnas: IColumnasPlanilla;
  firmas: IFirmaPlanilla[];
  createdAt: Date;
  updatedAt: Date;
}

export type ConfiguracionPlanillaDocument = HydratedDocument<IConfiguracionPlanilla>;
type ConfiguracionPlanillaModel = Model<IConfiguracionPlanilla>;

const firmaSchema = new Schema<IFirmaPlanilla>(
  {
    cargo: { type: String, required: true, trim: true, maxlength: 60 },
    nombre: { type: String, trim: true, maxlength: 80, default: '' },
    usa_docente: { type: Boolean, default: false },
  },
  { _id: false }
);

const configuracionPlanillaSchema = new Schema<IConfiguracionPlanilla, ConfiguracionPlanillaModel>(
  {
    institucion_id: { type: Schema.Types.ObjectId, ref: 'Institution', required: true, unique: true },
    titulo: { type: String, trim: true, maxlength: 120, default: PLANTILLA_PLANILLA_INICIAL.titulo },
    subtitulo: { type: String, trim: true, maxlength: 160, default: PLANTILLA_PLANILLA_INICIAL.subtitulo },
    pie: { type: String, trim: true, maxlength: 300, default: PLANTILLA_PLANILLA_INICIAL.pie },
    mostrar_logo: { type: Boolean, default: PLANTILLA_PLANILLA_INICIAL.mostrar_logo },
    columnas: {
      type: new Schema<IColumnasPlanilla>(
        {
          documento: { type: Boolean, default: true },
          promedios_componente: { type: Boolean, default: true },
          pesos: { type: Boolean, default: true },
          desempeno: { type: Boolean, default: true },
          estado: { type: Boolean, default: true },
        },
        { _id: false }
      ),
      default: () => ({ ...PLANTILLA_PLANILLA_INICIAL.columnas }),
    },
    firmas: {
      type: [firmaSchema],
      default: () => PLANTILLA_PLANILLA_INICIAL.firmas.map((f) => ({ ...f })),
      validate: {
        validator: (firmas: IFirmaPlanilla[]) => firmas.length <= MAX_FIRMAS_PLANILLA,
        message: `La planilla admite hasta ${MAX_FIRMAS_PLANILLA} firmas.`,
      },
    },
  },
  { timestamps: true }
);

export const ConfiguracionPlanilla = model<IConfiguracionPlanilla, ConfiguracionPlanillaModel>('ConfiguracionPlanilla', configuracionPlanillaSchema);
export default ConfiguracionPlanilla;
