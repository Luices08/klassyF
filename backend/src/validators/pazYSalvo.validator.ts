import Joi from 'joi';
import { FILTROS_ESTADO_PAZ_Y_SALVO } from '../constants/pazYSalvo';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const listarPazYSalvo: ValidationSchema = {
  query: Joi.object({
    academic_year_id: objectId.required(),
    group_id: objectId,
    estado: Joi.string().valid(...FILTROS_ESTADO_PAZ_Y_SALVO),
    search: Joi.string().allow(''),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
  }),
};

const parametrosEstudiante = Joi.object({ studentId: objectId.required(), anioId: objectId.required() });

export const cargarPazYSalvo: ValidationSchema = { params: parametrosEstudiante };

export const revisarPazYSalvo: ValidationSchema = {
  params: parametrosEstudiante,
  body: Joi.object({
    estado: Joi.string().valid('CONFIRMADO', 'RECHAZADO').required(),
    observacion: Joi.string().trim().allow('').max(500),
  }),
};

export const descargarPazYSalvo: ValidationSchema = { params: Joi.object({ id: objectId.required() }) };
