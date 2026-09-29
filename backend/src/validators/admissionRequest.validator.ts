import Joi from 'joi';
import { ESTADOS_SOLICITUD } from '../models/admissionRequest.model';
import { JORNADAS, TIPOS_DOCUMENTO, TIPOS_DOCUMENTO_MATRICULA } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const crearSolicitud: ValidationSchema = {
  body: Joi.object({
    nombre_aspirante: Joi.string().required(),
    apellido_aspirante: Joi.string().required(),
    tipo_documento: Joi.string()
      .valid(...TIPOS_DOCUMENTO)
      .required(),
    numero_documento: Joi.string().required(),
    fecha_nacimiento: Joi.date().required(),
    grado_deseado_id: objectId.required(),
    sede_deseada_id: objectId,
    jornada_deseada: Joi.string().valid(...JORNADAS),
    acudiente_nombre: Joi.string().required(),
    acudiente_apellido: Joi.string().required(),
    acudiente_telefono: Joi.string().required(),
    acudiente_email: Joi.string().email().required(),
    observaciones: Joi.string().allow(''),
  }),
};

export const consultarEstado: ValidationSchema = {
  query: Joi.object({
    numero_documento: Joi.string().required(),
    fecha_nacimiento: Joi.date().required(),
  }),
};

const credencialesPreinscripcion = {
  numero_documento: Joi.string().required(),
  fecha_nacimiento: Joi.date().required(),
};

export const descargarComprobante: ValidationSchema = {
  body: Joi.object(credencialesPreinscripcion),
};

export const subirDocumentoPublico: ValidationSchema = {
  params: Joi.object({
    tipoDocumento: Joi.string()
      .valid(...TIPOS_DOCUMENTO_MATRICULA)
      .required(),
  }),
  body: Joi.object(credencialesPreinscripcion),
};

export const listarSolicitudes: ValidationSchema = {
  query: Joi.object({
    estado: Joi.string().valid(...ESTADOS_SOLICITUD),
    search: Joi.string().allow(''),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
  }),
};

export const obtenerSolicitud: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const aprobarSolicitud: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    group_id: objectId.required(),
    academic_year_id: objectId.required(),
    fecha_limite_legalizacion: Joi.date().greater('now'),
  }),
};

export const rechazarSolicitud: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    motivo: Joi.string().required(),
  }),
};
