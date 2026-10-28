import Joi from 'joi';
import { ESTADOS_SOLICITUD } from '../models/admissionRequest.model';
import { JORNADAS, PARENTESCOS, TIPOS_DOCUMENTO } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { claveDocumento, objectId } from './common.validator';

export const crearSolicitud: ValidationSchema = {
  body: Joi.object({
    primer_nombre: Joi.string().trim().max(60),
    segundo_nombre: Joi.string().trim().allow('').max(60),
    primer_apellido: Joi.string().trim().max(60),
    segundo_apellido: Joi.string().trim().allow('').max(60),
    nombre_aspirante: Joi.string(),
    apellido_aspirante: Joi.string(),
    tipo_documento: Joi.string()
      .valid(...TIPOS_DOCUMENTO)
      .required(),
    numero_documento: Joi.string().required(),
    fecha_nacimiento: Joi.date().required(),
    grado_deseado_id: objectId.required(),
    sede_deseada_id: objectId.allow('', null),
    jornada_deseada: Joi.string().valid(...JORNADAS).allow('', null),
    academic_year_id: objectId.allow('', null),
    acudiente_nombre: Joi.string().required(),
    acudiente_apellido: Joi.string().required(),
    acudiente_tipo_documento: Joi.string().valid(...TIPOS_DOCUMENTO),
    acudiente_numero_documento: Joi.string().trim().min(3).max(20),
    acudiente_telefono: Joi.string().required(),
    acudiente_email: Joi.string().email().required(),
    observaciones: Joi.string().allow(''),
    apoyo_declarado: Joi.object({
      motivo_declarado: Joi.string().trim().min(3).max(500).required(),
      aporta_soporte: Joi.boolean().default(false),
      observacion: Joi.string().trim().allow('').max(2000),
    }),
  }),
};

export const registrarInscripcion: ValidationSchema = {
  body: (crearSolicitud.body as Joi.ObjectSchema).keys({
    acudiente_tipo_documento: Joi.string()
      .valid(...TIPOS_DOCUMENTO)
      .required(),
    acudiente_numero_documento: Joi.string().trim().min(3).max(20).required(),
    acudiente_parentesco: Joi.string().valid(...PARENTESCOS),
  }),
};

export const documentoDeSolicitud: ValidationSchema = {
  params: Joi.object({ id: objectId.required(), tipoDocumento: claveDocumento.required() }),
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
    tipoDocumento: claveDocumento.required(),
  }),
  body: Joi.object(credencialesPreinscripcion),
};

export const listarSolicitudes: ValidationSchema = {
  query: Joi.object({
    estado: Joi.string().valid(...ESTADOS_SOLICITUD),
    academic_year_id: objectId,
    grade_id: objectId,
    search: Joi.string().allow(''),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
  }),
};

export const cuposDeAdmision: ValidationSchema = {
  query: Joi.object({ academic_year_id: objectId.required() }),
};
export const cuposDePrematricula = cuposDeAdmision;

export const obtenerSolicitud: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const aprobarYMatricular: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    group_id: objectId.required(),
    academic_year_id: objectId.required(),
    trae_todos: Joi.string().valid('SI', 'NO').default('SI'),
    fecha_limite_compromiso: Joi.date().allow(null, ''),
    fecha_limite_legalizacion: Joi.date().allow(null, ''),
  }),
};
export const aprobarSolicitud = aprobarYMatricular;

export const rechazarSolicitud: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    motivo: Joi.string().required(),
  }),
};
