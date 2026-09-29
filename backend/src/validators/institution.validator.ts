import Joi from 'joi';
import { CALENDARIOS, ESTADOS_USUARIO } from '../constants/enums';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

const periodoSchema = Joi.object({
  numero: Joi.number().integer().min(1).max(4).required(),
  nombre: Joi.string().required(),
  porcentaje: Joi.number().min(0).max(100).required(),
  fecha_inicio: Joi.date().required(),
  fecha_fin: Joi.date().min(Joi.ref('fecha_inicio')).required(),
});

export const setup: ValidationSchema = {
  body: Joi.object({
    institucion: Joi.object({
      nombre: Joi.string().required(),
      codigo_dane: Joi.string()
        .pattern(/^\d{12}$/)
        .required(),
      nit: Joi.string().required(),
      resolucion_aprobacion: Joi.string().required(),
      administrador_id: objectId,
    }).required(),

    sede_principal: Joi.object({
      nombre: Joi.string().required(),
      codigo_dane_sede: Joi.string()
        .pattern(/^\d{12}$/)
        .required(),
      direccion: Joi.string().required(),
    }).required(),

    anio_lectivo: Joi.object({
      year: Joi.number().integer().min(2000).max(2100).required(),
      calendario: Joi.string()
        .valid(...CALENDARIOS)
        .required(),
      // Colombia no exige exactamente 4 periodos por año lectivo; se permite entre 2 y 4.
      periodos: Joi.array().items(periodoSchema).min(2).max(4).required(),
    }).required(),
  }),
};

// El sistema es de una sola institucion por instalacion (se vende/despliega un
// dominio por colegio); una vez creada, sus datos se editan aqui en vez de
// volver a pasar por /setup.
export const updateInstitution: ValidationSchema = {
  body: Joi.object({
    nombre: Joi.string().required(),
    codigo_dane: Joi.string()
      .pattern(/^\d{12}$/)
      .required(),
    nit: Joi.string().required(),
    resolucion_aprobacion: Joi.string().required(),
    estado: Joi.string().valid(...ESTADOS_USUARIO),
    // Logo institucional como data URI (base64), tope ~600KB para no inflar el documento.
    logo_url: Joi.string().dataUri().max(800_000).allow(null),
    correo_secretaria: Joi.string().email().allow('', null),
    horario_atencion: Joi.string().allow('', null),
    confirm_password: Joi.string().required(),
  }),
};
