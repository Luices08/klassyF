import Joi from 'joi';
import {
  ACTIVIDADES_RECTORAS_PREESCOLAR,
  ESTADOS_USUARIO,
  GRUPOS_GRADOS_EBC,
  TIPOS_REFERENTE,
} from '../constants/enums';
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

const matrizIcfesItemSchema = Joi.object({
  tipo_referente: Joi.string().valid('MATRIZ_ICFES').required(),
  area_id: objectId.required(),
  grade_id: objectId.required(),
  componente: Joi.string().required(),
  competencia: Joi.string().required(),
  aprendizaje: Joi.string().required(),
  enunciado: Joi.string().required(),
  evidencias_aprendizaje: Joi.array().items(Joi.string()).default([]),
  ...referenciaComun,
});

const referenteInstitucionalItemSchema = Joi.object({
  tipo_referente: Joi.string().valid('REFERENTE_INSTITUCIONAL').required(),
  area_id: objectId.required(),
  grade_id: objectId.allow(null).optional(),
  grupo_grados: Joi.string().valid(...GRUPOS_GRADOS_EBC).allow(null).optional(),
  codigo: Joi.string().trim().allow('').default(''),
  organizador: Joi.string().trim().allow('').default(''),
  competencia: Joi.string().trim().allow('').default(''),
  enunciado: Joi.string().required(),
  evidencias_aprendizaje: Joi.array().items(Joi.string()).default([]),
  ...referenciaComun,
});

const dimensionExperienciaItemSchema = Joi.object({
  tipo_referente: Joi.string().valid('DIMENSION_EXPERIENCIA').required(),
  area_id: objectId.required(),
  grade_id: objectId.required(),
  actividad_rectora: Joi.string().valid(...ACTIVIDADES_RECTORAS_PREESCOLAR).required(),
  enunciado: Joi.string().required(),
  evidencias_aprendizaje: Joi.array().items(Joi.string()).default([]),
  ejemplo: Joi.string().allow('').default(''),
  ...referenciaComun,
});

const referenteItemSchema = Joi.alternatives().try(
  dbaItemSchema,
  ebcItemSchema,
  lineamientoItemSchema,
  matrizIcfesItemSchema,
  referenteInstitucionalItemSchema,
  dimensionExperienciaItemSchema
);

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
    actividad_rectora: Joi.string()
      .valid(...ACTIVIDADES_RECTORAS_PREESCOLAR)
      .optional(),
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
