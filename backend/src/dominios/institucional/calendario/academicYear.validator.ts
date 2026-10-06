import Joi from 'joi';
import {
  CALENDARIOS,
  COMPONENTES_SIEE,
  ESTADOS_PERIODO_ACADEMICO,
  NIVELES_DESEMPENO,
  TIPOS_EVENTO_CALENDARIO,
} from '../../../constants/enums';
import { ValidationSchema } from '../../../middlewares/validate.middleware';
import { objectId } from '../../../validators/common.validator';

const periodoSchema = Joi.object({
  numero: Joi.number().integer().min(1).max(4).required(),
  nombre: Joi.string().trim().required(),
  porcentaje: Joi.number().min(0).max(100).required(),
  fecha_inicio: Joi.date().required(),
  fecha_fin: Joi.date().min(Joi.ref('fecha_inicio')).required(),
  fecha_apertura_notas: Joi.date().allow(null),
  fecha_cierre_notas: Joi.date().allow(null),
});

// Colombia no exige exactamente 4 periodos por año lectivo; se permite entre 2 y 4.
const periodosSchema = Joi.array().items(periodoSchema).min(2).max(4).required();

const datosAnio = {
  nombre: Joi.string().trim().allow('', null),
  calendario: Joi.string()
    .valid(...CALENDARIOS)
    .required(),
  fecha_inicio: Joi.date().required(),
  fecha_fin: Joi.date().min(Joi.ref('fecha_inicio')).required(),
  periodos: periodosSchema,
};

const idAnio = { id: objectId.required() };

export const crearAnio: ValidationSchema = {
  body: Joi.object({
    year: Joi.number().integer().min(2000).max(2100).required(),
    ...datosAnio,
    copiar_grupos_de_id: objectId,
  }),
};

export const actualizarAnio: ValidationSchema = {
  params: Joi.object(idAnio),
  body: Joi.object(datosAnio),
};

export const anioPorId: ValidationSchema = {
  params: Joi.object(idAnio),
};

export const cerrarAnio: ValidationSchema = {
  params: Joi.object(idAnio),
  body: Joi.object({
    confirm_password: Joi.string().required(),
    confirmar_year: Joi.number().integer().required(),
  }),
};

export const cambiarEstadoPeriodo: ValidationSchema = {
  params: Joi.object({
    ...idAnio,
    numero: Joi.number().integer().min(1).max(4).required(),
  }),
  body: Joi.object({
    estado: Joi.string()
      .valid(...ESTADOS_PERIODO_ACADEMICO)
      .required(),
    motivo: Joi.string().trim().allow('', null),
  }),
};

export const otorgarProrroga: ValidationSchema = {
  params: Joi.object(idAnio),
  body: Joi.object({
    periodo_numero: Joi.number().integer().min(1).max(4).required(),
    docente_id: objectId.allow(null),
    group_id: objectId.allow(null),
    hasta: Joi.date().required(),
    justificacion: Joi.string().trim().min(10).required(),
  }).or('docente_id', 'group_id'),
};

export const revocarProrroga: ValidationSchema = {
  params: Joi.object({ ...idAnio, prorrogaId: objectId.required() }),
};

const eventoBody = Joi.object({
  tipo: Joi.string()
    .valid(...TIPOS_EVENTO_CALENDARIO)
    .required(),
  nombre: Joi.string().trim().required(),
  fecha_inicio: Joi.date().required(),
  fecha_fin: Joi.date().min(Joi.ref('fecha_inicio')).required(),
  periodo_numero: Joi.number().integer().min(1).max(4).allow(null),
  fecha_limite_resultados: Joi.date().allow(null),
});

export const crearEvento: ValidationSchema = {
  params: Joi.object(idAnio),
  body: eventoBody,
};

export const actualizarEvento: ValidationSchema = {
  params: Joi.object({ ...idAnio, eventoId: objectId.required() }),
  body: eventoBody,
};

export const eliminarEvento: ValidationSchema = {
  params: Joi.object({ ...idAnio, eventoId: objectId.required() }),
};

export const guardarCalendarioSede: ValidationSchema = {
  params: Joi.object({ ...idAnio, sedeId: objectId.required() }),
  body: Joi.object({
    periodos: Joi.array()
      .items(
        Joi.object({
          numero: Joi.number().integer().min(1).max(4).required(),
          fecha_inicio: Joi.date().required(),
          fecha_fin: Joi.date().min(Joi.ref('fecha_inicio')).required(),
          fecha_apertura_notas: Joi.date().allow(null),
          fecha_cierre_notas: Joi.date().allow(null),
        })
      )
      .min(1)
      .max(4)
      .unique('numero')
      .required(),
  }),
};

export const quitarCalendarioSede: ValidationSchema = {
  params: Joi.object({ ...idAnio, sedeId: objectId.required() }),
};

export const sugerirEscalaEvaluacion: ValidationSchema = {
  params: Joi.object(idAnio),
  query: Joi.object({
    nota_minima: Joi.number().required(),
    nota_maxima: Joi.number().required(),
    nota_aprobatoria: Joi.number().required(),
    precision_decimales: Joi.number().integer().min(0).max(4),
  }),
};

const rangoCualitativoBody = Joi.object({
  nivel: Joi.string()
    .valid(...NIVELES_DESEMPENO)
    .required(),
  etiqueta: Joi.string().trim().required(),
  valor_minimo: Joi.number().required(),
  valor_maximo: Joi.number().required(),
  es_aprobatorio: Joi.boolean().required(),
});

export const actualizarEscalaEvaluacion: ValidationSchema = {
  params: Joi.object(idAnio),
  body: Joi.object({
    nota_minima: Joi.number().required(),
    nota_maxima: Joi.number().required(),
    nota_aprobatoria: Joi.number().required(),
    precision_decimales: Joi.number().integer().min(0).max(4),
    rangos: Joi.array()
      .items(rangoCualitativoBody)
      .length(NIVELES_DESEMPENO.length)
      .unique('nivel')
      .required(),
  }),
};

// La suma exacta a 1 (100%) es regla de negocio y se valida en el modelo (pre-validate), no aquí.
export const actualizarPonderacionComponentes: ValidationSchema = {
  params: Joi.object(idAnio),
  body: Joi.object(
    Object.fromEntries(COMPONENTES_SIEE.map((componente) => [componente, Joi.number().min(0).max(1).required()]))
  ),
};
