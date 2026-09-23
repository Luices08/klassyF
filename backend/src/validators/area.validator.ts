import Joi from 'joi';
import { ESTADOS_AREA } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const createArea: ValidationSchema = {
  body: Joi.object({
    institucion_id: objectId.required(),
    nombre: Joi.string().required(),
    codigo: Joi.string().required(),
    estado: Joi.string().valid(...ESTADOS_AREA),
  }),
};

export const listAreas: ValidationSchema = {
  query: Joi.object({
    institucion_id: objectId,
    estado: Joi.string().valid(...ESTADOS_AREA),
  }),
};
