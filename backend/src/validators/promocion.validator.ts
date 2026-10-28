import Joi from 'joi';
import { NIVELES_EDUCATIVOS } from '../constants/enums';
import { CRITERIOS_DESEMPATE } from '../constants/rematricula';
import { GRADO_TITULACION } from '../constants/titulacion';
import {
  ACCIONES_REGLA,
  CONDICIONES_ARRASTRE,
  CONSECUENCIAS_INCUMPLIR_ARRASTRE,
  EFECTOS_IMPRESCINDIBLES,
  EFECTOS_NOTA_RECUPERACION,
  FALTAS_COMPUTABLES,
  FILTROS_CRITICIDAD,
  MAX_CARACTERES_TEXTO_SIEE_PROMOCION,
  MAX_CONDICIONES_POR_REGLA,
  MAX_NOMBRE_REGLA,
  MAX_REGLAS_PROMOCION,
  RESULTADOS_PROMOCION,
  MODOS_LISTA,
  MOMENTOS_PROMOCION,
  NIVELES_ACCION_SIN_REGLA,
  TIPOS_CONDICION,
  UNIDADES_PROMOCION,
} from '../constants/promocion';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const ids = Joi.array().items(objectId).default([]);
const accionSinRegla = Joi.string()
  .valid(...NIVELES_ACCION_SIN_REGLA)
  .required();

const condicion = Joi.object({
  tipo: Joi.string()
    .valid(...TIPOS_CONDICION)
    .required(),
  n: Joi.number().integer().min(0).max(1000).allow(null),
  porcentaje: Joi.number().min(0).max(100).allow(null),
  nota: Joi.number().min(0).allow(null),
  filtro: Joi.string()
    .valid(...FILTROS_CRITICIDAD)
    .allow(null),
  faltas: Joi.string()
    .valid(...FALTAS_COMPUTABLES)
    .allow(null),
  modo: Joi.string()
    .valid(...MODOS_LISTA)
    .allow(null),
  unidad: Joi.string().valid('ASIGNATURA', 'AREA').allow(null),
  subject_ids: ids,
  area_ids: ids,
  gravedad: Joi.string().trim().max(10).allow(null),
});

const regla = Joi.object({
  clave: Joi.string().trim().required(),
  nombre: Joi.string().trim().max(MAX_NOMBRE_REGLA).required(),
  activa: Joi.boolean().required(),
  momentos: Joi.array()
    .items(Joi.string().valid(...MOMENTOS_PROMOCION))
    .unique()
    .required(),
  niveles: Joi.array()
    .items(Joi.string().valid(...NIVELES_EDUCATIVOS))
    .default([]),
  grados_ids: ids,
  condiciones: Joi.array().items(condicion).max(MAX_CONDICIONES_POR_REGLA).required(),
  accion: Joi.string()
    .valid(...ACCIONES_REGLA)
    .required(),
});

export const anioParam: ValidationSchema = {
  params: Joi.object({ academic_year_id: objectId.required() }),
};

// Que las claves no se repitan, que cada condición traiga lo que su tipo necesita y que las faltas de convivencia no reprueben lo valida
// `validarPolitica` (utils/promocion.ts), que también necesita los periodos del año.
const cuerpoPolitica = Joi.object({
    unidad: Joi.string()
      .valid(...UNIDADES_PROMOCION)
      .required(),
    area_pierde_con_asignatura_perdida: Joi.boolean().required(),
    asignaturas_criticas_ids: ids,
    areas_criticas_ids: ids,
    asignaturas_arrastrables_ids: ids,
    areas_arrastrables_ids: ids,
    reglas: Joi.array().items(regla).max(MAX_REGLAS_PROMOCION).required(),
    inasistencia: Joi.object({
      activa: Joi.boolean().required(),
      porcentaje: Joi.number().min(0).max(100).required(),
      faltas: Joi.string()
        .valid(...FALTAS_COMPUTABLES)
        .required(),
    }).required(),
    imprescindibles: Joi.object({
      efecto: Joi.string()
        .valid(...EFECTOS_IMPRESCINDIBLES)
        .allow(null)
        .required(),
    }).required(),
    umbrales: Joi.object({
      recuperacion_hasta: Joi.number().integer().min(0).max(50).allow(null).required(),
      reprueba_desde_areas: Joi.number().integer().min(1).max(50).allow(null).required(),
      efecto_nota_recuperacion: Joi.string()
        .valid(...EFECTOS_NOTA_RECUPERACION)
        .required(),
    }).required(),
    sin_regla: Joi.object({ cierre: accionSinRegla, tras_recuperacion: accionSinRegla }).required(),
    arrastre: Joi.object({
      admite: Joi.boolean().required(),
      max_unidades: Joi.number().integer().min(1).max(20).required(),
      condicion: Joi.string()
        .valid(...CONDICIONES_ARRASTRE)
        .required(),
      nota_minima: Joi.number().min(0).allow(null).default(null),
      hasta_periodo: Joi.number().integer().min(1).max(12).required(),
      si_incumple: Joi.string()
        .valid(...CONSECUENCIAS_INCUMPLIR_ARRASTRE)
        .required(),
    }).required(),
    piar: Joi.object({ derivar_a_comision: Joi.boolean().required() }).required(),
    titulacion: Joi.object({
      // Se ignora: la titulación es siempre del grado 11. Una política anterior con otro valor sigue guardándose sin error.
      grado_titulacion: Joi.any().custom(() => GRADO_TITULACION).default(GRADO_TITULACION),
      servicio_social: Joi.object({
        activo: Joi.boolean().required(),
        horas_requeridas: Joi.number().min(1).max(2000).required(),
        alerta_desde_grado: Joi.number().integer().min(-2).max(11).required(),
      }).required(),
      saber_11: Joi.object({ activo: Joi.boolean().required() }).required(),
      paz_y_salvo: Joi.object({ activo: Joi.boolean().required() }).required(),
      carpeta_academica: Joi.object({ activo: Joi.boolean().required(), desde_grado: Joi.number().integer().min(-2).max(10).required() }).required(),
    }).required(),
    texto_siee: Joi.string().trim().allow('').max(MAX_CARACTERES_TEXTO_SIEE_PROMOCION).required(),
});

export const actualizarPolitica: ValidationSchema = {
  params: Joi.object({ academic_year_id: objectId.required() }),
  body: cuerpoPolitica,
};

/** «Pruébalo»: la política en borrador (sin guardar) y un estudiante hipotético. */
export const simularCaso: ValidationSchema = {
  params: Joi.object({ academic_year_id: objectId.required() }),
  body: Joi.object({
    politica: cuerpoPolitica.required(),
    caso: Joi.object({
      perdidas_asignaturas: Joi.number().integer().min(0).max(30).required(),
      perdidas_areas: Joi.number().integer().min(0).max(30).required(),
      incluye_imprescindible: Joi.boolean().required(),
      inasistencia_pct: Joi.number().min(0).max(100).required(),
      tiene_piar: Joi.boolean().required(),
      momento: Joi.string()
        .valid(...MOMENTOS_PROMOCION)
        .required(),
    }).required(),
  }),
};

const momento = Joi.string()
  .valid(...MOMENTOS_PROMOCION)
  .required();

export const simulacion: ValidationSchema = {
  query: Joi.object({ academic_year_id: objectId.required(), group_id: objectId.required(), momento }),
};

export const cierreGrupo: ValidationSchema = {
  body: Joi.object({ academic_year_id: objectId.required(), group_id: objectId.required(), momento, confirm_password: Joi.string().required() }),
};

export const reevaluar: ValidationSchema = {
  body: Joi.object({
    academic_year_id: objectId.required(),
    student_id: objectId.required(),
    motivo: Joi.string().trim().min(10).max(1000).required(),
    confirm_password: Joi.string().required(),
  }),
};

export const listarEvaluaciones: ValidationSchema = {
  query: Joi.object({
    academic_year_id: objectId.required(),
    group_id: objectId,
    student_id: objectId,
    resultado: Joi.string().valid(...RESULTADOS_PROMOCION),
    historial: Joi.boolean(),
  }),
};

export const idParam: ValidationSchema = { params: Joi.object({ id: objectId.required() }) };

export const simularRollover: ValidationSchema = {
  query: Joi.object({ origen_id: objectId.required(), destino_id: objectId.required(), sede_id: objectId, grade_id: objectId, group_id: objectId, continuidad: Joi.string().valid('CONFIRMADOS', 'TODOS') }),
};
export const simulacionRollover: ValidationSchema = {
  query: Joi.object({ origen_id: objectId.required(), destino_id: objectId.required(), sede_id: objectId, grade_id: objectId, group_id: objectId, continuidad: Joi.string().valid('CONFIRMADOS', 'TODOS') }),
};

export const ejecutarRollover: ValidationSchema = {
  body: Joi.object({ origen_id: objectId.required(), destino_id: objectId.required(), sede_id: objectId, grade_id: objectId, group_id: objectId, continuidad: Joi.string().valid('CONFIRMADOS', 'TODOS'), confirm_password: Joi.string().required() }),
};

export const configuracionRematricula: ValidationSchema = {
  body: Joi.object({
    criterios_desempate: Joi.array()
      .items(Joi.object({ criterio: Joi.string().valid(...CRITERIOS_DESEMPATE).required(), activo: Joi.boolean().required() }))
      .length(CRITERIOS_DESEMPATE.length)
      .required(),
    tolerancia_ocupacion_pct: Joi.number().min(0).max(50).required(),
  }),
};
