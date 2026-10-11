import Joi from 'joi';
import {
  ESTADOS_ESTUDIANTE,
  GENEROS,
  GRUPOS_ETNICOS,
  GRUPOS_SANGUINEOS,
  PARENTESCOS,
  REGIMENES_SALUD,
  TIPOS_DOCUMENTO,
} from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const listarEstudiantes: ValidationSchema = {
  query: Joi.object({
    search: Joi.string().allow(''),
    estado: Joi.string().valid(...ESTADOS_ESTUDIANTE),
    eps: Joi.string().allow(''),
    discapacidad: Joi.boolean(),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
  }),
};

export const obtenerFicha360: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const crearEstudianteCompleto: ValidationSchema = {
  body: Joi.object({
    tipo_documento: Joi.string().valid(...TIPOS_DOCUMENTO).required(),
    numero_documento: Joi.string().trim().required(),
    nombre: Joi.string().trim().required(),
    apellido: Joi.string().trim().required(),
    email: Joi.string().email().allow('', null).optional(),
    password: Joi.string().min(4).allow('', null).optional(),
    telefono: Joi.string().trim().allow('', null).optional(),
    lugar_expedicion: Joi.string().trim().allow('', null).optional(),
    fecha_nacimiento: Joi.date().iso().required(),
    genero: Joi.string().valid(...GENEROS).allow('', null).optional(),
    direccion_residencia: Joi.string().trim().allow('', null).optional(),
    barrio_vereda: Joi.string().trim().allow('', null).optional(),
    municipio: Joi.string().trim().allow('', null).optional(),
    estrato: Joi.number().integer().min(1).max(6).allow(null).optional(),
    eps: Joi.string().trim().allow('', null).optional(),
    regimen_salud: Joi.string().valid(...REGIMENES_SALUD).allow('', null).optional(),
    rh: Joi.string().valid(...GRUPOS_SANGUINEOS).allow('', null).optional(),
    alergias_condiciones: Joi.string().trim().allow('', null).optional(),
    grupo_etnico: Joi.string().valid(...GRUPOS_ETNICOS).default('NINGUNO'),
    victima_conflicto: Joi.boolean().default(false),
    tiene_discapacidad: Joi.boolean().default(false),
    tiene_talento_excepcional: Joi.boolean().default(false),
    descripcion_inclusion: Joi.string().trim().allow('', null).optional(),
    institucion_procedencia: Joi.string().trim().allow('', null).optional(),
    autorizacion_datos_sensibles: Joi.object({
      otorgada: Joi.boolean().required(),
      otorgado_por_nombre: Joi.string().trim().allow('', null).optional(),
    }).optional(),

    // Acudiente (opcional)
    acudiente_tipo_documento: Joi.string().valid(...TIPOS_DOCUMENTO).default('CC'),
    acudiente_numero_documento: Joi.string().trim().allow('', null).optional(),
    acudiente_nombre: Joi.string().trim().allow('', null).optional(),
    acudiente_apellido: Joi.string().trim().allow('', null).optional(),
    acudiente_telefono_principal: Joi.string().trim().allow('', null).optional(),
    acudiente_telefono_secundario: Joi.string().trim().allow('', null).optional(),
    acudiente_email: Joi.string().email().allow('', null).optional(),
    acudiente_parentesco: Joi.string().valid(...PARENTESCOS).allow('', null).optional(),
    acudiente_direccion: Joi.string().trim().allow('', null).optional(),
    acudiente_password: Joi.string().min(4).allow('', null).optional(),
    acudiente_es_principal: Joi.boolean().default(true),
  }),
};
