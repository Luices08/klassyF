import Joi from 'joi';
import { ROLES_LIST } from '../constants/roles';
import { MAX_CUERPO_ANUNCIO, MAX_TITULO_ANUNCIO } from '../constants/notificaciones';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const conId = Joi.object({ id: objectId.required() });

export const listar: ValidationSchema = {
  query: Joi.object({ solo_no_leidas: Joi.boolean(), limite: Joi.number().integer().min(1).max(100) }),
};

export const idNotificacion: ValidationSchema = { params: conId };

export const visto: ValidationSchema = {
  body: Joi.object({
    // Una ruta interna de la app: evita que el cliente guarde texto arbitrario como «pantalla».
    ruta: Joi.string().pattern(/^\/[A-Za-z0-9/_-]{0,80}$/).required(),
    pestana: Joi.string().pattern(/^[a-z0-9-]{1,40}$/).allow(''),
  }),
};

const cuerpoAnuncio = {
  titulo: Joi.string().trim().min(3).max(MAX_TITULO_ANUNCIO),
  cuerpo: Joi.string().trim().min(3).max(MAX_CUERPO_ANUNCIO),
  roles_destino: Joi.array().items(Joi.string().valid(...ROLES_LIST)).min(1).unique(),
  publicar_desde: Joi.date().iso(),
  vence_el: Joi.date().iso().allow(null),
  fijado: Joi.boolean(),
};

export const crearAnuncio: ValidationSchema = {
  body: Joi.object({ ...cuerpoAnuncio, titulo: cuerpoAnuncio.titulo.required(), cuerpo: cuerpoAnuncio.cuerpo.required(), roles_destino: cuerpoAnuncio.roles_destino.required() }),
};

export const actualizarAnuncio: ValidationSchema = {
  params: conId,
  body: Joi.object(cuerpoAnuncio).min(1),
};

export const idAnuncio: ValidationSchema = { params: conId };
