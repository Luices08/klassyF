import Joi from 'joi';
import { ROLES } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';

// Login por documento de identidad + contraseña (no por correo): numero_documento
// ya es unico por usuario en el schema, asi que basta con el numero, sin el tipo.
export const login: ValidationSchema = {
  body: Joi.object({
    numero_documento: Joi.string().required(),
    password: Joi.string().required(),
  }),
};

export const seleccionarPerfil: ValidationSchema = {
  body: Joi.object({
    seleccion_token: Joi.string().required(),
    rol: Joi.string()
      .valid(...ROLES)
      .required(),
  }),
};

export const cambiarPerfil: ValidationSchema = {
  body: Joi.object({
    rol: Joi.string()
      .valid(...ROLES)
      .required(),
  }),
};
