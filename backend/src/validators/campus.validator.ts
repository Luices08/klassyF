import Joi from 'joi';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const listCampuses: ValidationSchema = {
  query: Joi.object({
    institucion_id: objectId,
  }),
};
