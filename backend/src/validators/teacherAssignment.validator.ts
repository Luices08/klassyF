import Joi from 'joi';
import { ESTADOS_USUARIO, TIPOS_ASIGNACION_DOCENTE } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const createTeacherAssignment: ValidationSchema = {
  body: Joi.object({
    docente_id: objectId.required(),
    academic_year_id: objectId.required(),
    tipo_asignacion: Joi.string()
      .valid(...TIPOS_ASIGNACION_DOCENTE)
      .default('CLASE'),
    group_id: objectId.allow(null).optional(),
    subject_id: objectId.allow(null).optional(),
    horas_semanales: Joi.number().integer().min(1).max(50).required(),
    proyecto_nombre: Joi.string().allow('', null).optional(),
    observaciones: Joi.string().allow('', null).optional(),
  }),
};

export const listTeacherAssignments: ValidationSchema = {
  query: Joi.object({
    academic_year_id: objectId.optional(),
    docente_id: objectId.optional(),
    group_id: objectId.optional(),
    tipo_asignacion: Joi.string()
      .valid(...TIPOS_ASIGNACION_DOCENTE)
      .optional(),
    estado: Joi.string()
      .valid(...ESTADOS_USUARIO)
      .optional(),
  }),
};

export const idParam: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
};
