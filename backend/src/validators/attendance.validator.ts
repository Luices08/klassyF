import Joi from 'joi';
import { ESTADOS_JUSTIFICACION, ESTADOS_USUARIO, TONOS_ESTADO_ASISTENCIA } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { DIMENSIONES_ESTADISTICA } from '../services/attendanceStats.service';
import { objectId } from './common.validator';

// Las fechas de la planilla son días de calendario (YYYY-MM-DD), no instantes: así no se corren por zona horaria.
const fechaDeClase = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .message('"{{#label}}" debe tener el formato YYYY-MM-DD.');

const periodo = Joi.number().integer().min(1).max(4);

const camposEstado = {
  nombre: Joi.string().trim().max(40),
  abreviatura: Joi.string().trim().max(3),
  tono: Joi.string().valid(...TONOS_ESTADO_ASISTENCIA),
  cuenta_como_falla: Joi.boolean(),
  es_retardo: Joi.boolean(),
  es_justificada: Joi.boolean(),
  es_predeterminado: Joi.boolean(),
  orden: Joi.number().integer().min(0),
};

export const listarEstados: ValidationSchema = {
  query: Joi.object({ incluir_inactivos: Joi.boolean() }),
};

export const crearEstado: ValidationSchema = {
  body: Joi.object({
    ...camposEstado,
    nombre: camposEstado.nombre.required(),
    abreviatura: camposEstado.abreviatura.required(),
  }),
};

export const actualizarEstado: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object(camposEstado).min(1),
};

export const cambiarEstadoActivo: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({ estado: Joi.string().valid(...ESTADOS_USUARIO).required() }),
};

export const obtenerPlanilla: ValidationSchema = {
  query: Joi.object({
    group_id: objectId.required(),
    subject_id: objectId.required(),
    fecha: fechaDeClase.required(),
  }),
};

export const registrarAsistencia: ValidationSchema = {
  body: Joi.object({
    group_id: objectId.required(),
    subject_id: objectId.required(),
    fecha: fechaDeClase.required(),
    registros: Joi.array()
      .items(
        Joi.object({
          student_id: objectId.required(),
          state_id: objectId.required(),
          novedad: Joi.string().trim().max(500).allow(''),
        })
      )
      .min(1)
      .required(),
  }),
};

export const listarInasistencias: ValidationSchema = {
  query: Joi.object({
    student_id: objectId.required(),
    academic_year_id: objectId.required(),
    periodo_numero: periodo,
  }),
};

export const obtenerEstadisticas: ValidationSchema = {
  query: Joi.object({
    academic_year_id: objectId.required(),
    agrupar_por: Joi.string()
      .valid(...DIMENSIONES_ESTADISTICA)
      .required(),
    periodo_numero: periodo,
    group_id: objectId,
    subject_id: objectId,
    student_id: objectId,
  }),
};

export const listarJustificaciones: ValidationSchema = {
  query: Joi.object({
    academic_year_id: objectId.required(),
    estado: Joi.string().valid(...ESTADOS_JUSTIFICACION),
    student_id: objectId,
    group_id: objectId,
  }),
};

export const crearJustificacion: ValidationSchema = {
  body: Joi.object({
    attendance_id: objectId.required(),
    registro_id: objectId.required(),
    motivo: Joi.string().trim().min(3).max(1000).required(),
    acudiente_id: objectId,
  }),
};

export const revisarJustificacion: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    estado: Joi.string().valid('APROBADA', 'RECHAZADA').required(),
    comentario: Joi.string().trim().max(500).allow(''),
  }),
};

export const idParam: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
};

// --- Planilla clásica (cuadrícula mensual) y PDFs ---

const mes = Joi.string()
  .pattern(/^\d{4}-(0[1-9]|1[0-2])$/)
  .message('"{{#label}}" debe tener el formato YYYY-MM.');

export const listarClases: ValidationSchema = {
  query: Joi.object({
    academic_year_id: objectId.required(),
    group_id: objectId,
  }),
};

export const obtenerCuadricula: ValidationSchema = {
  query: Joi.object({
    group_id: objectId.required(),
    subject_id: objectId.required(),
    mes: mes.required(),
  }),
};

export const guardarCuadricula: ValidationSchema = {
  body: Joi.object({
    group_id: objectId.required(),
    subject_id: objectId.required(),
    dias: Joi.array()
      .items(
        Joi.object({
          fecha: fechaDeClase.required(),
          registros: Joi.array()
            .items(
              Joi.object({
                student_id: objectId.required(),
                state_id: objectId.required(),
                novedad: Joi.string().trim().max(500).allow(''),
              })
            )
            .min(1)
            .required(),
        })
      )
      .min(1)
      .max(31)
      .required(),
  }),
};

export const pdfPlanilla: ValidationSchema = {
  query: Joi.object({
    group_id: objectId.required(),
    subject_id: objectId.required(),
    mes,
    periodo_numero: periodo,
  }).xor('mes', 'periodo_numero'),
};

export const pdfConsolidadoGrupo: ValidationSchema = {
  query: Joi.object({ group_id: objectId.required(), periodo_numero: periodo }),
};

export const pdfReporteInstitucional: ValidationSchema = {
  query: Joi.object({ academic_year_id: objectId.required(), periodo_numero: periodo }),
};

export const pdfFichaEstudiante: ValidationSchema = {
  query: Joi.object({ student_id: objectId.required(), academic_year_id: objectId.required(), periodo_numero: periodo }),
};
