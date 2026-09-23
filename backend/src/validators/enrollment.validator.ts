import Joi from 'joi';
import { ESTADOS_MATRICULA } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const createEnrollment: ValidationSchema = {
  body: Joi.object({
    student_id: objectId.required(),
    group_id: objectId.required(),
    academic_year_id: objectId.required(),
  }),
};

export const updateStatus: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    estado: Joi.string()
      .valid(...ESTADOS_MATRICULA)
      .required(),
  }),
};
