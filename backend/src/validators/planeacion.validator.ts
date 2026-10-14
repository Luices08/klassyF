import Joi from 'joi';
import { ESTADOS_AREA, NIVELES_EDUCATIVOS } from '../constants/enums';
import {
  ALCANCES_JORNADA,
  DECISIONES_REVISION,
  ESTADOS_PLAN,
  MAX_COMENTARIO_REVISION,
  MAX_DESCRIPCION_PLAN,
  MAX_TITULO_PLAN,
} from '../constants/planeacion';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

// Los formularios con archivo viajan como multipart: todo llega como texto y Joi convierte lo numérico. Una lista se envía
// repitiendo el campo (una sola ocurrencia llega como texto suelto, por eso `.single()`).

const titulo = Joi.string().trim().min(1).max(MAX_TITULO_PLAN);
const descripcion = Joi.string().trim().min(1).max(MAX_DESCRIPCION_PLAN);
const gradosIds = Joi.array().items(objectId).single().min(1).unique();
const periodo = Joi.number().integer().min(1).max(4);

export const idParam: ValidationSchema = { params: Joi.object({ id: objectId.required() }) };

// --- Documentos de referencia ---

export const listarDocumentos: ValidationSchema = {
  query: Joi.object({ area_id: objectId, grade_id: objectId }),
};

export const crearDocumento: ValidationSchema = {
  body: Joi.object({
    titulo: titulo.required(),
    descripcion: Joi.string().trim().max(MAX_DESCRIPCION_PLAN).allow(''),
    area_id: objectId.required(),
    grados_ids: gradosIds.required(),
  }),
};

// Solo datos (JSON) y nada es obligatorio; el PDF se reemplaza por su propia ruta.
export const actualizarDocumento: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    titulo,
    descripcion: Joi.string().trim().max(MAX_DESCRIPCION_PLAN).allow(''),
    area_id: objectId,
    grados_ids: gradosIds,
  }),
};

// --- Ventana de entrega de planes de aula ---

export const listarVentanas: ValidationSchema = {
  query: Joi.object({ academic_year_id: objectId.required() }),
};

export const configurarVentana: ValidationSchema = {
  params: Joi.object({ academic_year_id: objectId.required(), numero: periodo.required() }),
  // null devuelve la fecha sugerida; omitir un campo lo deja como está.
  body: Joi.object({
    fecha_apertura: Joi.date().iso().allow(null),
    fecha_limite: Joi.date().iso().allow(null),
  }).min(1),
};

// --- Revisión (compartida por plan de área y plan de aula) ---

export const revisarPlan: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    decision: Joi.string()
      .valid(...DECISIONES_REVISION)
      .required(),
    comentario: Joi.when('decision', {
      is: 'DEVUELTO',
      then: Joi.string()
        .trim()
        .min(1)
        .max(MAX_COMENTARIO_REVISION)
        .required()
        .messages({
          'any.required': 'Para devolver el plan debes escribir un comentario: es lo que el docente va a corregir.',
          'string.empty': 'Para devolver el plan debes escribir un comentario: es lo que el docente va a corregir.',
        }),
      otherwise: Joi.string().trim().max(MAX_COMENTARIO_REVISION).allow(''),
    }),
  }),
};

export const reabrirPlan: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    motivo: Joi.string()
      .trim()
      .min(1)
      .max(MAX_COMENTARIO_REVISION)
      .required()
      .messages({ 'any.required': 'Escribe el motivo de la reapertura.', 'string.empty': 'Escribe el motivo de la reapertura.' }),
  }),
};

export const archivoDePlan: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  query: Joi.object({ version: Joi.number().integer().min(1) }),
};

// --- Líderes de área ---

const nivelesLider = Joi.array()
  .items(Joi.string().valid(...NIVELES_EDUCATIVOS))
  .unique();
const jornadaLider = Joi.string().valid(...ALCANCES_JORNADA);
const sedesLider = Joi.array().items(objectId).unique();

export const listarLideresArea: ValidationSchema = {
  query: Joi.object({ area_id: objectId, incluir_inactivos: Joi.boolean() }),
};

export const crearLiderArea: ValidationSchema = {
  body: Joi.object({
    area_id: objectId.required(),
    docente_id: objectId.required(),
    // Vacío o ausente = todos los niveles / todas las sedes; sin jornada = todas.
    niveles: nivelesLider,
    jornada: jornadaLider,
    sedes_ids: sedesLider,
  }),
};

export const actualizarLiderArea: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    docente_id: objectId,
    niveles: nivelesLider,
    jornada: jornadaLider,
    sedes_ids: sedesLider,
    estado: Joi.string().valid(...ESTADOS_AREA),
  }).min(1),
};

// --- Plan de área ---

export const listarPlanesArea: ValidationSchema = {
  query: Joi.object({ academic_year_id: objectId.required() }),
};

export const radicarPlanArea: ValidationSchema = {
  body: Joi.object({
    academic_year_id: objectId.required(),
    // El plan es del líder (lo que cubre), no del área entera: un área grande tiene un líder por nivel o por jornada.
    lider_area_id: objectId.required(),
    titulo: titulo.required(),
    descripcion: descripcion.required(),
  }),
};

// --- Plan de aula ---

export const misPlanesAula: ValidationSchema = {
  query: Joi.object({ academic_year_id: objectId.required() }),
};

export const bandejaPlanesAula: ValidationSchema = {
  query: Joi.object({
    academic_year_id: objectId.required(),
    periodo_numero: periodo,
    area_id: objectId,
    grade_id: objectId,
    docente_id: objectId,
    estado: Joi.string().valid(...ESTADOS_PLAN, 'SIN_CARGAR'),
  }),
};

export const radicarPlanAula: ValidationSchema = {
  body: Joi.object({
    academic_year_id: objectId.required(),
    periodo_numero: periodo.required(),
    subject_id: objectId.required(),
    grade_id: objectId.required(),
    titulo: titulo.required(),
    descripcion: descripcion.required(),
  }),
};

export const adoptarPlanAula: ValidationSchema = {
  body: Joi.object({ plan_origen_id: objectId.required() }),
};

export const planDeAulaDeAsignacion: ValidationSchema = {
  query: Joi.object({ teacher_assignment_id: objectId.required(), periodo_numero: periodo.required() }),
};
