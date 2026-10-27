import Joi from 'joi';
import { MODULOS_AUDITORIA } from '../constants/auditoria';
import { ACCIONES_AUDITORIA } from '../models/auditLog.model';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const fechaDia = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).message('"{{#label}}" debe tener el formato AAAA-MM-DD.');

const filtros = {
  modulo: Joi.string().valid(...MODULOS_AUDITORIA.map((m) => m.clave)),
  accion: Joi.string().valid(...ACCIONES_AUDITORIA),
  usuario_id: objectId,
  entidad: Joi.string().trim().max(60),
  entidad_id: objectId,
  desde: fechaDia,
  hasta: fechaDia,
  texto: Joi.string().trim().max(100).allow(''),
};

export const listAuditLogs: ValidationSchema = {
  query: Joi.object({
    ...filtros,
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
  }),
};

export const exportarHistorial: ValidationSchema = {
  query: Joi.object(filtros),
};

export const historialDeMatricula: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
};
