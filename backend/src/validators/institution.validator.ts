import Joi from 'joi';
import { CALENDARIOS } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const periodoSchema = Joi.object({
  numero: Joi.number().integer().min(1).max(4).required(),
  nombre: Joi.string().required(),
  porcentaje: Joi.number().min(0).max(100).required(),
  fecha_inicio: Joi.date().required(),
  fecha_fin: Joi.date().min(Joi.ref('fecha_inicio')).required(),
});

export const setup: ValidationSchema = {
  body: Joi.object({
    institucion: Joi.object({
      nombre: Joi.string().required(),
      codigo_dane: Joi.string()
        .pattern(/^\d{12}$/)
        .required(),
      nit: Joi.string().required(),
      resolucion_aprobacion: Joi.string().required(),
      administrador_id: objectId,
    }).required(),

    sede_principal: Joi.object({
      nombre: Joi.string().required(),
      codigo_dane_sede: Joi.string()
        .pattern(/^\d{12}$/)
        .required(),
      direccion: Joi.string().required(),
    }).required(),

    anio_lectivo: Joi.object({
      year: Joi.number().integer().min(2000).max(2100).required(),
      calendario: Joi.string()
        .valid(...CALENDARIOS)
        .required(),
      periodos: Joi.array().items(periodoSchema).min(1).required(),
    }).required(),
  }),
};
