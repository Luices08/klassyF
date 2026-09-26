import Joi from 'joi';
import { ValidationSchema } from '../middlewares/validate.middleware';

// Login por documento de identidad + contraseña (no por correo): numero_documento
// ya es unico por usuario en el schema, asi que basta con el numero, sin el tipo.
export const login: ValidationSchema = {
  body: Joi.object({
    numero_documento: Joi.string().required(),
    password: Joi.string().required(),
  }),
};
