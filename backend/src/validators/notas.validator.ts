import Joi from 'joi';
import { MAX_FIRMAS_PLANILLA } from '../constants/notas';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const periodo = Joi.number().integer().min(1).max(4);
const planillaRef = { teacher_assignment_id: objectId.required(), periodo_numero: periodo.required() };

export const obtenerPlanilla: ValidationSchema = {
  query: Joi.object(planillaRef),
};

// El rango real de la nota (nota_minima/nota_maxima del año) lo valida el servicio, que conoce el año lectivo de la clase.
export const guardarCeldas: ValidationSchema = {
  body: Joi.object({
    ...planillaRef,
    celdas: Joi.array()
      .items(
        Joi.object({
          student_id: objectId.required(),
          // Una casilla es una actividad de M11 o una nota suelta de la planilla: ambas se identifican por su _id.
          casilla_id: objectId.required(),
          nota: Joi.number().min(0).required(),
        })
      )
      .min(1)
      .max(2000)
      .required(),
  }),
};

const bloqueClave = Joi.string().pattern(/^[A-Z0-9_]{2,40}$/);
// null = peso automático (se reparte en partes iguales con las demás casillas sin peso del bloque).
const pesoCasilla = Joi.number().min(0).max(100).allow(null);

export const crearCasilla: ValidationSchema = {
  body: Joi.object({
    ...planillaRef,
    bloque_clave: bloqueClave.required(),
    nombre: Joi.string().trim().min(1).max(60).required(),
    peso: pesoCasilla,
  }),
};

export const actualizarCasilla: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    nombre: Joi.string().trim().min(1).max(60),
    bloque_clave: bloqueClave,
    peso: pesoCasilla,
  }).min(1),
};

export const eliminarCasilla: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const establecerPesos: ValidationSchema = {
  body: Joi.object({
    ...planillaRef,
    pesos: Joi.array()
      .items(Joi.object({ casilla_id: objectId.required(), peso: pesoCasilla.required() }))
      .min(1)
      .max(200)
      .required(),
  }),
};

export const cerrarPlanilla: ValidationSchema = {
  body: Joi.object(planillaRef),
};

export const reabrirPlanilla: ValidationSchema = {
  body: Joi.object({ ...planillaRef, motivo: Joi.string().trim().min(5).max(500).required() }),
};

export const declararDefinitivas: ValidationSchema = {
  body: Joi.object({
    academic_year_id: objectId.required(),
    periodo_numero: periodo.required(),
    group_id: objectId,
    teacher_assignment_id: objectId,
  }),
};

export const seguimiento: ValidationSchema = {
  query: Joi.object({ academic_year_id: objectId.required(), periodo_numero: periodo.required(), group_id: objectId }),
};

// Solo presentación: ninguna de estas opciones cambia una nota ni el cálculo.
export const actualizarPlantilla: ValidationSchema = {
  body: Joi.object({
    titulo: Joi.string().trim().min(1).max(120),
    subtitulo: Joi.string().trim().allow('').max(160),
    pie: Joi.string().trim().allow('').max(300),
    mostrar_logo: Joi.boolean(),
    columnas: Joi.object({
      documento: Joi.boolean(),
      promedios_componente: Joi.boolean(),
      pesos: Joi.boolean(),
      desempeno: Joi.boolean(),
      estado: Joi.boolean(),
    }).min(1),
    firmas: Joi.array()
      .items(
        Joi.object({
          cargo: Joi.string().trim().min(1).max(60).required(),
          nombre: Joi.string().trim().allow('').max(80).default(''),
          usa_docente: Joi.boolean().default(false),
        })
      )
      .max(MAX_FIRMAS_PLANILLA),
  }).min(1),
};
