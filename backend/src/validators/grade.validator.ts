import Joi from 'joi';
import { ESTADOS_USUARIO } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const listGrades: ValidationSchema = {
  query: Joi.object({
    estado: Joi.string().valid(...ESTADOS_USUARIO),
  }),
};

export const actualizarEstado: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    estado: Joi.string()
      .valid(...ESTADOS_USUARIO)
      .required(),
  }),
};
