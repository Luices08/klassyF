import Joi from 'joi';
import { ValidationSchema } from '../middlewares/validate.middleware';

export const orientar: ValidationSchema = {
  body: Joi.object({
    pregunta: Joi.string().trim().min(2).max(300).required(),
    destinos: Joi.array()
      .items(
        Joi.object({
          ruta: Joi.string().max(100).required(),
          nombre: Joi.string().max(100).required(),
          descripcion: Joi.string().allow('').max(300).default(''),
          acepta_grado: Joi.boolean().default(false),
        })
      )
      .min(1)
      .max(80)
      .required(),
  }),
};
