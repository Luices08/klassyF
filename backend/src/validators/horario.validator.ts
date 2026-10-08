import Joi from 'joi';
import { ESTADOS_USUARIO } from '../constants/enums';
import {
  ORDENES_CONSECUTIVAS,
  PESO_MAX_VARIABLE,
  PESO_MIN_VARIABLE,
  SEVERIDADES_VARIABLE_HORARIO,
  TIPOS_ALCANCE_HORARIO,
  TIPOS_VARIABLE_HORARIO,
  TipoVariableHorario,
  VALORES_DISPONIBILIDAD,
} from '../constants/horarios';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const entero = (min: number) => Joi.number().integer().min(min);
const sinParametros = Joi.object({});

// Forma de `parametros` según el tipo. Que una celda caiga dentro de la jornada (día hábil, periodo existente) lo revisa
// el servicio, que sí conoce la jornada.
const PARAMETROS: Record<TipoVariableHorario, Joi.ObjectSchema> = {
  DISTRIBUCION_BLOQUES: Joi.object({ bloques: Joi.array().items(entero(1).max(12)).min(1).max(20).required() }),
  REUNION_COLECTIVA: Joi.object({
    nombre: Joi.string().trim().max(80).required(),
    duracion: entero(1).max(12).required(),
    sesiones: entero(1).max(10).default(1),
  }),
  DISPONIBILIDAD: Joi.object({
    celdas: Joi.array()
      .items(
        Joi.object({
          dia: entero(1).max(7).required(),
          periodo: entero(0).max(30).required(),
          valor: Joi.string()
            .valid(...VALORES_DISPONIBILIDAD)
            .required(),
        })
      )
      .unique((a, b) => a.dia === b.dia && a.periodo === b.periodo)
      .min(1)
      .required(),
  }),
  NO_MISMO_DIA: sinParametros,
  NO_CONSECUTIVAS: Joi.object({ descanso_separa: Joi.boolean().default(true) }),
  DISTRIBUCION_SEMANAL: Joi.object({ max_sesiones_dia: entero(1), min_dias_distintos: entero(1).max(7) }).or(
    'max_sesiones_dia',
    'min_dias_distintos'
  ),
  MISMO_DIA: sinParametros,
  CONSECUTIVAS: Joi.object({
    orden: Joi.string()
      .valid(...ORDENES_CONSECUTIVAS)
      .default('ARBITRARIO'),
  }),
  RECREO_NO_INTERRUMPE: sinParametros,
  MISMA_FRANJA_CADA_DIA: sinParametros,
  MAX_HORAS_DIA_GRUPO: Joi.object({ max: entero(1).required() }),
  MAX_HUECOS_GRUPO: Joi.object({ max_por_dia: entero(0).required() }),
  SIMULTANEAS: sinParametros,
  MISMO_DIA_ENTRE_GRUPOS: sinParametros,
  MAX_HORAS_DIA_DOCENTE: Joi.object({ max: entero(1).required() }),
  MAX_HUECOS_DOCENTE: Joi.object({ max_por_dia: entero(0).required() }),
  MAX_CONSECUTIVAS_DOCENTE: Joi.object({ max: entero(1).required(), descanso_separa: Joi.boolean().default(true) }),
  ESPACIO_REQUERIDO: Joi.object({ espacio_ids: Joi.array().items(objectId).unique().min(1).required() }),
};

const tipo = Joi.string().valid(...TIPOS_VARIABLE_HORARIO);

const datosVariable = {
  descripcion: Joi.string().trim().allow('').max(200),
  severidad: Joi.string().valid(...SEVERIDADES_VARIABLE_HORARIO),
  peso: entero(PESO_MIN_VARIABLE).max(PESO_MAX_VARIABLE),
  alcance: Joi.object({
    tipo: Joi.string()
      .valid(...TIPOS_ALCANCE_HORARIO)
      .required(),
    grade_ids: Joi.array().items(objectId).unique().default([]),
  }),
  asignatura_ids: Joi.array().items(objectId).unique(),
  docente_ids: Joi.array().items(objectId).unique(),
  es_excepcion: Joi.boolean(),
  // La forma de `parametros` depende del `tipo` hermano: se valida contra el esquema de ese tipo.
  parametros: Joi.object().custom((valor: unknown, helpers) => {
    const tipoVariable = (helpers.state.ancestors[0] as { tipo?: TipoVariableHorario }).tipo;
    const esquema = tipoVariable ? PARAMETROS[tipoVariable] : undefined;
    if (!esquema) return valor;
    const { value, error } = esquema.validate(valor, { stripUnknown: true, errors: { label: 'key' } });
    if (error) return helpers.message({ custom: `parametros: ${error.message}` });
    return value as unknown;
  }),
};

const contextoQuery = Joi.object({
  academic_year_id: objectId.required(),
  jornada_id: objectId.required(),
});

export const listarVariables: ValidationSchema = { query: contextoQuery };

export const crearVariable: ValidationSchema = {
  body: Joi.object({
    academic_year_id: objectId.required(),
    jornada_id: objectId.required(),
    tipo: tipo.required(),
    ...datosVariable,
    parametros: datosVariable.parametros.required(),
  }),
};

// El tipo no cambia al editar (cambiaría el significado de los parámetros): se envía solo para validar `parametros`.
export const actualizarVariable: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({ tipo: tipo.required(), ...datosVariable }),
};

export const cambiarEstadoVariable: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    estado: Joi.string()
      .valid(...ESTADOS_USUARIO)
      .required(),
  }),
};

export const eliminarVariable: ValidationSchema = { params: Joi.object({ id: objectId.required() }) };

export const obtenerInsumos: ValidationSchema = { query: contextoQuery };

export const listarHorarios: ValidationSchema = { query: contextoQuery };

export const generarHorario: ValidationSchema = {
  body: Joi.object({
    academic_year_id: objectId.required(),
    jornada_id: objectId.required(),
    nombre: Joi.string().trim().allow('').max(80),
    semilla: entero(0).max(2 ** 31 - 1),
    tiempo_max_ms: entero(1000).max(60_000),
    base_horario_id: objectId,
  }),
};

export const editarSesion: ValidationSchema = {
  params: Joi.object({ id: objectId.required(), sesionId: objectId.required() }),
  body: Joi.object({ dia: entero(1).max(7), periodo: entero(0).max(30), fija: Joi.boolean(), intercambiar_con: objectId })
    .and('dia', 'periodo')
    .oxor('dia', 'intercambiar_con')
    .or('dia', 'fija', 'intercambiar_con'),
};

export const pdfHorario: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  query: Joi.object({
    vista: Joi.string().valid('GRUPO', 'DOCENTE', 'GENERAL').required(),
    entidad_id: objectId,
  }),
};

export const obtenerHorario: ValidationSchema = { params: Joi.object({ id: objectId.required() }) };

export const publicarHorario: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({ confirm_password: Joi.string().required() }),
};

export const eliminarHorario: ValidationSchema = { params: Joi.object({ id: objectId.required() }) };
