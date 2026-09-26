import Joi from 'joi';
import { ESTADOS_USUARIO } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const listCampuses: ValidationSchema = {
  query: Joi.object({
    institucion_id: objectId,
  }),
};

export const crearSede: ValidationSchema = {
  body: Joi.object({
    institucion_id: objectId.required(),
    nombre: Joi.string().required(),
    codigo_dane_sede: Joi.string()
      .pattern(/^\d{12}$/)
      .required(),
    direccion: Joi.string().required(),
    telefono: Joi.string().allow('', null),
  }),
};

export const actualizarSede: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    nombre: Joi.string().required(),
    codigo_dane_sede: Joi.string()
      .pattern(/^\d{12}$/)
      .required(),
    direccion: Joi.string().required(),
    telefono: Joi.string().allow('', null),
  }),
};

export const actualizarEstadoSede: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    estado: Joi.string()
      .valid(...ESTADOS_USUARIO)
      .required(),
  }),
};

export const eliminarSede: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
};
