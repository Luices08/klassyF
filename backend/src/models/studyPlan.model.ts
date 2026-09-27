import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';

/**
 * m06_study_plans: el "contenedor" del plan de estudios de una institucion
 * para un año lectivo. No tiene configuracion academica propia — esa vive en
 * sus versiones (PlanVersion, ver planVersion.model.ts). Existe como
 * documento separado porque el año lectivo por si solo es un filtro, no una
 * vigencia: "Un Plan de Estudios corresponde a un año lectivo y se administra
 * mediante versiones de vigencia" (Analisis_M06_Klassy).
 */
export interface IStudyPlan {
  institucion_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type StudyPlanDocument = HydratedDocument<IStudyPlan>;
type StudyPlanModel = Model<IStudyPlan>;

const studyPlanSchema = new Schema<IStudyPlan, StudyPlanModel>(
  {
    institucion_id: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
  },
  { timestamps: true }
);

// Un unico plan de estudios por institucion y año lectivo.
studyPlanSchema.index({ institucion_id: 1, academic_year_id: 1 }, { unique: true });

export const StudyPlan = model<IStudyPlan, StudyPlanModel>('StudyPlan', studyPlanSchema);
export default StudyPlan;
