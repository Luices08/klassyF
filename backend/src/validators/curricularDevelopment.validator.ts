import Joi from 'joi';
import { ESTADOS_DESARROLLO_CURRICULAR } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const upsertDraft: ValidationSchema = {
  body: Joi.object({
    teacher_assignment_id: objectId.required(),
    periodo_numero: Joi.number().integer().min(1).max(4).required(),
    dba_seleccionados: Joi.array().items(objectId).default([]),
    evidencias_seleccionadas: Joi.array().items(Joi.string()).default([]),
    competencias: Joi.string().allow('', null).default(''),
    contenidos_tematicos: Joi.array().items(Joi.string()).default([]),
    ejes_tematicos: Joi.array().items(Joi.string()).default([]),
    actividades_propuestas: Joi.string().allow('', null).default(''),
    metodologia_y_recursos: Joi.string().allow('', null).default(''),
    criterios_evaluacion: Joi.string().allow('', null).default(''),
    semanas_estimadas: Joi.number().integer().min(1).max(20).default(10),
    fase_inicio: Joi.string().allow('', null).default(''),
    fase_desarrollo: Joi.string().allow('', null).default(''),
    fase_cierre: Joi.string().allow('', null).default(''),
    es_preescolar: Joi.boolean().default(false),
    nombre_proyecto: Joi.string().allow('', null).default(''),
    dimensiones_articuladas: Joi.array().items(Joi.string()).default([]),
    actividades_rectoras: Joi.array().items(Joi.string()).default([]),
    experiencias_significativas: Joi.string().allow('', null).default(''),
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
      // Joi usa `then` como clave de configuración, no como un thenable.
      // oxlint-disable-next-line unicorn/no-thenable
      then: Joi.string().min(1).required(),
      otherwise: Joi.string().allow('', null).optional(),
    }),
  }),
};

export const reabrir: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    motivo: Joi.string().min(1).required(),
  }),
};

export const listDevelopments: ValidationSchema = {
  query: Joi.object({
    academic_year_id: objectId.optional(),
    estado: Joi.string().valid(...ESTADOS_DESARROLLO_CURRICULAR).optional(),
    periodo_numero: Joi.number().integer().min(1).max(4).optional(),
    teacher_assignment_id: objectId.optional(),
    docente_id: objectId.optional(),
  }),
};

export const getOneParams: ValidationSchema = {
  params: Joi.object({
    assignmentId: objectId.required(),
    periodoNumero: Joi.number().integer().min(1).max(4).required(),
  }),
};
