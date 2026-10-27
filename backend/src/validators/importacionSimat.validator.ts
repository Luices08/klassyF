import Joi from 'joi';
import { CLASIFICACIONES_SIMAT } from '../constants/importacionSimat';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const simular: ValidationSchema = {
  // Llegan como campos de un formulario multipart (texto): Joi los convierte.
  body: Joi.object({
    reincorporar_retirados: Joi.boolean().default(false),
    autorizacion_datos_salud: Joi.boolean().default(false),
    cupo_por_defecto: Joi.number().integer().min(1).max(200),
    dias_compromiso: Joi.number().integer().min(1).max(365),
  }),
};

export const idImportacion: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const filas: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  query: Joi.object({
    clasificacion: Joi.string().valid(...CLASIFICACIONES_SIMAT),
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

export const revisarEstudiante: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
};
