import Joi from 'joi';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const dbaItemSchema = Joi.object({
  grade_id: objectId.required(),
  area_id: objectId.required(),
  numero_dba: Joi.number().integer().min(1).required(),
  enunciado: Joi.string().required(),
  evidencias_aprendizaje: Joi.array().items(Joi.string()).default([]),
  eje_tematico: Joi.string().required(),
});

// Acepta un solo DBA o un array (carga/seed masiva) en el mismo endpoint.
export const createDbaEntries: ValidationSchema = {
  body: Joi.alternatives().try(dbaItemSchema, Joi.array().items(dbaItemSchema).min(1)),
};

export const listDbaEntries: ValidationSchema = {
  query: Joi.object({
    grade_id: objectId,
    area_id: objectId,
  }),
};
