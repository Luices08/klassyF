import Joi from 'joi';
import { ESTADOS_AREA, NIVELES_EDUCATIVOS, TIPOS_ASIGNATURA } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const nivelesEducativos = Joi.array().items(Joi.string().valid(...NIVELES_EDUCATIVOS)).min(1).unique();

export const createSubject: ValidationSchema = {
  body: Joi.object({
    area_id: objectId.required(),
    nombre: Joi.string().required(),
    abreviatura: Joi.string().required(),
    descripcion: Joi.string().required(),
    tipo: Joi.string()
      .valid(...TIPOS_ASIGNATURA)
      .required(),
    niveles_educativos: nivelesEducativos.required(),
    estado: Joi.string().valid(...ESTADOS_AREA),
  }),
};

export const listSubjects: ValidationSchema = {
  query: Joi.object({
    area_id: objectId,
    estado: Joi.string().valid(...ESTADOS_AREA),
    nivel_educativo: Joi.string().valid(...NIVELES_EDUCATIVOS),
  }),
};

export const actualizarSubject: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    area_id: objectId,
    nombre: Joi.string(),
    abreviatura: Joi.string(),
    descripcion: Joi.string(),
    tipo: Joi.string().valid(...TIPOS_ASIGNATURA),
    niveles_educativos: nivelesEducativos,
  }).min(1),
};

export const actualizarEstadoSubject: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    estado: Joi.string()
      .valid(...ESTADOS_AREA)
      .required(),
  }),
};
