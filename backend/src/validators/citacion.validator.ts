import Joi from 'joi';
import {
  ESTADOS_CITACION,
  MAX_DESCRIPCION_CITACION,
  MAX_GRUPOS_POR_CITACION,
  MAX_LUGAR_CITACION,
  MAX_MOTIVO_CANCELACION,
  MAX_TITULO_CITACION,
  MOTIVOS_CITACION,
  RESPUESTAS_DEL_ACUDIENTE,
  TIPOS_CITACION,
} from '../constants/citaciones';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const idParam = Joi.object({ id: objectId.required() });
const titulo = Joi.string().trim().min(3).max(MAX_TITULO_CITACION);
const descripcion = Joi.string().trim().allow('').max(MAX_DESCRIPCION_CITACION);
const lugar = Joi.string().trim().min(2).max(MAX_LUGAR_CITACION);

export const listar: ValidationSchema = {
  query: Joi.object({
    academic_year_id: objectId.required(),
    estado: Joi.string().valid(...ESTADOS_CITACION),
    search: Joi.string().trim().allow('').max(100),
  }),
};

export const estudiantes: ValidationSchema = { query: Joi.object({ group_id: objectId.required() }) };

export const crear: ValidationSchema = {
  body: Joi.object({
    tipo: Joi.string()
      .valid(...TIPOS_CITACION)
      .required(),
    motivo: Joi.string()
      .valid(...MOTIVOS_CITACION)
      .required(),
    titulo: titulo.required(),
    descripcion,
    fecha_hora: Joi.date().iso().required(),
    lugar: lugar.required(),
    // Una citación general lleva grupos; una particular, un estudiante (el servicio rechaza la combinación contraria).
    grupo_ids: Joi.array().items(objectId).max(MAX_GRUPOS_POR_CITACION),
    student_id: objectId,
    todos_los_acudientes: Joi.boolean(),
    // Solo convivencia enlaza una citación a un caso (el servicio comprueba que el estudiante sea parte del caso).
    caso_id: objectId,
  }),
};

export const detalle: ValidationSchema = { params: idParam };

export const actualizar: ValidationSchema = {
  params: idParam,
  body: Joi.object({
    motivo: Joi.string().valid(...MOTIVOS_CITACION),
    titulo,
    descripcion,
    fecha_hora: Joi.date().iso(),
    lugar,
  }).min(1),
};

export const cancelar: ValidationSchema = {
  params: idParam,
  body: Joi.object({ motivo: Joi.string().trim().min(5).max(MAX_MOTIVO_CANCELACION).required() }),
};

export const reenviar: ValidationSchema = { params: Joi.object({ id: objectId.required(), destinatarioId: objectId.required() }) };

// --- Enlace del correo y portal ---
const respuesta = Joi.object({
  respuesta: Joi.string()
    .valid(...RESPUESTAS_DEL_ACUDIENTE)
    .required(),
});

export const conToken: ValidationSchema = { params: Joi.object({ token: Joi.string().trim().max(64).required() }) };
export const responderPorToken: ValidationSchema = { params: Joi.object({ token: Joi.string().trim().max(64).required() }), body: respuesta };

export const responderEnPortal: ValidationSchema = {
  params: Joi.object({ studentId: objectId.required(), destinatarioId: objectId.required() }),
  body: respuesta,
};
