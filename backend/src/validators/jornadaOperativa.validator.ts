import Joi from 'joi';
import { JORNADAS } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const horaSchema = Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/, 'hora HH:MM');

export const crearJornada: ValidationSchema = {
  body: Joi.object({
    sede_id: objectId.required(),
    nombre: Joi.string()
      .valid(...JORNADAS)
      .required(),
    hora_inicio: horaSchema.required(),
    hora_fin: horaSchema.required(),
  }),
};

export const listarJornadas: ValidationSchema = {
  query: Joi.object({
    sede_id: objectId,
  }),
};
