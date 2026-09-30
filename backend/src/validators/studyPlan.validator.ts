import Joi from 'joi';
import { METODOS_CALCULO_EVALUACION } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const asignaturaGradoSchema = Joi.object({
  subject_id: objectId.required(),
  intensidad_horaria_semanal: Joi.number().integer().min(1).required(),
});

export const configurarAsignaturasGrado: ValidationSchema = {
  body: Joi.object({
    institucion_id: objectId.required(),
    academic_year_id: objectId.required(),
    grade_id: objectId.required(),
    asignaturas: Joi.array().items(asignaturaGradoSchema).default([]),
  }),
};

export const configurarAsignaturasMultiplesGrados: ValidationSchema = {
  body: Joi.object({
    institucion_id: objectId.required(),
    academic_year_id: objectId.required(),
    grados: Joi.array()
      .items(
        Joi.object({
          grade_id: objectId.required(),
          asignaturas: Joi.array().items(asignaturaGradoSchema).default([]),
        })
      )
      .min(1)
      .required(),
  }),
};

const ponderacionAsignaturaSchema = Joi.object({
  subject_id: objectId.required(),
  porcentaje: Joi.number().min(1).max(100).required(),
});

export const configurarEvaluacionArea: ValidationSchema = {
  body: Joi.object({
    institucion_id: objectId.required(),
    academic_year_id: objectId.required(),
    grade_id: objectId.required(),
    area_id: objectId.required(),
    metodo_calculo: Joi.string()
      .valid(...METODOS_CALCULO_EVALUACION)
      .required(),
    asignaturas: Joi.when('metodo_calculo', {
      is: 'PONDERADO',
      // Joi usa `then` como clave de configuración, no como un thenable.
      // oxlint-disable-next-line unicorn/no-thenable
      then: Joi.array().items(ponderacionAsignaturaSchema).min(1).required(),
      otherwise: Joi.array().items(ponderacionAsignaturaSchema).default([]),
    }),
  }),
};

const asignaturaPersonalizadaSchema = Joi.object({
  subject_id: objectId.required(),
  intensidad_horaria_semanal: Joi.number().integer().min(1).required(),
  observacion: Joi.string().required(),
});

export const configurarDistribucionGrupo: ValidationSchema = {
  body: Joi.object({
    institucion_id: objectId.required(),
    academic_year_id: objectId.required(),
    grade_id: objectId.required(),
    group_id: objectId.required(),
    intensidades_personalizadas: Joi.array().items(asignaturaPersonalizadaSchema).default([]),
    asignaturas_agregadas: Joi.array().items(asignaturaPersonalizadaSchema).default([]),
  }),
};

export const crearPlanDesdeAnioAnterior: ValidationSchema = {
  body: Joi.object({
    institucion_id: objectId.required(),
    academic_year_id: objectId.required(),
    academic_year_id_anterior: objectId.required(),
  }),
};

export const obtenerStudyPlan: ValidationSchema = {
  query: Joi.object({
    institucion_id: objectId.required(),
    academic_year_id: objectId.required(),
  }),
};
