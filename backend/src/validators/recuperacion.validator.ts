import Joi from 'joi';
import { EFECTOS_RECUPERACION, MAX_CARACTERES_OBSERVACION_INTENTO, MAX_CARACTERES_TEXTO_SIEE, MAX_INTENTOS_RECUPERACION, MODOS_INTEGRACION, MOMENTOS_RECUPERACION, TIPOS_RECUPERACION } from '../constants/recuperaciones';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const intentos = Joi.number().integer().min(1).max(MAX_INTENTOS_RECUPERACION).required();
const efecto = Joi.string()
  .valid(...EFECTOS_RECUPERACION)
  .required();

export const anioParam: ValidationSchema = {
  params: Joi.object({ academic_year_id: objectId.required() }),
};

// Que las reglas calcen con los periodos del año (todos presentes, el último sin «al iniciar el siguiente») lo valida el servicio.
export const actualizarPolitica: ValidationSchema = {
  params: Joi.object({ academic_year_id: objectId.required() }),
  body: Joi.object({
    periodos: Joi.array()
      .items(
        Joi.object({
          periodo_numero: Joi.number().integer().min(1).max(4).required(),
          aplica: Joi.boolean().required(),
          momento: Joi.string()
            .valid(...MOMENTOS_RECUPERACION)
            .required(),
        })
      )
      .min(1)
      .max(4)
      .required(),
    periodo: Joi.object({
      efecto,
      max_intentos: intentos,
      integracion: Joi.object({
        modo: Joi.string()
          .valid(...MODOS_INTEGRACION)
          .required(),
        bloque_clave: Joi.string().trim().allow('').max(60).default(''),
        peso: Joi.number().min(0).max(100).allow(null).default(null),
        solo_si_mejora: Joi.boolean().required(),
        tope_aprobatoria: Joi.boolean().required(),
        cuenta_en_boletin: Joi.boolean().required(),
      }).required(),
    }).required(),
    anual: Joi.object({
      aplica: Joi.boolean().required(),
      efecto,
      max_intentos: intentos,
      max_asignaturas_pendientes: Joi.number().integer().min(0).max(50).required(),
    }).required(),
    texto_siee: Joi.string().trim().allow('').max(MAX_CARACTERES_TEXTO_SIEE).required(),
  }),
};

export const listarCandidatos: ValidationSchema = {
  query: Joi.object({
    academic_year_id: objectId.required(),
    tipo: Joi.string()
      .valid(...TIPOS_RECUPERACION)
      .required(),
    periodo_numero: Joi.number().integer().min(1).max(4).when('tipo', { is: 'PERIODO', then: Joi.required(), otherwise: Joi.forbidden() }),
    teacher_assignment_id: objectId,
    group_id: objectId,
  }),
};

export const registrarIntento: ValidationSchema = {
  body: Joi.object({
    teacher_assignment_id: objectId.required(),
    student_id: objectId.required(),
    tipo: Joi.string()
      .valid(...TIPOS_RECUPERACION)
      .required(),
    periodo_numero: Joi.number().integer().min(1).max(4).when('tipo', { is: 'PERIODO', then: Joi.required(), otherwise: Joi.forbidden() }),
    nota: Joi.number().min(0).required(),
    observacion: Joi.string().trim().allow('').max(MAX_CARACTERES_OBSERVACION_INTENTO),
  }),
};
