import Joi from 'joi';
import {
  ESTADOS_CASO,
  ESTADOS_PASO_PROTOCOLO,
  MEDIOS_CITACION,
  PARTES_DESCARGO,
  RESULTADOS_CIERRE_CASO,
  ROLES_INVOLUCRADO,
  TIPOS_NOTIFICACION_CASO,
  TIPOS_SITUACION,
} from '../constants/convivencia';
import { ESTADOS_USUARIO } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { COLECCIONES_REGISTRO_CASO } from '../services/caso.service';
import { objectId } from './common.validator';

const fechaDeCalendario = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .message('"{{#label}}" debe tener el formato YYYY-MM-DD.');
const tipoSituacion = Joi.string().valid(...TIPOS_SITUACION);
const motivo = Joi.string().trim().min(5).max(1000).required();
const idParam = { params: Joi.object({ id: objectId.required() }) };
const paginacion = {
  pagina: Joi.number().integer().min(1).default(1),
  limite: Joi.number().integer().min(1).max(50).default(20),
};

// --- Catálogos del caso ---

export const listarCatalogosCaso: ValidationSchema = { query: Joi.object({ incluir_inactivos: Joi.boolean() }) };

const camposMedida = {
  nombre: Joi.string().trim().max(120),
  descripcion: Joi.string().trim().max(1000).allow(''),
  se_aplica_por_dias: Joi.boolean(),
  orden: Joi.number().integer().min(0),
};
export const crearMedida: ValidationSchema = { body: Joi.object({ ...camposMedida, nombre: camposMedida.nombre.required() }) };
export const actualizarMedida: ValidationSchema = { params: idParam.params, body: Joi.object(camposMedida).min(1) };

const camposEntidad = {
  nombre: Joi.string().trim().max(150),
  descripcion: Joi.string().trim().max(500).allow(''),
  orden: Joi.number().integer().min(0),
};
export const crearEntidad: ValidationSchema = { body: Joi.object({ ...camposEntidad, nombre: camposEntidad.nombre.required() }) };
export const actualizarEntidad: ValidationSchema = { params: idParam.params, body: Joi.object(camposEntidad).min(1) };

export const cambiarEstadoCatalogoCaso: ValidationSchema = {
  params: idParam.params,
  body: Joi.object({ estado: Joi.string().valid(...ESTADOS_USUARIO).required() }),
};
export const eliminarCatalogoCaso: ValidationSchema = idParam;

export const guardarProtocolo: ValidationSchema = {
  params: Joi.object({ tipo: tipoSituacion.required() }),
  body: Joi.object({
    pasos: Joi.array()
      .items(Joi.object({ nombre: Joi.string().trim().max(200).required(), obligatorio: Joi.boolean().default(false) }))
      .max(40)
      .required(),
  }),
};

// --- Casos ---

export const abrirCaso: ValidationSchema = {
  body: Joi.object({
    tipo_situacion: tipoSituacion.required(),
    fecha_hecho: fechaDeCalendario.required(),
    lugar: Joi.string().trim().max(200).allow(''),
    hechos: Joi.string().trim().min(10).max(4000).required(),
    como_se_conocio: Joi.string().trim().max(300).allow(''),
    involucrados: Joi.array()
      .items(Joi.object({ student_id: objectId.required(), rol: Joi.string().valid(...ROLES_INVOLUCRADO).required() }))
      .max(30),
    observacion_id: objectId,
  }),
};

export const listarCasos: ValidationSchema = {
  query: Joi.object({
    estado: Joi.string().valid(...ESTADOS_CASO),
    tipo_situacion: tipoSituacion,
    sede_id: objectId,
    ...paginacion,
  }),
};

export const obtenerCaso: ValidationSchema = idParam;

export const cambiarEstadoCaso: ValidationSchema = {
  params: idParam.params,
  body: Joi.object({ estado: Joi.string().valid(...ESTADOS_CASO).required() }),
};

export const reclasificarCaso: ValidationSchema = {
  params: idParam.params,
  body: Joi.object({ tipo_situacion: tipoSituacion.required(), motivo }),
};

export const registrarAtencion: ValidationSchema = {
  params: idParam.params,
  body: Joi.object({ descripcion: Joi.string().trim().min(5).max(2000).required(), hubo_dano: Joi.boolean() }),
};

export const actualizarPaso: ValidationSchema = {
  params: Joi.object({ id: objectId.required(), pasoId: objectId.required() }),
  body: Joi.object({ estado: Joi.string().valid(...ESTADOS_PASO_PROTOCOLO).required(), nota: Joi.string().trim().max(1000).allow('') }),
};

const ESQUEMAS_REGISTRO: Record<string, Joi.ObjectSchema> = {
  seguimientos: Joi.object({
    fecha: fechaDeCalendario.required(),
    nota: Joi.string().trim().min(3).max(2000).required(),
    proxima_fecha: fechaDeCalendario.allow(null),
  }),
  notificaciones: Joi.object({
    tipo: Joi.string().valid(...TIPOS_NOTIFICACION_CASO).required(),
    fecha: fechaDeCalendario.required(),
    medio: Joi.string().valid(...MEDIOS_CITACION).required(),
    dirigida_a: Joi.string().trim().max(120).allow(''),
    resultado: Joi.string().trim().max(500).allow(''),
  }),
  descargos: Joi.object({
    parte: Joi.string().valid(...PARTES_DESCARGO).required(),
    student_id: objectId,
    fecha: fechaDeCalendario.required(),
    texto: Joi.string().trim().min(3).max(3000).required(),
  }),
  'medidas-proteccion': Joi.object({
    fecha: fechaDeCalendario.required(),
    descripcion: Joi.string().trim().min(5).max(1000).required(),
  }),
  remisiones: Joi.object({
    entidad_id: objectId.required(),
    fecha: fechaDeCalendario.required(),
    oficio: Joi.string().trim().max(120).allow(''),
    funcionario: Joi.string().trim().max(120).allow(''),
    respuesta: Joi.string().trim().max(1000).allow(''),
  }),
  'medidas-aplicadas': Joi.object({
    medida_id: objectId.required(),
    fecha: fechaDeCalendario.required(),
    dias: Joi.number().integer().min(1).max(365),
    observaciones: Joi.string().trim().max(1000).allow(''),
  }),
};

export const coleccionesRegistroCaso: readonly string[] = COLECCIONES_REGISTRO_CASO;
export const esquemaDeRegistro = (coleccion: string): Joi.ObjectSchema | undefined => ESQUEMAS_REGISTRO[coleccion];

export const registrarDecision: ValidationSchema = {
  params: idParam.params,
  body: Joi.object({
    motivacion: Joi.string().trim().min(20).max(4000).required(),
    descriptores_ids: Joi.array().items(objectId).max(30),
  }),
};

export const cerrarCaso: ValidationSchema = {
  params: idParam.params,
  body: Joi.object({
    resultado: Joi.string().valid(...RESULTADOS_CIERRE_CASO).required(),
    motivo,
    justificacion_sin_remision: Joi.string().trim().max(1000).allow(''),
  }),
};

export const accionConMotivo: ValidationSchema = { params: idParam.params, body: Joi.object({ motivo }) };

export const declararImpedimento: ValidationSchema = {
  params: idParam.params,
  body: Joi.object({ motivo, usuario_id: objectId }),
};
