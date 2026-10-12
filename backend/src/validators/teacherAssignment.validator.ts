import Joi from 'joi';
import { ESTADOS_USUARIO, TIPOS_ASIGNACION_DOCENTE } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

// Cada tipo de asignacion exige/prohibe campos distintos (regla de oro de datos: una
// DIRECCION_GRUPO no lleva subject_id, un PROYECTO/OTRO no lleva group_id ni subject_id) — antes
// esto no se validaba en la frontera y quedaba aceptado y guardado sin control.
export const createTeacherAssignment: ValidationSchema = {
  body: Joi.object({
    docente_id: objectId.required(),
    academic_year_id: objectId.required(),
    tipo_asignacion: Joi.string()
      .valid(...TIPOS_ASIGNACION_DOCENTE)
      .default('CLASE'),
    group_id: Joi.alternatives().conditional('tipo_asignacion', {
      is: Joi.valid('CLASE', 'DIRECCION_GRUPO'),
      // oxlint-disable-next-line unicorn/no-thenable
      then: objectId.required(),
      otherwise: Joi.valid(null).optional(),
    }),
    subject_id: Joi.alternatives().conditional('tipo_asignacion', {
      is: 'CLASE',
      // oxlint-disable-next-line unicorn/no-thenable
      then: objectId.required(),
      otherwise: Joi.valid(null).optional(),
    }),
    horas_semanales: Joi.number().integer().min(0).max(50).default(0),
    reemplazar_director: Joi.boolean().default(false),
    proyecto_nombre: Joi.alternatives().conditional('tipo_asignacion', {
      is: Joi.valid('PROYECTO_TRANSVERSAL', 'OTRO'),
      // oxlint-disable-next-line unicorn/no-thenable
      then: Joi.string().trim().min(1).required(),
      otherwise: Joi.valid(null, '').optional(),
    }),
    observaciones: Joi.string().allow('', null).optional(),
  }),
};

export const listTeacherAssignments: ValidationSchema = {
  query: Joi.object({
    academic_year_id: objectId.optional(),
    docente_id: objectId.optional(),
    group_id: objectId.optional(),
    tipo_asignacion: Joi.string()
      .valid(...TIPOS_ASIGNACION_DOCENTE)
      .optional(),
    estado: Joi.string()
      .valid(...ESTADOS_USUARIO)
      .optional(),
  }),
};

export const docentesResumen: ValidationSchema = {
  query: Joi.object({
    academic_year_id: objectId.required(),
  }),
};

export const myLoad: ValidationSchema = {
  query: Joi.object({
    academic_year_id: objectId.optional(),
  }),
};

export const idParam: ValidationSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
};

export const guardarCargaDocenteLote: ValidationSchema = {
  body: Joi.object({
    docente_id: objectId.required(),
    academic_year_id: objectId.required(),
    direccion_grupo_id: objectId.allow(null, '').optional(),
    horas_direccion: Joi.number().integer().min(0).max(50).default(0),
    clases: Joi.array()
      .items(
        Joi.object({
          group_id: objectId.required(),
          subject_id: objectId.required(),
          observaciones: Joi.string().allow('', null).optional(),
        })
      )
      .default([]),
    proyectos: Joi.array()
      .items(
        Joi.object({
          proyecto_nombre: Joi.string().trim().min(1).required(),
          horas_semanales: Joi.number().integer().min(1).max(50).required(),
          observaciones: Joi.string().allow('', null).optional(),
        })
      )
      .default([]),
  }),
};

export const guardarMallaGrupoLote: ValidationSchema = {
  body: Joi.object({
    group_id: objectId.required(),
    academic_year_id: objectId.required(),
    director_grupo_id: objectId.allow(null, '').optional(),
    horas_direccion: Joi.number().integer().min(0).max(50).default(0),
    asignaciones: Joi.array()
      .items(
        Joi.object({
          subject_id: objectId.required(),
          docente_id: objectId.allow(null, '').optional(),
        })
      )
      .required(),
  }),
};

