import Joi from 'joi';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const createSubject: ValidationSchema = {
  body: Joi.object({
    area_id: objectId.required(),
    nombre: Joi.string().required(),
    intensidad_horaria_semanal: Joi.number().integer().min(1).required(),
  }),
};

export const listSubjects: ValidationSchema = {
  query: Joi.object({
    area_id: objectId,
  }),
};
