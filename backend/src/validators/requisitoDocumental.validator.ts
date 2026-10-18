import Joi from 'joi';
import { NIVELES_EDUCATIVOS, TIPOS_INGRESO } from '../constants/enums';
import { CATEGORIAS_REQUISITO, CONDICIONES_REQUISITO, MAX_INDICACION_REQUISITO, MAX_NOMBRE_REQUISITO } from '../constants/requisitosDocumentales';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const datos = Joi.object({
  nombre: Joi.string().trim().min(2).max(MAX_NOMBRE_REQUISITO).required(),
  indicacion: Joi.string().trim().allow('').max(MAX_INDICACION_REQUISITO).default(''),
  categoria: Joi.string()
    .valid(...CATEGORIAS_REQUISITO)
    .required(),
  obligatorio: Joi.boolean().required(),
  niveles: Joi.array()
    .items(Joi.string().valid(...NIVELES_EDUCATIVOS))
    .unique()
    .default([]),
  grados_numeros: Joi.array().items(Joi.number().integer().min(-2).max(11)).unique().default([]),
  tipos_ingreso: Joi.array()
    .items(Joi.string().valid(...TIPOS_INGRESO))
    .unique()
    .default([]),
  condicion_especial: Joi.string()
    .valid(...CONDICIONES_REQUISITO)
    .default('NINGUNA'),
});

export const listar: ValidationSchema = {
  query: Joi.object({ estado: Joi.string().valid('activo', 'inactivo') }),
};

export const crear: ValidationSchema = { body: datos };

export const actualizar: ValidationSchema = { params: Joi.object({ id: objectId.required() }), body: datos };

export const cambiarEstado: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({ estado: Joi.string().valid('activo', 'inactivo').required() }),
};

export const idParam: ValidationSchema = { params: Joi.object({ id: objectId.required() }) };
