import Joi from 'joi';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

// Sin periodo = el cierre del año; con periodo = las notas de ese periodo.
export const sabana: ValidationSchema = {
  query: Joi.object({
    academic_year_id: objectId.required(),
    sede_id: objectId,
    jornada_id: objectId,
    grade_id: objectId,
    group_id: objectId,
    periodo_numero: Joi.number().integer().min(1).max(12),
  }),
};

export const informeFinal: ValidationSchema = {
  query: Joi.object({ academic_year_id: objectId.required(), group_id: objectId.required(), student_id: objectId }),
};

export const informeFinalDeFamilia: ValidationSchema = {
  query: Joi.object({ academic_year_id: objectId.required(), student_id: objectId.required() }),
};

export const informeFinalPublicacion: ValidationSchema = {
  query: Joi.object({ academic_year_id: objectId.required(), group_id: objectId.required() }),
};

export const publicarInformeFinal: ValidationSchema = {
  body: Joi.object({ academic_year_id: objectId.required(), group_id: objectId.required(), publicado: Joi.boolean().required() }),
};

// Los listados de cierre se piden por año y, opcionalmente, por sede, jornada, grado o grupo.
export const listado: ValidationSchema = {
  query: Joi.object({ academic_year_id: objectId.required(), sede_id: objectId, jornada_id: objectId, grade_id: objectId, group_id: objectId }),
};

// Reporte tipo C-600 (M30): los filtros de siempre más el día en que se cuentan los años cumplidos (sin él, el inicio del periodo 1).
export const c600: ValidationSchema = {
  query: Joi.object({
    academic_year_id: objectId.required(),
    sede_id: objectId,
    jornada_id: objectId,
    grade_id: objectId,
    fecha_corte: Joi.string()
      .pattern(/^\d{4}-\d{2}-\d{2}$/)
      .messages({ 'string.pattern.base': 'La fecha de corte debe tener el formato AAAA-MM-DD.' }),
  }),
};

// Consolidado general de la institución: por año y, si se quiere, por sede.
export const consolidado: ValidationSchema = {
  query: Joi.object({ academic_year_id: objectId.required(), sede_id: objectId }),
};

export const emitirLibro: ValidationSchema = {
  body: Joi.object({ academic_year_id: objectId.required(), sede_id: objectId.required(), grade_id: objectId.required() }),
};

export const listarLibros: ValidationSchema = {
  query: Joi.object({ academic_year_id: objectId.required() }),
};

export const libroPorId: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const anularLibro: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({ motivo: Joi.string().trim().min(10).max(500).required() }),
};
