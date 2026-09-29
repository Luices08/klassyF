import Joi from 'joi';
import { ESTADOS_ESTUDIANTE } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const listarEstudiantes: ValidationSchema = {
  query: Joi.object({
    search: Joi.string().allow(''),
    estado: Joi.string().valid(...ESTADOS_ESTUDIANTE),
    eps: Joi.string().allow(''),
    discapacidad: Joi.boolean(),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
  }),
};

export const obtenerFicha360: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
};
