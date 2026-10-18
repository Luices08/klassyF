import Joi from 'joi';
import { ESTADOS_PAZ_Y_SALVO_SALIDA, MAX_LONGITUD_MOTIVO_SALIDA, MAX_LONGITUD_OBSERVACION_SALIDA, TIPOS_SALIDA } from '../constants/salidas';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const idParam = Joi.object({ id: objectId.required() });
const texto = (max: number) => Joi.string().trim().allow('').max(max);

export const listar: ValidationSchema = {
  query: Joi.object({
    academic_year_id: objectId.required(),
    tipo: Joi.string().valid(...TIPOS_SALIDA),
    estado_paz_y_salvo: Joi.string().valid(...ESTADOS_PAZ_Y_SALVO_SALIDA),
    search: texto(100),
  }),
};

export const matriculasDisponibles: ValidationSchema = {
  query: Joi.object({ academic_year_id: objectId.required() }),
};

export const registrar: ValidationSchema = {
  body: Joi.object({
    enrollment_id: objectId.required(),
    tipo: Joi.string()
      .valid(...TIPOS_SALIDA)
      .required(),
    // Un día de calendario (AAAA-MM-DD); si falta, es hoy. El servicio rechaza una fecha futura o anterior a la matrícula.
    fecha_efectiva: Joi.date().iso(),
    motivo: Joi.string().trim().min(5).max(MAX_LONGITUD_MOTIVO_SALIDA).required(),
    observaciones: texto(MAX_LONGITUD_OBSERVACION_SALIDA),
    institucion_receptora: Joi.object({
      nombre: Joi.string().trim().min(2).max(200).required(),
      codigo_dane: texto(20),
      municipio: texto(120),
    }).allow(null),
  }),
};

export const detalle: ValidationSchema = { params: idParam };
export const soporte: ValidationSchema = { params: idParam };
export const soporteId: ValidationSchema = { params: Joi.object({ id: objectId.required(), soporteId: objectId.required() }) };

export const actuarSobreDependencia: ValidationSchema = {
  params: Joi.object({ id: objectId.required(), clave: Joi.string().trim().max(40).required() }),
  body: Joi.object({
    accion: Joi.string()
      .valid('APROBACION', 'BLOQUEO', 'EXCEPCION', 'ANULACION')
      .required(),
    motivo: texto(MAX_LONGITUD_MOTIVO_SALIDA),
  }),
};

export const boletin: ValidationSchema = { params: idParam };
