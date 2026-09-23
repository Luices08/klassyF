import Joi from 'joi';
import { ValidationSchema } from '../middlewares/validate.middleware';

export const login: ValidationSchema = {
  body: Joi.object({
    email: Joi.string().email().lowercase(),
    numero_documento: Joi.string(),
    password: Joi.string().required(),
  }).xor('email', 'numero_documento'),
};
