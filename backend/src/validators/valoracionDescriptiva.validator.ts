import Joi from 'joi';
import { MAX_CARACTERES_DESCRIPTOR, MAX_ESTUDIANTES_POR_GUARDADO, NIVELES_VALORACION } from '../constants/valoracionDescriptiva';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const periodo = Joi.number().integer().min(1).max(12);

export const planilla: ValidationSchema = {
  query: Joi.object({ teacher_assignment_id: objectId.required(), periodo_numero: periodo.required() }),
};

export const guardar: ValidationSchema = {
  body: Joi.object({
    teacher_assignment_id: objectId.required(),
    periodo_numero: periodo.required(),
    valoraciones: Joi.array()
      .items(
        Joi.object({
          student_id: objectId.required(),
          nivel: Joi.string().valid(...NIVELES_VALORACION).required(),
          fortalezas: Joi.string().trim().allow('').max(MAX_CARACTERES_DESCRIPTOR).required(),
          recomendaciones: Joi.string().trim().allow('').max(MAX_CARACTERES_DESCRIPTOR).required(),
        })
      )
      .min(1)
      .max(MAX_ESTUDIANTES_POR_GUARDADO)
      .required(),
  }),
};

export const informe: ValidationSchema = {
  query: Joi.object({ student_id: objectId.required(), academic_year_id: objectId.required(), periodo_numero: periodo.required() }),
};
