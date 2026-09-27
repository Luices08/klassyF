import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { METODOS_CALCULO_EVALUACION, MetodoCalculoEvaluacion } from '../constants/enums';

/**
 * m06_study_plans: el plan de estudios de una institucion para un año
 * lectivo especifico. El año lectivo ES el contexto temporal del plan — no
 * hay versionamiento de vigencias dentro de un mismo año (esa capa se
 * simplifico deliberadamente mientras se terminan de definir las reglas de
 * modificacion de un plan ya en curso; ver Analisis_M06_Klassy).
 *
 * Toda la configuracion (Configuracion General, Configuracion de Evaluacion
 * y Distribucion por Grupos) se embebe dentro de `grades[]` porque siempre
 * se lee/escribe como una unidad (la configuracion completa de un grado para
 * ese año lectivo) y su volumen es acotado (decenas de grados, cientos de
 * grupos como maximo por institucion) — no amerita explotarlo en colecciones
 * adicionales al estilo relacional.
 *
 * `m06_areas` y `m06_subjects` SI quedan como colecciones propias (Area,
 * Subject) porque son catalogo maestro reusado por otros modulos (horarios,
 * calificaciones, boletines) via su _id — la regla de oro de datos
 * centralizados de CLAUDE.md.
 */

// --- Configuracion General: asignaturas e intensidad horaria de un grado ---
export interface IAsignaturaGrado {
  subject_id: Types.ObjectId;
  intensidad_horaria_semanal: number;
}

// --- Configuracion de Evaluacion: ponderacion de asignaturas por area ---
export interface IPonderacionAsignatura {
  subject_id: Types.ObjectId;
  porcentaje: number;
}

export interface IEvaluacionArea {
  area_id: Types.ObjectId;
  metodo_calculo: MetodoCalculoEvaluacion;
  // Solo aplica (y se valida que sume 100%) cuando metodo_calculo es PONDERADO
  // (RN-EVAL-01/04): con ARITMETICO las asignaturas pesan igual y este array
  // no es necesario para el calculo, pero se deja para listar la composicion.
  asignaturas: IPonderacionAsignatura[];
}

// --- Distribucion por Grupos: personalizaciones de un grupo sobre la base del grado ---
export interface IAsignaturaPersonalizadaGrupo {
  subject_id: Types.ObjectId;
  intensidad_horaria_semanal: number;
  observacion: string;
}

export interface IPersonalizacionGrupo {
  group_id: Types.ObjectId;
  // Overrides de intensidad horaria sobre asignaturas que YA vienen de la
  // Configuracion General del grado (mismo subject_id que en grades.asignaturas).
  intensidades_personalizadas: IAsignaturaPersonalizadaGrupo[];
  // Asignaturas que el grupo ve y su grado (Configuracion General) no incluye.
  asignaturas_agregadas: IAsignaturaPersonalizadaGrupo[];
  // RN-EVAL-02: solo se llena cuando la personalizacion de este grupo cambia
  // la composicion de asignaturas de un area (agrega/excluye una asignatura
  // de esa area) — en ese caso el grupo exige su propia ponderacion.
  evaluaciones_area_personalizadas: IEvaluacionArea[];
}

export interface IGradoPlan {
  grade_id: Types.ObjectId;
  asignaturas: IAsignaturaGrado[];
  evaluaciones_area: IEvaluacionArea[];
  personalizaciones_grupo: IPersonalizacionGrupo[];
}

export interface IStudyPlan {
  institucion_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  grades: IGradoPlan[];
  createdAt: Date;
  updatedAt: Date;
}

export type StudyPlanDocument = HydratedDocument<IStudyPlan>;
type StudyPlanModel = Model<IStudyPlan>;

const ponderacionAsignaturaSchema = new Schema<IPonderacionAsignatura>(
  {
    subject_id: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    porcentaje: { type: Number, required: true, min: 1, max: 100 },
  },
  { _id: false }
);

const evaluacionAreaSchema = new Schema<IEvaluacionArea>(
  {
    area_id: { type: Schema.Types.ObjectId, ref: 'Area', required: true },
    metodo_calculo: { type: String, enum: METODOS_CALCULO_EVALUACION, required: true },
    asignaturas: { type: [ponderacionAsignaturaSchema], default: [] },
  },
  { _id: false }
);

// RN — Ponderacion de asignaturas: si el metodo es PONDERADO, la suma de
// porcentajes de las asignaturas del area debe ser exactamente 100.
evaluacionAreaSchema.pre('validate', function validarPonderacion(this: IEvaluacionArea, next) {
  if (this.metodo_calculo !== 'PONDERADO') return next();

  const total = this.asignaturas.reduce((suma, a) => suma + (a.porcentaje || 0), 0);
  const totalRedondeado = Math.round(total * 100) / 100;
  if (totalRedondeado !== 100) {
    return next(
      new Error(
        `La suma de ponderaciones del area debe ser 100% con metodo PONDERADO. Suma actual: ${totalRedondeado}.`
      )
    );
  }
  next();
});

const asignaturaGradoSchema = new Schema<IAsignaturaGrado>(
  {
    subject_id: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    intensidad_horaria_semanal: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const asignaturaPersonalizadaGrupoSchema = new Schema<IAsignaturaPersonalizadaGrupo>(
  {
    subject_id: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    intensidad_horaria_semanal: { type: Number, required: true, min: 1 },
    observacion: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const personalizacionGrupoSchema = new Schema<IPersonalizacionGrupo>(
  {
    group_id: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    intensidades_personalizadas: { type: [asignaturaPersonalizadaGrupoSchema], default: [] },
    asignaturas_agregadas: { type: [asignaturaPersonalizadaGrupoSchema], default: [] },
    evaluaciones_area_personalizadas: { type: [evaluacionAreaSchema], default: [] },
  },
  { _id: false }
);

const gradoPlanSchema = new Schema<IGradoPlan>(
  {
    grade_id: { type: Schema.Types.ObjectId, ref: 'Grade', required: true },
    asignaturas: { type: [asignaturaGradoSchema], default: [] },
    evaluaciones_area: { type: [evaluacionAreaSchema], default: [] },
    personalizaciones_grupo: { type: [personalizacionGrupoSchema], default: [] },
  },
  { _id: false }
);

const studyPlanSchema = new Schema<IStudyPlan, StudyPlanModel>(
  {
    institucion_id: { type: Schema.Types.ObjectId, ref: 'Institution', required: true },
    academic_year_id: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    grades: { type: [gradoPlanSchema], default: [] },
  },
  { timestamps: true }
);

// Un unico plan de estudios por institucion y año lectivo.
studyPlanSchema.index({ institucion_id: 1, academic_year_id: 1 }, { unique: true });

export const StudyPlan = model<IStudyPlan, StudyPlanModel>('StudyPlan', studyPlanSchema);
export default StudyPlan;
