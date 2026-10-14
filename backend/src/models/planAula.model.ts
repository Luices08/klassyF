import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_PLAN, EstadoPlan } from '../constants/planeacion';
import { IRevisionPlan, IVersionPlan, revisionPlanSchema, versionPlanSchema } from './planeacionSubesquemas';

/** La primera radicación del plan: de ahí sale la etiqueta «entregado fuera de plazo». Las correcciones posteriores no la cambian. */
export interface IRadicacionPlanAula {
  fecha: Date;
  /** El límite que regía en ese momento (cambiar la ventana después no reescribe la historia); null si el periodo no tenía ventana. */
  fecha_limite: Date | null;
  fuera_de_plazo: boolean;
}

/**
 * Plan de aula de un docente para un periodo. La llave es (año, periodo, asignatura, grado, docente) y NO cuelga de la asignación
 * docente (M08): esa se elimina cuando el docente se va, y el plan aprobado debe quedar archivado en el histórico del periodo.
 * Es por grado, no por grupo: quien dicta la misma asignatura en 6A y 6B radica un solo plan.
 */
export interface IPlanAula {
  academic_year_id: Types.ObjectId;
  periodo_numero: number;
  subject_id: Types.ObjectId;
  grade_id: Types.ObjectId;
  docente_id: Types.ObjectId;
  estado: EstadoPlan;
  radicacion: IRadicacionPlanAula;
  versiones: Types.DocumentArray<IVersionPlan>;
  revisiones: Types.DocumentArray<IRevisionPlan>;
  createdAt: Date;
  updatedAt: Date;
}

export type PlanAulaDocument = HydratedDocument<IPlanAula>;
type PlanAulaModel = Model<IPlanAula>;

const planAulaSchema = new Schema<IPlanAula, PlanAulaModel>(
  {
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    periodo_numero: { type: Number, required: true, min: 1, max: 4 },
    subject_id: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    grade_id: { type: Schema.Types.ObjectId, ref: 'Grade', required: true },
    docente_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    estado: { type: String, enum: ESTADOS_PLAN, default: 'EN_REVISION' },
    radicacion: {
      type: new Schema<IRadicacionPlanAula>(
        {
          fecha: { type: Date, required: true },
          fecha_limite: { type: Date, default: null },
          fuera_de_plazo: { type: Boolean, default: false },
        },
        { _id: false }
      ),
      required: true,
    },
    versiones: { type: [versionPlanSchema], default: [] },
    revisiones: { type: [revisionPlanSchema], default: [] },
  },
  { timestamps: true }
);

planAulaSchema.index({ academic_year_id: 1, periodo_numero: 1, subject_id: 1, grade_id: 1, docente_id: 1 }, { unique: true });
planAulaSchema.index({ academic_year_id: 1, periodo_numero: 1, estado: 1 });
planAulaSchema.index({ docente_id: 1, academic_year_id: 1 });
// Para buscar qué planes aprobados dejaron otros docentes en la misma asignatura y grado (adopción).
planAulaSchema.index({ academic_year_id: 1, subject_id: 1, grade_id: 1, periodo_numero: 1 });

export const PlanAula = model<IPlanAula, PlanAulaModel>('PlanAula', planAulaSchema);
export default PlanAula;
