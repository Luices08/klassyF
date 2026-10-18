import Joi from 'joi';

/** Clave de un documento del catálogo de matrícula (`RequisitoDocumental.clave`). */
export const claveDocumento = Joi.string()
  .trim()
  .pattern(/^[A-Z0-9_]{2,60}$/);

export const objectId = Joi.string()
  .regex(/^[0-9a-fA-F]{24}$/)
  .message('"{{#label}}" debe ser un ObjectId valido de MongoDB.');
