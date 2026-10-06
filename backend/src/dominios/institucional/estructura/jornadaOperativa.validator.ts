import Joi from 'joi';
import { DIAS_SEMANA_ISO, JORNADAS, TIPOS_FRANJA } from '../../../constants/enums';
import { ValidationSchema } from '../../../middlewares/validate.middleware';
import { objectId } from '../../../validators/common.validator';

const horaSchema = Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d$/, 'hora HH:MM');

export const crearJornada: ValidationSchema = {
  body: Joi.object({
    sede_id: objectId.required(),
    nombre: Joi.string()
      .valid(...JORNADAS)
      .required(),
    hora_inicio: horaSchema.required(),
    hora_fin: horaSchema.required(),
  }),
};

export const actualizarHorario: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    dias_habiles: Joi.array()
      .items(Joi.number().valid(...DIAS_SEMANA_ISO))
      .min(1)
      .unique()
      .required(),
    franjas: Joi.array()
      .items(
        Joi.object({
          nombre: Joi.string().trim().required(),
          tipo: Joi.string()
            .valid(...TIPOS_FRANJA)
            .required(),
          hora_inicio: horaSchema.required(),
          hora_fin: horaSchema.required(),
        })
      )
      .required(),
  }),
};

export const franjasDesdePlantilla: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
};

export const listarJornadas: ValidationSchema = {
  query: Joi.object({
    sede_id: objectId,
  }),
};
