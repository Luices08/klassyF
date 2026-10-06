import Joi from 'joi';
import { COMPONENTES_SIEE } from '../../../constants/enums';
import { ValidationSchema } from '../../../middlewares/validate.middleware';
import { objectId } from '../../../validators/common.validator';

export const createActivity: ValidationSchema = {
  body: Joi.object({
    teacher_assignment_id: objectId.required(),
    periodo_numero: Joi.number().integer().min(1).max(4).required(),
    titulo: Joi.string().required(),
    descripcion: Joi.string().required(),
    componente_siee: Joi.string()
      .valid(...COMPONENTES_SIEE)
      .required(),
    peso_en_componente: Joi.number().min(0).required(),
    fecha_apertura: Joi.date().required(),
    fecha_entrega: Joi.date().min(Joi.ref('fecha_apertura')).required(),
    dba_id: objectId.allow(null),
  }),
};

export const listActivities: ValidationSchema = {
  query: Joi.object({
    teacher_assignment_id: objectId,
    periodo: Joi.number().integer().min(1).max(4),
  }),
};

export const submissionParams: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
};

export const createSubmission: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    texto_entrega: Joi.string().allow(''),
    archivo_url: Joi.string().uri().allow(''),
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
