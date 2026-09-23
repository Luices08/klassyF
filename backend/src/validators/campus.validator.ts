import Joi from 'joi';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const listCampuses: ValidationSchema = {
  query: Joi.object({
    institucion_id: objectId,
  }),
};

export const crearSede: ValidationSchema = {
  body: Joi.object({
    institucion_id: objectId.required(),
    nombre: Joi.string().required(),
    codigo_dane_sede: Joi.string()
      .pattern(/^\d{12}$/)
      .required(),
    direccion: Joi.string().required(),
  }),
};
