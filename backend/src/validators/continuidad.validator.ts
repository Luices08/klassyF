import Joi from 'joi';
import { DECISIONES_CONTINUIDAD } from '../models/confirmacionContinuidad.model';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const respuesta = {
  // null (o vacío) borra la respuesta: vuelve a «sin respuesta».
  decision: Joi.string()
    .valid(...DECISIONES_CONTINUIDAD)
    .allow(null)
    .required(),
  motivo: Joi.string().trim().max(300).allow('', null),
};

export const listar: ValidationSchema = {
  query: Joi.object({
    destino_id: objectId.required(),
    sede_id: objectId,
    grade_id: objectId,
    group_id: objectId,
    decision: Joi.string().valid(...DECISIONES_CONTINUIDAD, 'SIN_RESPUESTA'),
  }),
};

export const registrar: ValidationSchema = {
  params: Joi.object({ studentId: objectId.required() }),
  body: Joi.object({ destino_id: objectId.required(), ...respuesta }),
};

export const responderEnPortal: ValidationSchema = {
  params: Joi.object({ studentId: objectId.required() }),
  body: Joi.object(respuesta),
};
