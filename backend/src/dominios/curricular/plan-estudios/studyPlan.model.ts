import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { METODOS_CALCULO_EVALUACION, MetodoCalculoEvaluacion } from '../../../constants/enums';
import AcademicYear from '../../institucional/calendario/academicYear.model';

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

const idsUnicos = (ids: unknown[]): boolean => new Set(ids.map(String)).size === ids.length;

// Los errores de negocio de estos hooks deben responder 400, no el 500 por
// defecto del middleware de errores (ver academicYear.model.ts, mismo patron).
function errorDeValidacion(mensaje: string): Error & { statusCode: number } {
  const err = new Error(mensaje) as Error & { statusCode: number };
  err.statusCode = 400;
  return err;
}

// Reglas de integridad propias del documento (no requieren consultar otras
// colecciones, por eso viven aqui y no en el servicio):
// - Sin duplicados: una asignatura/area/grupo no puede aparecer dos veces
//   dentro del mismo grado o de la misma personalizacion.
// - "Posdata: NO se debe duplicar asignaturas... solo se llaman del catalogo":
//   evaluaciones_area solo puede ponderar asignaturas que ya esten en la
//   Configuracion General del grado (this.asignaturas).
// - Distribucion por Grupos: intensidades_personalizadas solo puede editar
//   asignaturas que YA vienen del grado (si no esta, es "agregada", no
//   "personalizada"); asignaturas_agregadas, al contrario, no puede repetir
//   una asignatura que el grado ya trae (para eso existe intensidades_personalizadas).
gradoPlanSchema.pre('validate', function validarIntegridadGrado(this: IGradoPlan, next) {
  const subjectIds = this.asignaturas.map((a) => a.subject_id);
  if (!idsUnicos(subjectIds)) {
    return next(errorDeValidacion('No se puede repetir una asignatura en la Configuracion General de un mismo grado.'));
  }
  const subjectIdsDelGrado = new Set(subjectIds.map(String));

  const areaIds = this.evaluaciones_area.map((e) => e.area_id);
  if (!idsUnicos(areaIds)) {
    return next(errorDeValidacion('No se puede repetir un area en la Configuracion de Evaluacion de un mismo grado.'));
  }
  for (const evaluacion of this.evaluaciones_area) {
    const asignaturaFueraDelGrado = evaluacion.asignaturas.find(
      (a) => !subjectIdsDelGrado.has(String(a.subject_id))
    );
    if (asignaturaFueraDelGrado) {
      return next(
        errorDeValidacion(
          'La Configuracion de Evaluacion solo puede ponderar asignaturas que ya esten en la Configuracion General del grado.'
        )
      );
    }
  }

  const groupIds = this.personalizaciones_grupo.map((p) => p.group_id);
  if (!idsUnicos(groupIds)) {
    return next(errorDeValidacion('No se puede repetir un grupo en la Distribucion por Grupos de un mismo grado.'));
  }

  for (const personalizacion of this.personalizaciones_grupo) {
    const idsPersonalizados = personalizacion.intensidades_personalizadas.map((i) => i.subject_id);
    if (!idsUnicos(idsPersonalizados)) {
      return next(errorDeValidacion('No se puede repetir una asignatura en las intensidades personalizadas de un grupo.'));
    }
    const noPerteneceAlGrado = idsPersonalizados.find((id) => !subjectIdsDelGrado.has(String(id)));
    if (noPerteneceAlGrado) {
      return next(
        errorDeValidacion(
          'Solo se puede personalizar la intensidad horaria de una asignatura que ya este en la Configuracion General del grado.'
        )
      );
    }

    const idsAgregados = personalizacion.asignaturas_agregadas.map((a) => a.subject_id);
    if (!idsUnicos(idsAgregados)) {
      return next(errorDeValidacion('No se puede agregar dos veces la misma asignatura especifica a un grupo.'));
    }
    const yaEstaEnElGrado = idsAgregados.find((id) => subjectIdsDelGrado.has(String(id)));
    if (yaEstaEnElGrado) {
      return next(
        errorDeValidacion(
          'Una asignatura especifica agregada a un grupo no puede ser una que el grado ya tenga en su Configuracion General (usar intensidades_personalizadas para ajustarla).'
        )
      );
    }

    const idsEvaluacionPersonalizada = personalizacion.evaluaciones_area_personalizadas.map((e) => e.area_id);
    if (!idsUnicos(idsEvaluacionPersonalizada)) {
      return next(errorDeValidacion('No se puede repetir un area en la evaluacion personalizada de un mismo grupo.'));
    }
  }

  next();
});

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

// institucion_id se guarda de forma redundante (mismo patron que Area), pero
// nunca puede desincronizarse del institucion_id real del año lectivo al que
// pertenece: mismo enfoque que group.model.ts valida jornada_id contra la
// sede_id de su JornadaOperativa.
studyPlanSchema.pre('validate', async function validarInstitucionDelAnioLectivo(this: StudyPlanDocument, next) {
  if (!this.institucion_id || !this.academic_year_id) return next();
  if (!this.isModified('institucion_id') && !this.isModified('academic_year_id')) return next();

  const academicYear = await AcademicYear.findById(this.academic_year_id);
  if (!academicYear) {
    return next(errorDeValidacion('academic_year_id no corresponde a un año lectivo existente.'));
  }
  if (String(academicYear.institucion_id) !== String(this.institucion_id)) {
    return next(errorDeValidacion('institucion_id no coincide con la institucion del año lectivo seleccionado.'));
  }
  next();
});

studyPlanSchema.pre('validate', function validarGradosUnicos(this: IStudyPlan, next) {
  const gradeIds = this.grades.map((g) => g.grade_id);
  if (!idsUnicos(gradeIds)) {
    return next(errorDeValidacion('No se puede repetir un grado dentro del mismo plan de estudios.'));
  }
  next();
});

export const StudyPlan = model<IStudyPlan, StudyPlanModel>('StudyPlan', studyPlanSchema);
export default StudyPlan;
