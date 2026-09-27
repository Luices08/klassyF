import { HydratedDocument, Model, Schema, Types, model } from 'mongoose';
import { ESTADOS_VERSION_PLAN, EstadoVersionPlan, METODOS_CALCULO_EVALUACION, MetodoCalculoEvaluacion } from '../constants/enums';

/**
 * m06_plan_versions: cada version es la vigencia real del plan de estudios
 * (En preparacion -> Programado -> Vigente -> Cerrado). Todo lo que el
 * usuario configura (Configuracion General, Configuracion de Evaluacion y
 * Distribucion por Grupos) se embebe dentro de `grades[]` de la version
 * porque siempre se lee/escribe como una unidad (la configuracion completa
 * de un grado dentro de esa vigencia) y su volumen es acotado (decenas de
 * grados, cientos de grupos como maximo por institucion) — no amerita
 * explotarlo en colecciones adicionales al estilo relacional.
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

export interface IGradoPlanVersion {
  grade_id: Types.ObjectId;
  asignaturas: IAsignaturaGrado[];
  evaluaciones_area: IEvaluacionArea[];
  personalizaciones_grupo: IPersonalizacionGrupo[];
}

// --- Revision de impacto (se registra al crear una version posterior a la primera) ---
export interface IRevisionImpacto {
  grupos_afectados: number;
  docentes_afectados: number;
  requiere_revision_carga_docente: boolean;
  requiere_modificacion_horarios: boolean;
  calificaciones_historicas_afectadas: number;
  periodos_cerrados_afectados: number;
  // M13 (Boletines) todavia no existe: este conteo queda desacoplado en 0 y
  // NUNCA bloquea la creacion de una version. Cuando M13 exista, su servicio
  // debe poblar este campo — M06 no crea logica ni coleccion de boletines.
  boletines_emitidos_afectados: number;
}

export interface IPlanVersion {
  study_plan_id: Types.ObjectId;
  numero_version: number;
  estado: EstadoVersionPlan;
  vigente_desde: Date;
  vigente_hasta: Date;
  // Obligatorio desde la version 2 en adelante (RN-VER-02); la primera version
  // hereda fechas del año lectivo y no requiere motivo (RN-VER-01).
  motivo_cambio: string | null;
  creado_por: Types.ObjectId;
  revision_impacto: IRevisionImpacto | null;
  grades: IGradoPlanVersion[];
  createdAt: Date;
  updatedAt: Date;
}

export type PlanVersionDocument = HydratedDocument<IPlanVersion>;
type PlanVersionModel = Model<IPlanVersion>;

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

const gradoPlanVersionSchema = new Schema<IGradoPlanVersion>(
  {
    grade_id: { type: Schema.Types.ObjectId, ref: 'Grade', required: true },
    asignaturas: { type: [asignaturaGradoSchema], default: [] },
    evaluaciones_area: { type: [evaluacionAreaSchema], default: [] },
    personalizaciones_grupo: { type: [personalizacionGrupoSchema], default: [] },
  },
  { _id: false }
);

const revisionImpactoSchema = new Schema<IRevisionImpacto>(
  {
    grupos_afectados: { type: Number, required: true, min: 0 },
    docentes_afectados: { type: Number, required: true, min: 0 },
    requiere_revision_carga_docente: { type: Boolean, required: true },
    requiere_modificacion_horarios: { type: Boolean, required: true },
    calificaciones_historicas_afectadas: { type: Number, required: true, min: 0 },
    periodos_cerrados_afectados: { type: Number, required: true, min: 0 },
    boletines_emitidos_afectados: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const planVersionSchema = new Schema<IPlanVersion, PlanVersionModel>(
  {
    study_plan_id: { type: Schema.Types.ObjectId, ref: 'StudyPlan', required: true },
    numero_version: { type: Number, required: true, min: 1 },
    estado: { type: String, enum: ESTADOS_VERSION_PLAN, default: 'EN_PREPARACION' },
    vigente_desde: { type: Date, required: true },
    vigente_hasta: { type: Date, required: true },
    motivo_cambio: { type: String, trim: true, default: null },
    creado_por: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    revision_impacto: { type: revisionImpactoSchema, default: null },
    grades: { type: [gradoPlanVersionSchema], default: [] },
  },
  { timestamps: true }
);

planVersionSchema.index({ study_plan_id: 1, numero_version: 1 }, { unique: true });

// A lo sumo una version "Programada" a la vez por plan (RN-VER: "Ya existe una
// version programada... debe gestionarla o cancelarla antes de crear otra").
planVersionSchema.index(
  { study_plan_id: 1, estado: 1 },
  { unique: true, partialFilterExpression: { estado: 'PROGRAMADO' } }
);

// A lo sumo una version "Vigente" a la vez por plan (el sistema siempre
// trabaja con una unica version en ejecucion).
planVersionSchema.index(
  { study_plan_id: 1, estado: 1 },
  { unique: true, partialFilterExpression: { estado: 'VIGENTE' } }
);

planVersionSchema.pre('validate', function validarVigencia(this: IPlanVersion, next) {
  if (this.vigente_desde && this.vigente_hasta && this.vigente_hasta < this.vigente_desde) {
    return next(new Error('vigente_hasta no puede ser anterior a vigente_desde.'));
  }
  next();
});

export const PlanVersion = model<IPlanVersion, PlanVersionModel>('PlanVersion', planVersionSchema);
export default PlanVersion;
