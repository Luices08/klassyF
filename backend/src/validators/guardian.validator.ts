import Joi from 'joi';
import { ESTADOS_USUARIO, PARENTESCOS, TIPOS_DOCUMENTO } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

/** Requerido solo cuando no se manda `guardian_id` (es decir, se esta registrando un acudiente nuevo). */
function requeridoSiEsNuevo(schema: Joi.StringSchema): Joi.StringSchema {
  return schema.when('guardian_id', {
    is: Joi.exist(),
    // Joi usa `then` como clave de configuración, no como un thenable.
    // oxlint-disable-next-line unicorn/no-thenable
    then: Joi.optional(),
    otherwise: Joi.required(),
  });
}

export const listarAcudientes: ValidationSchema = {
  query: Joi.object({
    search: Joi.string().allow(''),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
  }),
};

export const estudiantesDeAcudiente: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const listarAcudientesDeEstudiante: ValidationSchema = {
  params: Joi.object({ userId: objectId.required() }),
};

export const vincularAcudiente: ValidationSchema = {
  params: Joi.object({ userId: objectId.required() }),
  body: Joi.object({
    guardian_id: objectId,
    tipo_documento: requeridoSiEsNuevo(Joi.string().valid(...TIPOS_DOCUMENTO)),
    numero_documento: requeridoSiEsNuevo(Joi.string()),
    nombre: requeridoSiEsNuevo(Joi.string()),
    apellido: requeridoSiEsNuevo(Joi.string()),
    telefono_principal: requeridoSiEsNuevo(Joi.string()),
    telefono_secundario: Joi.string().allow(''),
    email: Joi.string().email().allow(''),
    ocupacion: Joi.string().allow(''),
    direccion: Joi.string().allow(''),
    parentesco: Joi.string()
      .valid(...PARENTESCOS)
      .required(),
    es_principal: Joi.boolean(),
    autorizado_retiro: Joi.boolean(),
    habilitar_portal: Joi.boolean(),
  }),
};

export const actualizarVinculo: ValidationSchema = {
  params: Joi.object({ userId: objectId.required(), relationId: objectId.required() }),
  body: Joi.object({
    parentesco: Joi.string().valid(...PARENTESCOS),
    es_principal: Joi.boolean(),
    autorizado_retiro: Joi.boolean(),
    habilitar_portal: Joi.boolean(),
  }).min(1),
};

export const desvincularAcudiente: ValidationSchema = {
  params: Joi.object({ userId: objectId.required(), relationId: objectId.required() }),
};

export const actualizarAcudiente: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    // Corregir el documento lo permite el servicio solo a ADMIN y SECRETARIA (es también el usuario de la cuenta del portal).
    tipo_documento: Joi.string().valid(...TIPOS_DOCUMENTO),
    numero_documento: Joi.string().trim().pattern(/^[A-Za-z0-9]{3,20}$/).messages({ 'string.pattern.base': 'El documento solo lleva letras y números (3 a 20), sin puntos ni espacios.' }),
    nombre: Joi.string(),
    apellido: Joi.string(),
    telefono_principal: Joi.string(),
    telefono_secundario: Joi.string().allow(''),
    email: Joi.string().email().allow(''),
    ocupacion: Joi.string().allow(''),
    direccion: Joi.string().allow(''),
  }).min(1),
};

export const actualizarEstadoAcudiente: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    estado: Joi.string()
      .valid(...ESTADOS_USUARIO)
      .required(),
  }),
};
