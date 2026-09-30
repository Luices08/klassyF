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
  competencias: string;
  contenidos_tematicos: string[];
  actividades_propuestas: string;
  criterios_evaluacion: string;
  estado: EstadoDesarrolloCurricular;
}

export interface ICurricularDevelopment {
  teacher_assignment_id: Types.ObjectId;
  periodo_numero: number;
  dba_seleccionados: Types.ObjectId[];
  competencias: string;
  contenidos_tematicos: string[];
  ejes_tematicos: string[];
  actividades_propuestas: string;
  metodologia_y_recursos: string;
  criterios_evaluacion: string;
  semanas_estimadas: number;
  estado: EstadoDesarrolloCurricular;
  version: number;
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
    competencias: { type: String, default: '' },
    contenidos_tematicos: { type: [String], default: [] },
    actividades_propuestas: { type: String, default: '' },
    criterios_evaluacion: { type: String, default: '' },
    estado: { type: String, enum: ESTADOS_DESARROLLO_CURRICULAR, required: true },
  },
  { _id: true }
);

const curricularDevelopmentSchema = new Schema<ICurricularDevelopment, CurricularDevelopmentModel>(
  {
    teacher_assignment_id: { type: Schema.Types.ObjectId, ref: 'TeacherAssignment', required: true },
    periodo_numero: { type: Number, required: true, min: 1, max: 4 },
    dba_seleccionados: { type: [Schema.Types.ObjectId], ref: 'ReferenteCurricular', default: [] },
    competencias: { type: String, required: true, trim: true },
    contenidos_tematicos: { type: [String], default: [] },
    ejes_tematicos: { type: [String], default: [] },
    actividades_propuestas: { type: String, trim: true, default: '' },
    metodologia_y_recursos: { type: String, required: true, trim: true },
    criterios_evaluacion: { type: String, required: true, trim: true },
    semanas_estimadas: { type: Number, default: 10, min: 1, max: 20 },
    estado: { type: String, enum: ESTADOS_DESARROLLO_CURRICULAR, default: 'BORRADOR' },
    version: { type: Number, default: 1, min: 1 },
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
