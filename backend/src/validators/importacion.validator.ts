import Joi from 'joi';
import { ValidationSchema } from '../middlewares/validate.middleware';
import { objectId } from './common.validator';

export const descargarPlantilla: ValidationSchema = {
  params: Joi.object({ proceso: Joi.string().required() }),
  query: Joi.object({ formato: Joi.string().valid('xlsx', 'csv').default('xlsx'), group_id: objectId }),
};

export const importar: ValidationSchema = { params: Joi.object({ proceso: Joi.string().required() }) };

export const anularLote: ValidationSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({ motivo: Joi.string().trim().min(5).max(500).required() }),
};
