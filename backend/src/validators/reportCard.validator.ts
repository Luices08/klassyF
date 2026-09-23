import Joi from 'joi';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const getReportCard: ValidationSchema = {
  query: Joi.object({
    student_id: objectId.required(),
    academic_year_id: objectId.required(),
    periodo: Joi.number().integer().min(1).max(4).required(),
  }),
};
