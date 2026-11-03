import Joi from 'joi';
import { MAX_MOTIVO_RECHAZO_CLAVE, MAX_NOTA_SOLICITUD_CLAVE } from '../constants/recuperacionClave';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const solicitar: ValidationSchema = {
  body: Joi.object({
    numero_documento: Joi.string().trim().min(3).max(30).required(),
    nota: Joi.string().trim().allow('').max(MAX_NOTA_SOLICITUD_CLAVE),
  }),
};

export const listar: ValidationSchema = {
  query: Joi.object({ vista: Joi.string().valid('PENDIENTES', 'ATENDIDAS').default('PENDIENTES') }),
};

export const aprobar: ValidationSchema = { params: Joi.object({ id: objectId.required() }) };

export const rechazar: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({ motivo: Joi.string().trim().allow('').max(MAX_MOTIVO_RECHAZO_CLAVE) }),
};
