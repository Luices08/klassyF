import Joi from 'joi';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const createTeacherAssignment: ValidationSchema = {
  body: Joi.object({
    docente_id: objectId.required(),
    group_id: objectId.required(),
    subject_id: objectId.required(),
    academic_year_id: objectId.required(),
    horas_semanales: Joi.number().integer().min(1).required(),
  }),
};
