import Joi from 'joi';
import { ESTADOS_TITULACION } from '../constants/titulacion';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const estudianteParam: ValidationSchema = { params: Joi.object({ studentId: objectId.required() }) };

/** Llega como multipart: los números y las fechas viajan como texto y Joi los convierte. El archivo lo trae multer en `file`. */
export const registrarServicioSocial: ValidationSchema = {
  body: Joi.object({
    student_id: objectId.required(),
    horas: Joi.number().min(0.5).max(2000).required(),
    entidad: Joi.string().trim().max(160).required(),
    descripcion: Joi.string().trim().allow('').max(500),
    fecha_inicio: Joi.date().allow(null),
    fecha_fin: Joi.date().min(Joi.ref('fecha_inicio')).allow(null),
  }),
};

export const verificarServicioSocial: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({ decision: Joi.string().valid('VERIFICAR', 'RECHAZAR').required(), motivo: Joi.string().trim().allow('').max(500) }),
};

export const soporteServicioSocial: ValidationSchema = { params: Joi.object({ id: objectId.required() }) };

export const anularServicioSocial: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({ motivo: Joi.string().trim().min(10).max(500).required() }),
};

export const registrarSaber11: ValidationSchema = {
  params: Joi.object({ studentId: objectId.required() }),
  body: Joi.object({ codigo_registro: Joi.string().trim().min(4).max(40).required(), fecha_presentacion: Joi.date().allow(null) }),
};

export const listarTitulaciones: ValidationSchema = {
  query: Joi.object({ academic_year_id: objectId.required(), estado: Joi.string().valid(...ESTADOS_TITULACION) }),
};

export const reevaluar: ValidationSchema = {
  body: Joi.object({ student_id: objectId.required(), academic_year_id: objectId.required() }),
};
