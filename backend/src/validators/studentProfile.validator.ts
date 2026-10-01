import Joi from 'joi';
import {
  ESTADOS_ESTUDIANTE,
  GENEROS,
  GRUPOS_ETNICOS,
  GRUPOS_SANGUINEOS,
  REGIMENES_SALUD,
} from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const upsertProfile: ValidationSchema = {
  params: Joi.object({
    userId: objectId.required(),
  }),
  body: Joi.object({
    lugar_expedicion: Joi.string().allow('', null),
    fecha_nacimiento: Joi.date().required(),
    genero: Joi.string().valid(...GENEROS),
    eps: Joi.string().allow('', null),
    regimen_salud: Joi.string().valid(...REGIMENES_SALUD),
    rh: Joi.string().valid(...GRUPOS_SANGUINEOS),
    alergias_condiciones: Joi.string().allow('', null),
    direccion_residencia: Joi.string().allow('', null),
    barrio_vereda: Joi.string().allow('', null),
    municipio: Joi.string().allow('', null),
    estrato: Joi.number().integer().min(1).max(6),
    grupo_etnico: Joi.string().valid(...GRUPOS_ETNICOS),
    victima_conflicto: Joi.boolean(),
    tiene_discapacidad: Joi.boolean(),
    tiene_talento_excepcional: Joi.boolean(),
    descripcion_inclusion: Joi.string().allow('', null),
    institucion_procedencia: Joi.string().allow('', null),
    autorizacion_datos_sensibles: Joi.object({
      otorgada: Joi.boolean().required(),
      otorgado_por_nombre: Joi.string().allow('', null),
    }),
  }),
};

export const getProfile: ValidationSchema = {
  params: Joi.object({
    userId: objectId.required(),
  }),
};

export const actualizarEstado: ValidationSchema = {
  params: Joi.object({
    userId: objectId.required(),
  }),
  body: Joi.object({
    estado: Joi.string()
      .valid(...ESTADOS_ESTUDIANTE)
      .required(),
  }),
};
