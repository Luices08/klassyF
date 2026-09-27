import Joi from 'joi';
import { ESTADOS_AREA } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const createArea: ValidationSchema = {
  body: Joi.object({
    institucion_id: objectId.required(),
    nombre: Joi.string().required(),
    descripcion: Joi.string().required(),
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

export const actualizarArea: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    nombre: Joi.string(),
    descripcion: Joi.string(),
    codigo: Joi.string(),
  }).min(1),
};

export const actualizarEstadoArea: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    estado: Joi.string()
      .valid(...ESTADOS_AREA)
      .required(),
  }),
};
