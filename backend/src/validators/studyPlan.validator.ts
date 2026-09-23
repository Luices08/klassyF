import Joi from 'joi';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const asignacionSchema = Joi.object({
  subject_id: objectId.required(),
  porcentaje_en_area: Joi.number().min(1).max(100).required(),
});

export const setStudyPlan: ValidationSchema = {
  body: Joi.object({
    grade_id: objectId.required(),
    academic_year_id: objectId.required(),
    asignaciones: Joi.array().items(asignacionSchema).min(1).required(),
  }),
};
