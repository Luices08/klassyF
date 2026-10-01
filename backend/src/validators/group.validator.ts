import Joi from 'joi';
import { ESTADOS_GRUPO } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const createGroup: ValidationSchema = {
  body: Joi.object({
    sede_id: objectId.required(),
    academic_year_id: objectId.required(),
    grade_id: objectId.required(),
    jornada_id: objectId.required(),
    nomenclatura: Joi.string().required(),
    max_capacity: Joi.number().integer().min(1).required(),
    // director_grupo_id NO se recibe aqui: se asigna unicamente via M08
    // (POST /teacher-assignments, tipo DIRECCION_GRUPO), que valida rol docente
    // y mantiene TeacherAssignment como la unica fuente de verdad.
    aula_id: objectId.allow(null),
  }),
};

export const listGroups: ValidationSchema = {
  query: Joi.object({
    academic_year_id: objectId,
    sede_id: objectId,
    grade_id: objectId,
    jornada_id: objectId,
    estado: Joi.string().valid(...ESTADOS_GRUPO),
  }),
};

export const actualizarEstado: ValidationSchema = {
  params: Joi.object({
    groupId: objectId.required(),
  }),
  body: Joi.object({
    estado: Joi.string()
      .valid(...ESTADOS_GRUPO)
      .required(),
  }),
};

export const cambiarAula: ValidationSchema = {
  params: Joi.object({
    groupId: objectId.required(),
  }),
  body: Joi.object({
    aula_id: objectId.allow(null).required(),
  }),
};
