import Joi from 'joi';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

// Todo bloque de un dashboard se pide por año y, opcionalmente, por sede y por periodo (sin periodo, cada bloque elige el que le corresponde).
export const consulta: ValidationSchema = {
  query: Joi.object({
    academic_year_id: objectId.required(),
    sede_id: objectId,
    periodo_numero: Joi.number().integer().min(1).max(12),
  }),
};

// Los paneles de convivencia y orientación no miran periodos: se piden por año (el de los expedientes y el comité) y, opcionalmente, por una de las sedes del usuario.
export const consultaBienestar: ValidationSchema = {
  query: Joi.object({ academic_year_id: objectId.required(), sede_id: objectId }),
};
