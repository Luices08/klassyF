import Joi from 'joi';
import { ACCIONES_AUDITORIA } from '../models/auditLog.model';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const listAuditLogs: ValidationSchema = {
  query: Joi.object({
    usuario_id: objectId,
    accion: Joi.string().valid(...ACCIONES_AUDITORIA),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
  }),
};
