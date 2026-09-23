import Joi from 'joi';
import { ESTADOS_USUARIO, ROLES, TIPOS_DOCUMENTO } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';

export const createUser: ValidationSchema = {
  body: Joi.object({
    nombre: Joi.string().required(),
    apellido: Joi.string().required(),
    tipo_documento: Joi.string()
      .valid(...TIPOS_DOCUMENTO)
      .required(),
    numero_documento: Joi.string().required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(8).required(),
    rol: Joi.string()
      .valid(...ROLES)
      .required(),
    estado: Joi.string().valid(...ESTADOS_USUARIO),
  }),
};

export const listUsers: ValidationSchema = {
  query: Joi.object({
    rol: Joi.string().valid(...ROLES),
    estado: Joi.string().valid(...ESTADOS_USUARIO),
  }),
};
