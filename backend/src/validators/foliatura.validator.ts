import Joi from 'joi';
import { ESQUEMAS_FOLIATURA, MAX_CAPACIDAD_POR_LIBRO, MAX_FOLIO, MAX_LARGO_MASCARA, MAX_LIBRO } from '../constants/foliatura';
import { ValidationSchema } from '../middlewares/validate.middleware';

export const verFoliatura: ValidationSchema = {
  // Vigencia con la que se calcula el «siguiente» en el esquema anual; sin ella se usa la del año de trabajo.
  query: Joi.object({ anio: Joi.number().integer().min(1900).max(2200) }),
};

export const actualizarFoliatura: ValidationSchema = {
  body: Joi.object({
    esquema: Joi.string()
      .valid(...ESQUEMAS_FOLIATURA)
      .required(),
    mascara: Joi.string().trim().max(MAX_LARGO_MASCARA).required(),
    // Solo cuenta en el esquema continuo: en el anual el servicio la ignora.
    capacidad_por_libro: Joi.number().integer().min(1).max(MAX_CAPACIDAD_POR_LIBRO).allow(null).default(null),
    libro_actual: Joi.number().integer().min(1).max(MAX_LIBRO).required(),
    ultimo_folio: Joi.number().integer().min(0).max(MAX_FOLIO).required(),
    motivo: Joi.string().trim().max(500).allow(''),
  }),
};
