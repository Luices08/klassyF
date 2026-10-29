import Joi from 'joi';
import { TIPOS_TERMINOS } from '../constants/terminos';
import { ValidationSchema } from '../middlewares/validate.middleware';

export const aceptar: ValidationSchema = {
  body: Joi.object({
    terminos: Joi.array()
      .items(Joi.object({ tipo: Joi.string().valid(...TIPOS_TERMINOS).required(), version: Joi.string().trim().max(20).required() }))
      .min(1)
      .max(TIPOS_TERMINOS.length)
      .unique('tipo')
      .required(),
  }),
};
