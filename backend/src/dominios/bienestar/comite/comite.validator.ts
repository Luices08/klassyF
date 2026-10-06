import Joi from 'joi';
import { TIPOS_SESION_COMITE } from '../comun/convivencia.constants';
import { ESTADOS_USUARIO } from '../../../constants/enums';
import { ValidationSchema } from '../../../middlewares/validate.middleware';
import { objectId } from '../../../validators/common.validator';

const fechaDeCalendario = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .message('"{{#label}}" debe tener el formato YYYY-MM-DD.');
const hora = Joi.string()
  .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
  .message('"{{#label}}" debe tener el formato HH:MM.');
const idParam = { params: Joi.object({ id: objectId.required() }) };
const anioQuery = Joi.object({ academic_year_id: objectId, incluir_inactivos: Joi.boolean() });

export const listarMiembros: ValidationSchema = { query: anioQuery };

const camposMiembro = {
  cargo: Joi.string().trim().max(80),
  nombre: Joi.string().trim().max(120),
  usuario_id: objectId.allow(null),
  documento: Joi.string().trim().max(30).allow(''),
  es_presidente: Joi.boolean(),
};

export const crearMiembro: ValidationSchema = {
  query: Joi.object({ academic_year_id: objectId }),
  // Si es un usuario del sistema el nombre sale de su cuenta; si es una designación externa, el nombre es obligatorio.
  body: Joi.object({ ...camposMiembro, cargo: camposMiembro.cargo.required() }).or('nombre', 'usuario_id'),
};
export const actualizarMiembro: ValidationSchema = { params: idParam.params, body: Joi.object(camposMiembro).min(1) };
export const cambiarEstadoMiembro: ValidationSchema = {
  params: idParam.params,
  body: Joi.object({ estado: Joi.string().valid(...ESTADOS_USUARIO).required() }),
};
export const eliminarMiembro: ValidationSchema = idParam;

export const listarSesiones: ValidationSchema = { query: Joi.object({ academic_year_id: objectId }) };
export const obtenerSesion: ValidationSchema = idParam;

export const crearSesion: ValidationSchema = {
  body: Joi.object({
    tipo: Joi.string().valid(...TIPOS_SESION_COMITE).required(),
    fecha: fechaDeCalendario.required(),
    hora,
    lugar: Joi.string().trim().max(200).allow(''),
    orden_del_dia: Joi.string().trim().max(3000).allow(''),
  }),
};

export const actualizarSesion: ValidationSchema = {
  params: idParam.params,
  body: Joi.object({
    tipo: Joi.string().valid(...TIPOS_SESION_COMITE),
    fecha: fechaDeCalendario,
    hora: hora.allow(''),
    lugar: Joi.string().trim().max(200).allow(''),
    orden_del_dia: Joi.string().trim().max(3000).allow(''),
    desarrollo: Joi.string().trim().max(8000).allow(''),
    asistencia: Joi.array().items(Joi.object({ miembro_id: objectId.required(), asistio: Joi.boolean().required() })).max(60),
    casos_tratados: Joi.array()
      .items(
        Joi.object({
          caso_id: objectId.required(),
          decisiones: Joi.string().trim().max(3000).allow(''),
          recusados_ids: Joi.array().items(objectId).max(60),
        })
      )
      .max(50),
  }).min(1),
};

export const firmarSesion: ValidationSchema = idParam;
export const verificarIntegridad: ValidationSchema = idParam;
export const agregarAnexo: ValidationSchema = {
  params: idParam.params,
  body: Joi.object({ texto: Joi.string().trim().min(5).max(3000).required() }),
};
export const anularSesion: ValidationSchema = {
  params: idParam.params,
  body: Joi.object({ motivo: Joi.string().trim().min(5).max(1000).required() }),
};
export const descargarActa: ValidationSchema = idParam;
