import Joi from 'joi';
import { ESTADOS_ESPACIO, RECURSOS_ESPACIO, TIPOS_ESPACIO } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const datosEditables = {
  nombre: Joi.string().trim().required(),
  tipo_espacio: Joi.string()
    .valid(...TIPOS_ESPACIO)
    .required(),
  capacidad: Joi.number().integer().min(1).required(),
  piso_bloque: Joi.string().trim().allow('', null),
  recursos: Joi.array()
    .items(Joi.string().valid(...RECURSOS_ESPACIO))
    .unique(),
  computadores_operativos: Joi.number().integer().min(0),
  areas_exclusivas: Joi.array().items(objectId).unique(),
  admite_grupos_simultaneos: Joi.boolean(),
};

export const listarEspacios: ValidationSchema = {
  query: Joi.object({
    sede_id: objectId,
    tipo_espacio: Joi.string().valid(...TIPOS_ESPACIO),
    estado: Joi.string().valid(...ESTADOS_ESPACIO),
    academic_year_id: objectId,
  }),
};

export const crearEspacio: ValidationSchema = {
  body: Joi.object({ sede_id: objectId.required(), ...datosEditables }),
};

export const actualizarEspacio: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object(datosEditables),
};

export const cambiarEstadoEspacio: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    estado: Joi.string()
      .valid(...ESTADOS_ESPACIO)
      .required(),
  }),
};

export const eliminarEspacio: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
};
