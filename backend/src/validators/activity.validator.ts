import Joi from 'joi';
import { CLAVES_FORMATO_EVIDENCIA, ESTADOS_ACTIVIDAD_ESTUDIANTE, TIPOS_ACTIVIDAD } from '../constants/actividades';
import { COMPONENTES_SIEE } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const formatos = Joi.array()
  .items(Joi.string().valid(...CLAVES_FORMATO_EVIDENCIA))
  .unique();
const diaCalendario = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);

export const createActivity: ValidationSchema = {
  body: Joi.object({
    teacher_assignment_id: objectId.required(),
    periodo_numero: Joi.number().integer().min(1).max(4).required(),
    titulo: Joi.string().trim().max(150).required(),
    descripcion: Joi.string().trim().max(5000).required(),
    tipo: Joi.string()
      .valid(...TIPOS_ACTIVIDAD)
      .required(),
    componente_siee: Joi.string()
      .valid(...COMPONENTES_SIEE)
      .required(),
    peso_en_componente: Joi.number().min(0).required(),
    fecha_apertura: Joi.date().iso().required(),
    fecha_entrega: Joi.date().iso().min(Joi.ref('fecha_apertura')).required(),
    requiere_entrega: Joi.boolean(),
    formatos_permitidos: formatos,
    permite_entrega_tardia: Joi.boolean(),
    // Al menos uno de los dos: lo exige el servicio (necesita la planeación aprobada para validarlos).
    dba_id: objectId.allow(null),
    competencia_evaluada: Joi.string().trim().max(600).allow('', null),
    confirmar_alertas: Joi.boolean(),
  }),
};

export const updateActivity: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    titulo: Joi.string().trim().max(150),
    descripcion: Joi.string().trim().max(5000),
    tipo: Joi.string().valid(...TIPOS_ACTIVIDAD),
    componente_siee: Joi.string().valid(...COMPONENTES_SIEE),
    peso_en_componente: Joi.number().min(0),
    fecha_apertura: Joi.date().iso(),
    fecha_entrega: Joi.date().iso(),
    requiere_entrega: Joi.boolean(),
    formatos_permitidos: formatos,
    permite_entrega_tardia: Joi.boolean(),
    dba_id: objectId.allow(null),
    competencia_evaluada: Joi.string().trim().max(600).allow('', null),
    confirmar_alertas: Joi.boolean(),
  }).min(1),
};

export const idParam: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const listActivities: ValidationSchema = {
  query: Joi.object({
    academic_year_id: objectId,
    teacher_assignment_id: objectId,
    group_id: objectId,
    periodo: Joi.number().integer().min(1).max(4),
    tipo: Joi.string().valid(...TIPOS_ACTIVIDAD),
    desde: diaCalendario,
    hasta: diaCalendario,
  }),
};

export const revisionCalendario: ValidationSchema = {
  query: Joi.object({
    teacher_assignment_id: objectId.required(),
    periodo_numero: Joi.number().integer().min(1).max(4).required(),
    fecha_entrega: Joi.date().iso().required(),
    tipo: Joi.string()
      .valid(...TIPOS_ACTIVIDAD)
      .required(),
    excluir_id: objectId,
    exigir_futuro: Joi.boolean(),
  }),
};

export const listMisActividades: ValidationSchema = {
  query: Joi.object({
    subject_id: objectId,
    estado: Joi.string().valid(...ESTADOS_ACTIVIDAD_ESTUDIANTE),
    periodo: Joi.number().integer().min(1).max(4),
    desde: diaCalendario,
    hasta: diaCalendario,
  }),
};

export const createSubmission: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    texto_entrega: Joi.string().max(10000).allow(''),
  }),
};

const gradeEntrySchema = Joi.object({
  student_id: objectId.required(),
  // Sin tope fijo: la forma solo exige un numero no negativo. El rango real
  // (nota_minima/nota_maxima de la escala institucional del año) se valida en
  // el servicio, que sí conoce el año lectivo de la asignacion.
  calificacion_numerica: Joi.number().min(0).required(),
  retroalimentacion: Joi.string().allow(''),
});

export const gradeActivity: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  // Acepta calificar un solo estudiante o un lote (array) en el mismo endpoint.
  body: Joi.alternatives().try(gradeEntrySchema, Joi.array().items(gradeEntrySchema).min(1)),
};

export const actualizarConfiguracion: ValidationSchema = {
  body: Joi.object({
    max_evaluaciones_por_dia: Joi.number().integer().min(0).max(20),
    max_entregas_por_dia: Joi.number().integer().min(0).max(50),
  }).min(1),
};
