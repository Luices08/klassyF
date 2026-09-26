import Joi from 'joi';
import { ESTADOS_USUARIO, ROLES, TIPOS_DOCUMENTO } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

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

export const updateUser: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    nombre: Joi.string(),
    apellido: Joi.string(),
    tipo_documento: Joi.string().valid(...TIPOS_DOCUMENTO),
    numero_documento: Joi.string(),
    email: Joi.string().email(),
    rol: Joi.string().valid(...ROLES),
    // Reseteo de contraseña: el admin asigna una nueva, nunca se expone la anterior (esta hasheada).
    password: Joi.string().min(8),
  }).min(1),
};

export const actualizarEstado: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    estado: Joi.string()
      .valid(...ESTADOS_USUARIO)
      .required(),
  }),
};

export const eliminarUsuario: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
};
