import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_PLAN, EstadoPlan } from '../constants/planeacion';
import { IRevisionPlan, IVersionPlan, revisionPlanSchema, versionPlanSchema } from './planeacionSubesquemas';

/**
 * Plan de área de un año lectivo: un PDF por líder de área (lo que cubre: niveles, jornada y sedes) que carga ese docente y
 * coordinación aprueba para todo el año. Cada versión conserva su PDF; el estado es el del último envío. El plan cuelga del
 * registro del líder y no de la persona (el docente puede cambiar durante el año), por eso quién subió cada versión queda en la
 * versión y no en el plan.
 */
export interface IPlanArea {
  academic_year_id: Types.ObjectId;
  area_id: Types.ObjectId;
  lider_area_id: Types.ObjectId;
  estado: EstadoPlan;
  versiones: Types.DocumentArray<IVersionPlan>;
  revisiones: Types.DocumentArray<IRevisionPlan>;
  createdAt: Date;
  updatedAt: Date;
}

export type PlanAreaDocument = HydratedDocument<IPlanArea>;
type PlanAreaModel = Model<IPlanArea>;

const planAreaSchema = new Schema<IPlanArea, PlanAreaModel>(
  {
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    area_id: { type: Schema.Types.ObjectId, ref: 'Area', required: true },
    lider_area_id: { type: Schema.Types.ObjectId, ref: 'LiderArea', required: true },
    estado: { type: String, enum: ESTADOS_PLAN, default: 'EN_REVISION' },
    versiones: { type: [versionPlanSchema], default: [] },
    revisiones: { type: [revisionPlanSchema], default: [] },
  },
  { timestamps: true }
);

// Un plan de área por líder y año: la carrera de dos cargas simultáneas la resuelve el índice, no el servicio.
planAreaSchema.index({ academic_year_id: 1, lider_area_id: 1 }, { unique: true });
planAreaSchema.index({ academic_year_id: 1, area_id: 1 });
planAreaSchema.index({ academic_year_id: 1, estado: 1 });

export const PlanArea = model<IPlanArea, PlanAreaModel>('PlanArea', planAreaSchema);
export default PlanArea;
