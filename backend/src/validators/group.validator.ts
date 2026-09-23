import Joi from 'joi';
import { JORNADAS } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const createGroup: ValidationSchema = {
  body: Joi.object({
    sede_id: objectId.required(),
    academic_year_id: objectId.required(),
    grade_id: objectId.required(),
    jornada: Joi.string()
      .valid(...JORNADAS)
      .required(),
    nomenclatura: Joi.string().required(),
    cupo_maximo: Joi.number().integer().min(1).required(),
    director_grupo_id: objectId.allow(null),
  }),
};

export const listGroups: ValidationSchema = {
  query: Joi.object({
    academic_year_id: objectId,
    sede_id: objectId,
    grade_id: objectId,
    jornada: Joi.string().valid(...JORNADAS),
  }),
};
