import Joi from 'joi';
import { ESTADOS_ANTICIPADA, MAX_TEXTO_ANTICIPADA, MEDIOS_CONSENTIMIENTO, TIPOS_ANTICIPADA, TRATAMIENTOS_NOTAS } from '../constants/promocionAnticipada';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const id: ValidationSchema = { params: Joi.object({ id: objectId.required() }) };

const criterio = Joi.object({
  activo: Joi.boolean().required(),
  promedio_minimo: Joi.number().greater(0).required(),
  nota_minima_asignatura: Joi.number().greater(0).allow(null).required(),
});

export const actualizarConfiguracion: ValidationSchema = {
  body: Joi.object({
    activa: Joi.boolean().required(),
    periodo_evaluacion: Joi.number().integer().min(1).max(12).required(),
    dias_ventana_tras_cierre: Joi.number().integer().min(0).max(365).required(),
    rendimiento_excepcional: criterio.required(),
    reiniciantes: criterio.required(),
    exige: Joi.object({ concepto_comision: Joi.boolean().required(), consentimiento_familia: Joi.boolean().required(), decision_consejo_directivo: Joi.boolean().required() }).required(),
    tratamiento_notas: Joi.string().valid(...TRATAMIENTOS_NOTAS).required(),
  }),
};

export const solicitar: ValidationSchema = {
  body: Joi.object({ enrollment_id: objectId.required(), tipo: Joi.string().valid(...TIPOS_ANTICIPADA).required(), motivo: Joi.string().trim().allow('').max(MAX_TEXTO_ANTICIPADA) }),
};

export const listar: ValidationSchema = {
  query: Joi.object({ academic_year_id: objectId, estado: Joi.string().valid(...ESTADOS_ANTICIPADA), tipo: Joi.string().valid(...TIPOS_ANTICIPADA), student_id: objectId }),
};

export const idTramite = id;

export const consentimiento: ValidationSchema = {
  params: id.params,
  body: Joi.object({
    otorgado: Joi.boolean().required(),
    medio: Joi.string().valid(...MEDIOS_CONSENTIMIENTO).required(),
    guardian_id: objectId.allow(null),
    por_el_estudiante: Joi.boolean(),
    observaciones: Joi.string().trim().allow('').max(1000),
  }),
};

export const resolucion: ValidationSchema = {
  params: id.params,
  body: Joi.object({ fundamento: Joi.string().trim().allow('').max(MAX_TEXTO_ANTICIPADA).default(''), confirm_password: Joi.string().required() }),
};

export const aplicar: ValidationSchema = {
  params: id.params,
  body: Joi.object({ grupo_destino_id: objectId.required() }),
};

export const nivelacion: ValidationSchema = {
  params: Joi.object({ id: objectId.required(), subjectId: objectId.required() }),
  body: Joi.object({ nota: Joi.number().required() }),
};

export const anular: ValidationSchema = {
  params: id.params,
  body: Joi.object({ motivo: Joi.string().trim().min(10).max(500).required() }),
};
