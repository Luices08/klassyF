import Joi from 'joi';
import { ESTADOS_USUARIO, GRUPOS_GRADOS_EBC, TIPOS_REFERENTE } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const referenciaComun = {
  etiquetas: Joi.array().items(Joi.string()).default([]),
  version: Joi.string().default('V1'),
  fuente: Joi.string().default('MEN - Colombia Aprende'),
  estado: Joi.string()
    .valid(...ESTADOS_USUARIO)
    .default('activo'),
};

const dbaItemSchema = Joi.object({
  tipo_referente: Joi.string().valid('DBA').required(),
  area_id: objectId.required(),
  grade_id: objectId.required(),
  numero_dba: Joi.number().integer().min(1).required(),
  organizador: Joi.string().required(),
  enunciado: Joi.string().required(),
  evidencias_aprendizaje: Joi.array().items(Joi.string()).default([]),
  ejemplo: Joi.string().allow('').default(''),
  ...referenciaComun,
});

const ebcItemSchema = Joi.object({
  tipo_referente: Joi.string().valid('EBC').required(),
  area_id: objectId.required(),
  grupo_grados: Joi.string()
    .valid(...GRUPOS_GRADOS_EBC)
    .required(),
  organizador: Joi.string().required(),
  competencia: Joi.string().required(),
  enunciado: Joi.string().required(),
  evidencias_aprendizaje: Joi.array().items(Joi.string()).default([]),
  dba_relacionados: Joi.array().items(objectId).default([]),
  ...referenciaComun,
});

const lineamientoItemSchema = Joi.object({
  tipo_referente: Joi.string().valid('LINEAMIENTO').required(),
  area_id: objectId.allow(null).optional(),
  titulo: Joi.string().required(),
  contenido: Joi.string().required(),
  orden: Joi.number().integer().min(1).default(1),
  ...referenciaComun,
});

const referenteItemSchema = Joi.alternatives().try(dbaItemSchema, ebcItemSchema, lineamientoItemSchema);

// Acepta un solo referente o un array (carga/seed masiva) en el mismo endpoint.
export const createReferentes: ValidationSchema = {
  body: Joi.alternatives().try(referenteItemSchema, Joi.array().items(referenteItemSchema).min(1)),
};

export const listReferentes: ValidationSchema = {
  query: Joi.object({
    grade_id: objectId.optional(),
    area_id: objectId.optional(),
    tipo_referente: Joi.string()
      .valid(...TIPOS_REFERENTE)
      .optional(),
    grupo_grados: Joi.string()
      .valid(...GRUPOS_GRADOS_EBC)
      .optional(),
    organizador: Joi.string().trim().optional(),
    q: Joi.string().trim().max(100).optional(),
    estado: Joi.string()
      .valid(...ESTADOS_USUARIO)
      .optional(),
  }),
};

export const organizadoresParams: ValidationSchema = {
  params: Joi.object({
    areaId: objectId.required(),
  }),
  query: Joi.object({
    tipo_referente: Joi.string().valid('DBA', 'EBC').default('DBA'),
  }),
};

export const panelApoyoQuery: ValidationSchema = {
  query: Joi.object({
    area_id: objectId.required(),
    grade_id: objectId.required(),
  }),
};
