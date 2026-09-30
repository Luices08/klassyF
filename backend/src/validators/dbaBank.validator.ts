import Joi from 'joi';
import { ESTADOS_USUARIO, TIPOS_REFERENTE } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const dbaItemSchema = Joi.object({
  tipo_referente: Joi.string()
    .valid(...TIPOS_REFERENTE)
    .default('DBA'),
  grade_id: objectId.allow(null).optional(),
  area_id: objectId.required(),
  numero_dba: Joi.number().integer().min(1).allow(null).optional(),
  enunciado: Joi.string().required(),
  evidencias_aprendizaje: Joi.array().items(Joi.string()).default([]),
  eje_tematico: Joi.string().allow('').optional(),
  organizador: Joi.string().allow('').optional(),
  ejemplo: Joi.string().allow('').optional(),
  grupo_grados: Joi.string().allow('').optional(),
  competencia: Joi.string().allow('').optional(),
  componente: Joi.string().allow('').optional(),
  etiquetas: Joi.array().items(Joi.string()).default([]),
  version: Joi.string().default('V2'),
  fuente: Joi.string().default('MEN - Colombia Aprende'),
  estado: Joi.string()
    .valid(...ESTADOS_USUARIO)
    .default('activo'),
});

// Acepta un solo DBA o un array (carga/seed masiva) en el mismo endpoint.
export const createDbaEntries: ValidationSchema = {
  body: Joi.alternatives().try(dbaItemSchema, Joi.array().items(dbaItemSchema).min(1)),
};

export const listDbaEntries: ValidationSchema = {
  query: Joi.object({
    grade_id: objectId.optional(),
    area_id: objectId.optional(),
    tipo_referente: Joi.string()
      .valid(...TIPOS_REFERENTE)
      .optional(),
    organizador: Joi.string().trim().optional(),
    q: Joi.string().trim().max(100).optional(),
    estado: Joi.string()
      .valid(...ESTADOS_USUARIO)
      .optional(),
  }),
};
