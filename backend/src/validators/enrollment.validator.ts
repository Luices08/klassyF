import Joi from 'joi';
import { ESTADOS_DOCUMENTO_MATRICULA, ESTADOS_MATRICULA, TIPOS_DOCUMENTO_MATRICULA, TIPOS_INGRESO } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

// Lo que la familia declara sobre apoyos o diagnósticos previos (M16): secretaría transcribe, no valora ni rotula.
const apoyoDeclarado = Joi.object({
  motivo_declarado: Joi.string().trim().min(3).max(500).required(),
  aporta_soporte: Joi.boolean().default(false),
  observacion: Joi.string().trim().allow('').max(2000),
});

export const createEnrollment: ValidationSchema = {
  body: Joi.object({
    student_id: objectId.required(),
    group_id: objectId.required(),
    academic_year_id: objectId.required(),
    tipo_ingreso: Joi.string()
      .valid(...TIPOS_INGRESO)
      .required(),
    numero_libro: Joi.number().integer().min(1),
    estado_inicial: Joi.string().valid('MATRICULADO_CONDICIONAL', 'MATRICULADO_DEFINITIVO'),
    fecha_limite_compromiso: Joi.date(),
    forzar_sobrecupo: Joi.boolean(),
    apoyo_declarado: apoyoDeclarado,
  }),
};

export const listEnrollments: ValidationSchema = {
  query: Joi.object({
    academic_year_id: objectId,
    group_id: objectId,
    estado: Joi.string().valid(...ESTADOS_MATRICULA),
    search: Joi.string().allow(''),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
  }),
};

export const getEnrollment: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const updateStatus: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    estado: Joi.string()
      .valid(...ESTADOS_MATRICULA)
      .required(),
    motivo: Joi.string().allow(''),
    // Solo se usan al formalizar (PREINSCRITO -> MATRICULADO_*), que es cuando se asigna el folio.
    numero_libro: Joi.number().integer().min(1),
    fecha_limite_compromiso: Joi.date(),
  }),
};

export const cambiarGrupo: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({ group_id: objectId.required() }),
};

export const cargarDocumento: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
    tipoDocumento: Joi.string()
      .valid(...TIPOS_DOCUMENTO_MATRICULA)
      .required(),
  }),
};

export const revisarDocumento: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
    tipoDocumento: Joi.string()
      .valid(...TIPOS_DOCUMENTO_MATRICULA)
      .required(),
  }),
  body: Joi.object({
    estado: Joi.string()
      .valid(...ESTADOS_DOCUMENTO_MATRICULA.filter((e) => e === 'APROBADO' || e === 'RECHAZADO'))
      .required(),
    comentario: Joi.string().allow(''),
  }),
};

export const descargarDocumento: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
    tipoDocumento: Joi.string()
      .valid(...TIPOS_DOCUMENTO_MATRICULA)
      .required(),
  }),
};

export const descargarActa: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const agregarDocumentoChecklist: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    tipo_documento: Joi.string()
      .valid(...TIPOS_DOCUMENTO_MATRICULA)
      .required(),
    nombre_personalizado: Joi.string().trim().max(100).allow('', null),
    obligatorio: Joi.boolean().default(true),
  }),
};

export const eliminarDocumentoChecklist: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
    tipoDocumento: Joi.string()
      .valid(...TIPOS_DOCUMENTO_MATRICULA)
      .required(),
  }),
};

export const actualizarComentario: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
    tipoDocumento: Joi.string()
      .valid(...TIPOS_DOCUMENTO_MATRICULA)
      .required(),
  }),
  body: Joi.object({
    comentario: Joi.string().trim().max(500).allow('', null).optional(),
  }),
};
