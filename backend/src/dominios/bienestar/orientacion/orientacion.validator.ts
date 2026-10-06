import Joi from 'joi';
import { ESTADOS_REMISION_ORIENTACION } from '../comun/convivencia.constants';
import { ValidationSchema } from '../../../middlewares/validate.middleware';
import { objectId } from '../../../validators/common.validator';

const idParam = { params: Joi.object({ id: objectId.required() }) };

export const listarRemisiones: ValidationSchema = {
  query: Joi.object({
    estado: Joi.string().valid(...ESTADOS_REMISION_ORIENTACION),
    pagina: Joi.number().integer().min(1).default(1),
    limite: Joi.number().integer().min(1).max(50).default(20),
  }),
};

export const obtenerRemision: ValidationSchema = idParam;
export const marcarAtendida: ValidationSchema = idParam;

export const registrarAtencion: ValidationSchema = {
  params: idParam.params,
  body: Joi.object({
    fecha: Joi.string()
      .pattern(/^\d{4}-\d{2}-\d{2}$/)
      .message('"{{#label}}" debe tener el formato YYYY-MM-DD.')
      .required(),
    descripcion: Joi.string().trim().min(5).max(4000).required(),
  }),
};
