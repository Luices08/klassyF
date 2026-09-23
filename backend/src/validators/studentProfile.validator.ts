import Joi from 'joi';
import { GRUPOS_SANGUINEOS } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const upsertProfile: ValidationSchema = {
  params: Joi.object({
    userId: objectId.required(),
  }),
  body: Joi.object({
    acudiente_id: objectId.allow(null),
    fecha_nacimiento: Joi.date().required(),
    eps: Joi.string().allow('', null),
    rh: Joi.string().valid(...GRUPOS_SANGUINEOS),
    estrato: Joi.number().integer().min(1).max(6),
    direccion_residencia: Joi.string().allow('', null),
  }),
};

export const getProfile: ValidationSchema = {
  params: Joi.object({
    userId: objectId.required(),
  }),
};
