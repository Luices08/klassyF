import Joi from 'joi';
import {
  TODAS_LAS_DECISIONES,
  ESTADOS_COMPROMISO,
  ESTADOS_SESION,
  FIRMAS_REQUERIDAS,
  INSTANCIAS_SESION,
  MAX_MIEMBROS_SESION,
  MAX_TEXTO_CASO,
  MAX_TEXTO_SESION,
  MAYORIAS,
  REPRESENTACIONES,
  RESPONSABLES_COMPROMISO,
  TIPOS_CASO,
  VOTOS,
} from '../constants/comision';
import { FALTAS_COMPUTABLES } from '../constants/promocion';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const texto = (max: number) => Joi.string().trim().allow('').max(max);

export const actualizarConfiguracion: ValidationSchema = {
  body: Joi.object({
    semaforo: Joi.object({
      amarillo_desde: Joi.number().integer().min(1).max(50).required(),
      naranja_desde: Joi.number().integer().min(1).max(50).required(),
      rojo_desde: Joi.number().integer().min(1).max(50).required(),
      inasistencia_roja_pct: Joi.number().min(1).max(100).required(),
      faltas: Joi.string().valid(...FALTAS_COMPUTABLES).required(),
    }).required(),
    reprobacion_masiva: Joi.object({ porcentaje: Joi.number().min(1).max(100).required(), minimo_estudiantes: Joi.number().integer().min(1).max(500).required() }).required(),
    quorum_porcentaje: Joi.number().min(1).max(100).required(),
    mayoria: Joi.string().valid(...MAYORIAS).required(),
    firmas_requeridas: Joi.string().valid(...FIRMAS_REQUERIDAS).required(),
  }),
};

export const tablero: ValidationSchema = {
  query: Joi.object({ academic_year_id: objectId.required(), periodo_numero: Joi.number().integer().min(1).max(12).required(), group_id: objectId, grade_id: objectId, sede_id: objectId }),
};

export const ficha: ValidationSchema = {
  params: Joi.object({ studentId: objectId.required() }),
  query: Joi.object({ academic_year_id: objectId.required() }),
};

const miembro = Joi.object({
  user_id: objectId.allow(null),
  nombre: Joi.string().trim().max(120),
  cargo: Joi.string().trim().max(120).required(),
  representa: Joi.string().valid(...REPRESENTACIONES),
  es_presidente: Joi.boolean(),
});

export const crearSesion: ValidationSchema = {
  body: Joi.object({
    instancia: Joi.string().valid(...INSTANCIAS_SESION).required(),
    academic_year_id: objectId.required(),
    periodo_numero: Joi.number().integer().min(1).max(12).allow(null),
    grados_ids: Joi.array().items(objectId).default([]),
    fecha: Joi.date().required(),
    hora: Joi.string().trim().max(20).allow(''),
    lugar: Joi.string().trim().max(160).allow(''),
    orden_del_dia: texto(MAX_TEXTO_SESION),
    miembros: Joi.array().items(miembro).min(1).max(MAX_MIEMBROS_SESION).required(),
  }),
};

export const idSesion: ValidationSchema = { params: Joi.object({ id: objectId.required() }) };

export const listarSesiones: ValidationSchema = {
  query: Joi.object({ academic_year_id: objectId, instancia: Joi.string().valid(...INSTANCIAS_SESION), estado: Joi.string().valid(...ESTADOS_SESION) }),
};

export const actualizarSesion: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    fecha: Joi.date(),
    hora: Joi.string().trim().max(20).allow(''),
    lugar: Joi.string().trim().max(160).allow(''),
    orden_del_dia: texto(MAX_TEXTO_SESION),
    desarrollo: texto(MAX_TEXTO_SESION),
    conclusiones: texto(MAX_TEXTO_SESION),
    miembros: Joi.array().items(miembro).min(1).max(MAX_MIEMBROS_SESION),
    asistencia: Joi.array().items(Joi.object({ miembro_id: objectId.required(), asistio: Joi.boolean().required() })),
  }).min(1),
};

export const agregarCaso: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    student_id: objectId.required(),
    tipo: Joi.string().valid(...TIPOS_CASO).required(),
    promocion_anticipada_id: Joi.when('tipo', { is: 'PROMOCION_ANTICIPADA', then: objectId.required(), otherwise: Joi.forbidden() }),
  }),
};

export const actualizarCaso: ValidationSchema = {
  params: Joi.object({ id: objectId.required(), casoId: objectId.required() }),
  body: Joi.object({
    deliberacion: texto(MAX_TEXTO_CASO),
    recusados_ids: Joi.array().items(objectId),
    votos: Joi.array().items(Joi.object({ miembro_id: objectId.required(), voto: Joi.string().valid(...VOTOS).required() })).max(MAX_MIEMBROS_SESION),
    decision: Joi.object({ tipo: Joi.string().valid(...TODAS_LAS_DECISIONES).required(), fundamento: texto(MAX_TEXTO_CASO) }).allow(null),
  }).min(1),
};

export const quitarCaso: ValidationSchema = { params: Joi.object({ id: objectId.required(), casoId: objectId.required() }) };

export const agregarCompromiso: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    student_id: objectId.required(),
    caso_id: objectId.allow(null),
    responsable_tipo: Joi.string().valid(...RESPONSABLES_COMPROMISO).required(),
    responsable_user_id: objectId.allow(null),
    responsable_nombre: Joi.string().trim().max(120),
    descripcion: Joi.string().trim().min(5).max(1000).required(),
    fecha_limite: Joi.date().required(),
  }),
};

export const actualizarCompromiso: ValidationSchema = {
  params: Joi.object({ id: objectId.required(), compromisoId: objectId.required() }),
  body: Joi.object({ estado: Joi.string().valid(...ESTADOS_COMPROMISO), seguimiento: Joi.string().trim().min(3).max(1000) }).min(1),
};

export const firmar: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({ confirm_password: Joi.string().required() }),
};

export const anular: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({ motivo: Joi.string().trim().min(10).max(500).required() }),
};

