import Joi from 'joi';
import { FAMILIAS_OBSERVACION, MAX_COMENTARIO_OBSERVACION, MAX_ESTUDIANTES_POR_EVENTO, TIPOS_SITUACION } from '../constants/convivencia';
import { ESTADOS_USUARIO } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

// La fecha del hecho es un día de calendario (YYYY-MM-DD), no un instante: así no se corre por zona horaria.
const fechaDeCalendario = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .message('"{{#label}}" debe tener el formato YYYY-MM-DD.');

const idParam: ValidationSchema = { params: Joi.object({ id: objectId.required() }) };
const cambioDeEstado: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({ estado: Joi.string().valid(...ESTADOS_USUARIO).required() }),
};

export const listarCatalogo: ValidationSchema = {
  query: Joi.object({ incluir_inactivos: Joi.boolean() }),
};

// --- Tipos de observación ---

const camposTipo = {
  nombre: Joi.string().trim().max(60),
  visible_estudiante: Joi.boolean(),
  orden: Joi.number().integer().min(0),
};

export const crearTipo: ValidationSchema = {
  body: Joi.object({
    ...camposTipo,
    nombre: camposTipo.nombre.required(),
    familia: Joi.string().valid(...FAMILIAS_OBSERVACION).required(),
  }),
};
export const actualizarTipo: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object(camposTipo).min(1),
};
export const cambiarEstadoTipo = cambioDeEstado;
export const eliminarTipo = idParam;

// --- Categorías ---

const camposCategoria = {
  nombre: Joi.string().trim().max(80),
  orden: Joi.number().integer().min(0),
};

export const crearCategoria: ValidationSchema = {
  body: Joi.object({ ...camposCategoria, nombre: camposCategoria.nombre.required() }),
};
export const actualizarCategoria: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object(camposCategoria).min(1),
};
export const cambiarEstadoCategoria = cambioDeEstado;
export const eliminarCategoria = idParam;

// --- Descriptores (frases y faltas del manual) ---

const camposDescriptor = {
  categoria_id: objectId.allow(null),
  codigo: Joi.string().trim().max(20).allow(null),
  texto: Joi.string().trim().max(400),
  tipo_situacion: Joi.string().valid(...TIPOS_SITUACION).allow(null),
  descuento_decimas: Joi.number().min(0).max(5).allow(null),
  orden: Joi.number().integer().min(0),
};

export const crearDescriptor: ValidationSchema = {
  body: Joi.object({
    ...camposDescriptor,
    tipo_id: objectId.required(),
    texto: camposDescriptor.texto.required(),
  }),
};
export const actualizarDescriptor: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object(camposDescriptor).min(1),
};
export const cambiarEstadoDescriptor = cambioDeEstado;
export const eliminarDescriptor = idParam;

// --- Política ---

export const actualizarConfiguracion: ValidationSchema = {
  body: Joi.object({
    plazo_enmienda_horas: Joi.number().integer().min(0).max(720),
    plazo_anulacion_horas: Joi.number().integer().min(0).max(720),
  }).min(1),
};

// --- Observaciones ---

export const buscarEstudiantes: ValidationSchema = {
  query: Joi.object({ group_id: objectId, q: Joi.string().trim().max(60) }),
};

export const registrarObservacion: ValidationSchema = {
  body: Joi.object({
    estudiantes_ids: Joi.array().items(objectId).min(1).max(MAX_ESTUDIANTES_POR_EVENTO).required(),
    tipo_id: objectId.required(),
    descriptores_ids: Joi.array().items(objectId).max(30).default([]),
    comentario: Joi.string().trim().max(MAX_COMENTARIO_OBSERVACION).allow(''),
    fecha_hecho: fechaDeCalendario.required(),
    en_nombre_de_id: objectId,
  }),
};

const paginacion = {
  pagina: Joi.number().integer().min(1).default(1),
  limite: Joi.number().integer().min(1).max(50).default(20),
};

export const historialDeEstudiante: ValidationSchema = {
  params: Joi.object({ studentId: objectId.required() }),
  query: Joi.object(paginacion),
};
export const listarMisObservaciones: ValidationSchema = { query: Joi.object(paginacion) };
export const obtenerObservacion = idParam;

export const enmendarObservacion: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    descriptores_ids: Joi.array().items(objectId).max(30),
    comentario: Joi.string().trim().max(MAX_COMENTARIO_OBSERVACION).allow(''),
  }).min(1),
};

export const anularObservacion: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({ motivo: Joi.string().trim().min(5).max(500).required() }),
};
