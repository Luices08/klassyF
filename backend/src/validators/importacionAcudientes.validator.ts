import Joi from 'joi';
import { CLASIFICACIONES_ACUDIENTES } from '../constants/importacionAcudientes';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const simular: ValidationSchema = {
  // Llega como campo de un formulario multipart (texto): Joi lo convierte.
  body: Joi.object({
    habilitar_portal: Joi.boolean().default(false),
  }),
};

export const idImportacion: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const filas: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  query: Joi.object({
    clasificacion: Joi.string().valid(...CLASIFICACIONES_ACUDIENTES),
    search: Joi.string().trim().max(80).allow(''),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(200),
  }),
};

export const aplicar: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    confirm_password: Joi.string().required(),
    confirmo_advertencias: Joi.boolean().valid(true).required().messages({ 'any.only': 'Debes confirmar que leíste las advertencias antes de importar.' }),
  }),
};

export const plantilla: ValidationSchema = {
  query: Joi.object({ formato: Joi.string().valid('xlsx', 'csv') }),
};
