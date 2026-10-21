import Joi from 'joi';
import { COLOR_HEX, FUENTES_SITIO, POSICIONES_LOGO, POSICIONES_MENU, SECCIONES_SITIO } from '../constants/sitioPublico';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const guardarConfiguracion: ValidationSchema = {
  body: Joi.object({
    plantilla: Joi.string().required(),
    logo_posicion: Joi.string().valid(...POSICIONES_LOGO).required(),
    menu_posicion: Joi.string().valid(...POSICIONES_MENU).required(),
    tipografia: Joi.object({
      fuente_titulo: Joi.string().valid(...FUENTES_SITIO).required(),
      color_titulo: Joi.string().pattern(COLOR_HEX).required(),
      fuente_texto: Joi.string().valid(...FUENTES_SITIO).required(),
      color_texto: Joi.string().pattern(COLOR_HEX).required(),
    }).required(),
    secciones: Joi.array()
      .items(Joi.object({ clave: Joi.string().valid(...SECCIONES_SITIO).required(), visible: Joi.boolean().required() }))
      .required(),
  }),
};

export const conIdDeImagen: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
};
