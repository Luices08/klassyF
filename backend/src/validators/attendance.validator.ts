import Joi from 'joi';
import { ESTADOS_ASISTENCIA } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const registroSchema = Joi.object({
  student_id: objectId.required(),
  estado: Joi.string()
    .valid(...ESTADOS_ASISTENCIA)
    .required(),
  observacion: Joi.string().allow(''),
});

export const registerAttendance: ValidationSchema = {
  body: Joi.object({
    group_id: objectId.required(),
    subject_id: objectId.required(),
    fecha: Joi.date().required(),
    periodo_numero: Joi.number().integer().min(1).max(4).required(),
    registros: Joi.array().items(registroSchema).min(1).required(),
  }),
};

export const listAttendance: ValidationSchema = {
  query: Joi.object({
    group_id: objectId.required(),
    subject_id: objectId.required(),
    fecha: Joi.date().required(),
  }),
};
