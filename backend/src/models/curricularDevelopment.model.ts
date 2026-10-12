import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_DESARROLLO_CURRICULAR, EstadoDesarrolloCurricular } from '../constants/enums';

export interface IRevisionHistorial {
  observacion: string;
  coordinador_id: Types.ObjectId;
  fecha: Date;
  estado_resultante: EstadoDesarrolloCurricular;
}

export interface IVersionSnapshot {
  version: number;
  fecha: Date;
  modificado_por: Types.ObjectId;
  dba_seleccionados: Types.ObjectId[];
  evidencias_seleccionadas?: string[];
  competencias: string;
  contenidos_tematicos: string[];
  ejes_tematicos: string[];
  actividades_propuestas: string;
  metodologia_y_recursos: string;
  criterios_evaluacion: string;
  semanas_estimadas: number;
  estado: EstadoDesarrolloCurricular;
  // Campos de secuencia didactica (Basica y Media)
  fase_inicio?: string;
  fase_desarrollo?: string;
  fase_cierre?: string;
  // Campos para Preescolar / Proyectos Ludico-Pedagogicos
  es_preescolar?: boolean;
  nombre_proyecto?: string;
  dimensiones_articuladas?: string[];
  actividades_rectoras?: string[];
  experiencias_significativas?: string;
}

export interface ICurricularDevelopment {
  teacher_assignment_id: Types.ObjectId;
  periodo_numero: number;
  dba_seleccionados: Types.ObjectId[];
  evidencias_seleccionadas: string[];
  competencias: string;
  contenidos_tematicos: string[];
  ejes_tematicos: string[];
  actividades_propuestas: string;
  metodologia_y_recursos: string;
  criterios_evaluacion: string;
  semanas_estimadas: number;
  estado: EstadoDesarrolloCurricular;
  version: number;
  // Campos de secuencia didactica (Basica y Media)
  fase_inicio?: string;
  fase_desarrollo?: string;
  fase_cierre?: string;
  // Campos para Preescolar / Proyectos Ludico-Pedagogicos
  es_preescolar: boolean;
  nombre_proyecto?: string;
  dimensiones_articuladas: string[];
  actividades_rectoras: string[];
  experiencias_significativas?: string;
  historial_revisiones: Types.DocumentArray<IRevisionHistorial>;
  historial_versiones: Types.DocumentArray<IVersionSnapshot>;
  createdAt: Date;
  updatedAt: Date;
}

export type CurricularDevelopmentDocument = HydratedDocument<ICurricularDevelopment>;
type CurricularDevelopmentModel = Model<ICurricularDevelopment>;

const revisionHistorialSchema = new Schema<IRevisionHistorial>(
  {
    observacion: { type: String, default: '' },
    coordinador_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fecha: { type: Date, required: true, default: Date.now },
    estado_resultante: { type: String, enum: ESTADOS_DESARROLLO_CURRICULAR, required: true },
  },
  { _id: true }
);

const versionSnapshotSchema = new Schema<IVersionSnapshot>(
  {
    version: { type: Number, required: true },
    fecha: { type: Date, required: true, default: Date.now },
    modificado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    dba_seleccionados: { type: [Schema.Types.ObjectId], ref: 'ReferenteCurricular', default: [] },
    evidencias_seleccionadas: { type: [String], default: [] },
    competencias: { type: String, default: '' },
    contenidos_tematicos: { type: [String], default: [] },
    ejes_tematicos: { type: [String], default: [] },
    actividades_propuestas: { type: String, default: '' },
    metodologia_y_recursos: { type: String, default: '' },
    criterios_evaluacion: { type: String, default: '' },
    semanas_estimadas: { type: Number, default: 10 },
    estado: { type: String, enum: ESTADOS_DESARROLLO_CURRICULAR, required: true },
    fase_inicio: { type: String, default: '' },
    fase_desarrollo: { type: String, default: '' },
    fase_cierre: { type: String, default: '' },
    es_preescolar: { type: Boolean, default: false },
    nombre_proyecto: { type: String, default: '' },
    dimensiones_articuladas: { type: [String], default: [] },
    actividades_rectoras: { type: [String], default: [] },
    experiencias_significativas: { type: String, default: '' },
  },
  { _id: true }
);

const curricularDevelopmentSchema = new Schema<ICurricularDevelopment, CurricularDevelopmentModel>(
  {
    teacher_assignment_id: { type: Schema.Types.ObjectId, ref: 'TeacherAssignment', required: true },
    periodo_numero: { type: Number, required: true, min: 1, max: 4 },
    dba_seleccionados: { type: [Schema.Types.ObjectId], ref: 'ReferenteCurricular', default: [] },
    evidencias_seleccionadas: { type: [String], default: [] },
    competencias: { type: String, default: '', trim: true },
    contenidos_tematicos: { type: [String], default: [] },
    ejes_tematicos: { type: [String], default: [] },
    actividades_propuestas: { type: String, trim: true, default: '' },
    metodologia_y_recursos: { type: String, default: '', trim: true },
    criterios_evaluacion: { type: String, default: '', trim: true },
    semanas_estimadas: { type: Number, default: 10, min: 1, max: 20 },
    estado: { type: String, enum: ESTADOS_DESARROLLO_CURRICULAR, default: 'BORRADOR' },
    version: { type: Number, default: 1, min: 1 },
    fase_inicio: { type: String, trim: true, default: '' },
    fase_desarrollo: { type: String, trim: true, default: '' },
    fase_cierre: { type: String, trim: true, default: '' },
    es_preescolar: { type: Boolean, default: false },
    nombre_proyecto: { type: String, trim: true, default: '' },
    dimensiones_articuladas: { type: [String], default: [] },
    actividades_rectoras: { type: [String], default: [] },
    experiencias_significativas: { type: String, trim: true, default: '' },
    historial_revisiones: { type: [revisionHistorialSchema], default: [] },
    historial_versiones: { type: [versionSnapshotSchema], default: [] },
  },
  { timestamps: true }
);

// Un solo desarrollo curricular por asignación académica y periodo
curricularDevelopmentSchema.index({ teacher_assignment_id: 1, periodo_numero: 1 }, { unique: true });
curricularDevelopmentSchema.index({ estado: 1 });

export const CurricularDevelopment = model<ICurricularDevelopment, CurricularDevelopmentModel>(
  'CurricularDevelopment',
  curricularDevelopmentSchema
);
export default CurricularDevelopment;
