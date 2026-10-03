import Joi from 'joi';
import {
  MAX_COMPROMISO,
  MAX_DESCRIPCION_OBSERVACION,
  MAX_ESTUDIANTES_POR_EVENTO,
  ROLES_INVOLUCRADO,
} from '../constants/convivencia';
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
  body: Joi.object({ ...camposTipo, nombre: camposTipo.nombre.required() }),
};
export const actualizarTipo: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object(camposTipo).min(1),
};
export const cambiarEstadoTipo = cambioDeEstado;
export const eliminarTipo = idParam;

// --- Política ---

export const actualizarConfiguracion: ValidationSchema = {
  body: Joi.object({
    plazo_enmienda_horas: Joi.number().integer().min(0).max(720),
    plazo_anulacion_horas: Joi.number().integer().min(0).max(720),
    plazo_remision_tipo_iii_horas: Joi.number().integer().min(0).max(720),
    quorum_porcentaje: Joi.number().integer().min(1).max(100),
    retencion_anios_observaciones: Joi.number().integer().min(1).max(100).allow(null),
    retencion_anios_casos: Joi.number().integer().min(1).max(100).allow(null),
  }).min(1),
};

// --- Observaciones y faltas ---

export const buscarEstudiantes: ValidationSchema = {
  query: Joi.object({ group_id: objectId, q: Joi.string().trim().max(60) }),
};

const descripcion = Joi.string().trim().max(MAX_DESCRIPCION_OBSERVACION);
const compromiso = Joi.string().trim().max(MAX_COMPROMISO).allow('');

export const registrarObservacion: ValidationSchema = {
  body: Joi.object({
    estudiantes_ids: Joi.array().items(objectId).min(1).max(MAX_ESTUDIANTES_POR_EVENTO).required(),
    tipo_id: objectId.required(),
    descripcion: descripcion.min(1).required(),
    compromiso,
    requiere_citacion: Joi.boolean(),
    confidencial: Joi.boolean(),
    fecha_hecho: fechaDeCalendario.required(),
    en_nombre_de_id: objectId,
  }),
};

export const registrarFalta: ValidationSchema = {
  body: Joi.object({
    falta_id: objectId.required(),
    fecha_hecho: fechaDeCalendario.required(),
    hechos: descripcion.min(1).required(),
    version_estudiante: descripcion.allow(''),
    compromiso,
    acciones_contencion: Joi.string().trim().max(1000).allow(''),
    remitir_comite: Joi.boolean(),
    involucrados: Joi.array()
      .items(Joi.object({ student_id: objectId.required(), rol: Joi.string().valid(...ROLES_INVOLUCRADO).required() }))
      .min(1)
      .max(MAX_ESTUDIANTES_POR_EVENTO)
      .required(),
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
    descripcion: descripcion.min(1),
    compromiso,
    requiere_citacion: Joi.boolean(),
    confidencial: Joi.boolean(),
    version_estudiante: descripcion.allow(''),
  }).min(1),
};

export const anularObservacion: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({ motivo: Joi.string().trim().min(5).max(500).required() }),
};

// --- Seguimiento ---

export const agregarSeguimiento: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({ nota: Joi.string().trim().min(3).max(500).required() }),
};

export const marcarCompromiso: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    estado: Joi.string().valid('CUMPLIDO', 'INCUMPLIDO').required(),
    nota: Joi.string().trim().max(500).allow(''),
  }),
};

export const registrarCitacionRealizada: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    fecha: fechaDeCalendario.required(),
    resultado: Joi.string().trim().max(500).allow(''),
  }),
};
