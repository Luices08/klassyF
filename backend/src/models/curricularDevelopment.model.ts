import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_DESARROLLO_CURRICULAR, EstadoDesarrolloCurricular } from '../constants/enums';

export interface IRevisionHistorial {
  observacion: string;
  coordinador_id: Types.ObjectId;
  fecha: Date;
  estado_resultante: EstadoDesarrolloCurricular;
}

export interface ICurricularDevelopment {
  teacher_assignment_id: Types.ObjectId;
  periodo_numero: number;
  dba_seleccionados: Types.ObjectId[];
  competencias: string;
  ejes_tematicos: string[];
  metodologia_y_recursos: string;
  criterios_evaluacion: string;
  estado: EstadoDesarrolloCurricular;
  historial_revisiones: Types.DocumentArray<IRevisionHistorial>;
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

const curricularDevelopmentSchema = new Schema<ICurricularDevelopment, CurricularDevelopmentModel>(
  {
    teacher_assignment_id: { type: Schema.Types.ObjectId, ref: 'TeacherAssignment', required: true },
    periodo_numero: { type: Number, required: true, min: 1, max: 4 },
    dba_seleccionados: { type: [Schema.Types.ObjectId], ref: 'DBABank', default: [] },
    competencias: { type: String, required: true, trim: true },
    ejes_tematicos: { type: [String], default: [] },
    metodologia_y_recursos: { type: String, required: true, trim: true },
    criterios_evaluacion: { type: String, required: true, trim: true },
    estado: { type: String, enum: ESTADOS_DESARROLLO_CURRICULAR, default: 'BORRADOR' },
    historial_revisiones: { type: [revisionHistorialSchema], default: [] },
  },
  { timestamps: true }
);

// Un solo borrador/desarrollo por asignacion academica y periodo.
curricularDevelopmentSchema.index({ teacher_assignment_id: 1, periodo_numero: 1 }, { unique: true });

export const CurricularDevelopment = model<ICurricularDevelopment, CurricularDevelopmentModel>(
  'CurricularDevelopment',
  curricularDevelopmentSchema
);
export default CurricularDevelopment;
