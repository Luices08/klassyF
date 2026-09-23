import Joi from 'joi';
import { ESTADOS_PERIODO } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const setPeriodLock: ValidationSchema = {
  body: Joi.object({
    academic_year_id: objectId.required(),
    periodo_numero: Joi.number().integer().min(1).max(4).required(),
    group_id: objectId.required(),
    estado: Joi.string()
      .valid(...ESTADOS_PERIODO)
      .required(),
  }),
};
