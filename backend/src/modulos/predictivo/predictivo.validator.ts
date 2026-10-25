import Joi from 'joi';
import { ValidationSchema } from '../../middlewares/validate.middleware';
import { objectId } from '../../validators/common.validator';

export const porId: ValidationSchema = { params: Joi.object({ id: objectId.required() }) };

export const busqueda: ValidationSchema = {
  query: Joi.object({ q: Joi.string().trim().max(80).allow('').default(''), academic_year_id: objectId }),
};

export const analisisDeEstudiante: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  query: Joi.object({ academic_year_id: objectId }),
};
