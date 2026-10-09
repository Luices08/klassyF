import Joi from 'joi';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const periodo = Joi.number().integer().min(1).max(4);
const planillaRef = { teacher_assignment_id: objectId.required(), periodo_numero: periodo.required() };

export const obtenerPlanilla: ValidationSchema = {
  query: Joi.object(planillaRef),
};

// El rango real de la nota (nota_minima/nota_maxima del año) lo valida el servicio, que conoce el año lectivo de la clase.
export const guardarCeldas: ValidationSchema = {
  body: Joi.object({
    ...planillaRef,
    celdas: Joi.array()
      .items(
        Joi.object({
          student_id: objectId.required(),
          actividad_id: objectId,
          componente_clave: Joi.string().pattern(/^[A-Z0-9_]{2,40}$/),
          nota: Joi.number().min(0).required(),
        }).xor('actividad_id', 'componente_clave')
      )
      .min(1)
      .max(2000)
      .required(),
  }),
};

export const cerrarPlanilla: ValidationSchema = {
  body: Joi.object(planillaRef),
};

export const reabrirPlanilla: ValidationSchema = {
  body: Joi.object({ ...planillaRef, motivo: Joi.string().trim().min(5).max(500).required() }),
};

export const declararDefinitivas: ValidationSchema = {
  body: Joi.object({
    academic_year_id: objectId.required(),
    periodo_numero: periodo.required(),
    group_id: objectId,
    teacher_assignment_id: objectId,
  }),
};

export const seguimiento: ValidationSchema = {
  query: Joi.object({ academic_year_id: objectId.required(), periodo_numero: periodo.required(), group_id: objectId }),
};
