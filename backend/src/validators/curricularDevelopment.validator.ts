import Joi from 'joi';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const upsertDraft: ValidationSchema = {
  body: Joi.object({
    teacher_assignment_id: objectId.required(),
    periodo_numero: Joi.number().integer().min(1).max(4).required(),
    dba_seleccionados: Joi.array().items(objectId).default([]),
    competencias: Joi.string().required(),
    ejes_tematicos: Joi.array().items(Joi.string()).default([]),
    metodologia_y_recursos: Joi.string().required(),
    criterios_evaluacion: Joi.string().required(),
  }),
};

export const submitParams: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
};

export const review: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    decision: Joi.string().valid('APROBADO', 'DEVUELTO_OBSERVACIONES').required(),
    observacion: Joi.string().when('decision', {
      is: 'DEVUELTO_OBSERVACIONES',
      then: Joi.string().min(1).required(),
      otherwise: Joi.string().allow('', null).optional(),
    }),
  }),
};
