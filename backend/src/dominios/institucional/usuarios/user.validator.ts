import Joi from 'joi';
import { ESTADOS_USUARIO, ROLES, TIPOS_DOCUMENTO } from '../../../constants/enums';
import { ValidationSchema } from '../../../middlewares/validate.middleware';
import { objectId } from '../../../validators/common.validator';

const sedesIds = Joi.array().items(objectId);
// Foto de perfil como data URI (base64), tope ~300KB para no inflar el documento.
const fotoUrl = Joi.string().dataUri().max(400_000).allow(null);

export const createUser: ValidationSchema = {
  body: Joi.object({
    nombre: Joi.string().required(),
    apellido: Joi.string().required(),
    tipo_documento: Joi.string()
      .valid(...TIPOS_DOCUMENTO)
      .required(),
    numero_documento: Joi.string().required(),
    email: Joi.string().email().required(),
    telefono: Joi.string().allow(''),
    password: Joi.string().min(8).required(),
    rol: Joi.string()
      .valid(...ROLES)
      .required(),
    estado: Joi.string().valid(...ESTADOS_USUARIO),
    sedes_ids: sedesIds,
  }),
};

const roleOrRolesString = Joi.string().custom((value, helpers) => {
  const parts = value.split(',').map((s: string) => s.trim()).filter(Boolean);
  for (const p of parts) {
    if (!ROLES.includes(p as (typeof ROLES)[number])) {
      return helpers.error('any.invalid');
    }
  }
  return value;
});

export const listUsers: ValidationSchema = {
  query: Joi.object({
    rol: Joi.alternatives().try(Joi.string().valid(...ROLES), roleOrRolesString),
    roles: Joi.alternatives().try(Joi.array().items(Joi.string().valid(...ROLES)), roleOrRolesString),
    estado: Joi.string().valid(...ESTADOS_USUARIO),
    sede_id: objectId,
    search: Joi.string().allow(''),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
  }),
};

export const updateUser: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    nombre: Joi.string(),
    apellido: Joi.string(),
    tipo_documento: Joi.string().valid(...TIPOS_DOCUMENTO),
    numero_documento: Joi.string(),
    email: Joi.string().email(),
    telefono: Joi.string().allow(''),
    rol: Joi.string().valid(...ROLES),
    sedes_ids: sedesIds,
    // Reseteo de contraseña: el admin asigna una nueva, nunca se expone la anterior (esta hasheada).
    password: Joi.string().min(8),
  }).min(1),
};

export const actualizarEstado: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    estado: Joi.string()
      .valid(...ESTADOS_USUARIO)
      .required(),
    // Motivo libre (suspension/bloqueo): no se persiste en el usuario, solo queda en la bitacora.
    motivo: Joi.string().allow(''),
  }),
};

export const eliminarUsuario: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
};

export const resetearPassword: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
};

export const cerrarSesiones: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
};

export const actualizarMiPerfil: ValidationSchema = {
  body: Joi.object({
    telefono: Joi.string().allow(''),
    foto_url: fotoUrl,
  }).min(1),
};

export const cambiarMiPassword: ValidationSchema = {
  body: Joi.object({
    password_actual: Joi.string().required(),
    password_nueva: Joi.string().min(8).required(),
  }),
};
