import Joi from 'joi';
import { JORNADAS } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const crearJornada: ValidationSchema = {
  body: Joi.object({
    sede_id: objectId.required(),
    nombre: Joi.string()
      .valid(...JORNADAS)
      .required(),
  }),
};

export const listarJornadas: ValidationSchema = {
  query: Joi.object({
    sede_id: objectId,
  }),
};
