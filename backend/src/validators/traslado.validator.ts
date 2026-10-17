import Joi from 'joi';
import {
  MAX_CONCEPTOS_ESCALA_EXTERNA,
  MAX_PERIODOS_ORIGEN,
  MAX_RANGOS_ESCALA_EXTERNA,
  METODOS_CONVERSION,
  TIPOS_ESCALA_EXTERNA,
} from '../constants/traslados';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const texto = (max: number) => Joi.string().trim().allow('').max(max);

const camposTraslado = {
  fecha_ingreso: Joi.date().iso().required(),
  periodo_ingreso: Joi.number().integer().min(1).max(12).required(),
  institucion_procedencia: Joi.object({
    nombre: Joi.string().trim().min(2).max(200).required(),
    codigo_dane: texto(20),
    municipio: texto(120),
    calendario: texto(40),
  }).required(),
  periodos_origen: Joi.array()
    .items(Joi.object({ nombre: Joi.string().trim().min(1).max(60).required(), fecha_inicio: Joi.date().iso().allow(null), fecha_fin: Joi.date().iso().allow(null) }))
    .min(1)
    .max(MAX_PERIODOS_ORIGEN)
    .required(),
  escala_externa_id: objectId.allow(null).required(),
  correspondencia: Joi.array().items(
    Joi.object({
      periodo_numero: Joi.number().integer().min(1).required(),
      fuentes: Joi.array()
        .items(Joi.object({ indice_origen: Joi.number().integer().min(0).required(), peso: Joi.number().min(0).max(100).required() }))
        .max(MAX_PERIODOS_ORIGEN)
        .required(),
    })
  ),
  observaciones: texto(1000),
};

const idParam = Joi.object({ id: objectId.required() });

export const listar: ValidationSchema = { query: Joi.object({ academic_year_id: objectId.required(), search: Joi.string().allow('') }) };
export const matriculasDisponibles: ValidationSchema = { query: Joi.object({ academic_year_id: objectId.required() }) };
export const crear: ValidationSchema = { body: Joi.object({ enrollment_id: objectId.required(), ...camposTraslado }) };
export const actualizar: ValidationSchema = { params: idParam, body: Joi.object(camposTraslado) };
export const detalle: ValidationSchema = { params: idParam };

const filas = Joi.array()
  .items(
    Joi.object({
      subject_id: objectId.required(),
      exenta: Joi.boolean().required(),
      motivo: texto(500),
      asignatura_origen: texto(120),
      valores: Joi.array()
        .items(Joi.object({ indice_origen: Joi.number().integer().min(0).required(), valor_original: Joi.string().trim().allow('').max(40).required() }))
        .max(MAX_PERIODOS_ORIGEN)
        .required(),
    })
  )
  .min(1)
  .max(80)
  .required();

export const vistaPrevia: ValidationSchema = { params: idParam, body: Joi.object({ filas }) };
export const guardarHomologacion: ValidationSchema = { params: idParam, body: Joi.object({ filas, motivo_cambio: texto(500) }) };

export const soporte: ValidationSchema = { params: idParam };
export const soporteId: ValidationSchema = { params: Joi.object({ id: objectId.required(), soporteId: objectId.required() }) };

// --- Escalas externas (M32) ---

const camposEscala = Joi.object({
  nombre: Joi.string().trim().min(2).max(80).required(),
  descripcion: texto(300),
  tipo: Joi.string().valid(...TIPOS_ESCALA_EXTERNA).required(),
  valor_minimo: Joi.number().allow(null),
  valor_maximo: Joi.number().allow(null),
  valor_aprobatorio: Joi.number().allow(null),
  metodo: Joi.string().valid(...METODOS_CONVERSION),
  rangos: Joi.array()
    .items(Joi.object({ desde: Joi.number().required(), hasta: Joi.number().required(), nota: Joi.number().min(0).required() }))
    .max(MAX_RANGOS_ESCALA_EXTERNA),
  conceptos: Joi.array()
    .items(Joi.object({ concepto: Joi.string().trim().min(1).max(60).required(), abreviatura: texto(10), nota: Joi.number().min(0).required() }))
    .max(MAX_CONCEPTOS_ESCALA_EXTERNA),
});

export const listarEscalas: ValidationSchema = { query: Joi.object({ solo_activas: Joi.boolean() }) };
export const crearEscala: ValidationSchema = { body: camposEscala };
export const actualizarEscala: ValidationSchema = { params: idParam, body: camposEscala };
export const estadoEscala: ValidationSchema = { params: idParam, body: Joi.object({ estado: Joi.string().valid('activo', 'inactivo').required() }) };
export const eliminarEscala: ValidationSchema = { params: idParam };
