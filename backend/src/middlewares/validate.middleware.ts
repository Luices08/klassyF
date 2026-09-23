import { RequestHandler } from 'express';
import Joi, { Schema } from 'joi';
import ApiError from '../utils/ApiError';

type Segment = 'body' | 'query' | 'params';
// `body` puede no ser un objeto (ej. un array para cargas masivas como el
// banco de DBA), por eso se tipa con el `Schema` base de Joi y no `ObjectSchema`.
export type ValidationSchema = Partial<Record<Segment, Schema>>;

const SEGMENTS: Segment[] = ['body', 'query', 'params'];

function pick(obj: Record<string, unknown>, keys: Segment[]): Partial<Record<Segment, unknown>> {
  return keys.reduce((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(obj, key)) acc[key] = obj[key];
    return acc;
  }, {} as Partial<Record<Segment, unknown>>);
}

/**
 * validate(schema): valida req.body/req.query/req.params contra un schema Joi
 * de la forma { body?, query?, params? }. En error, delega al middleware
 * centralizado con un ApiError 400 legible.
 */
export function validate(schema: ValidationSchema): RequestHandler {
  return (req, _res, next) => {
    const keys = Object.keys(schema).filter((k): k is Segment => SEGMENTS.includes(k as Segment));
    const object = pick(req as unknown as Record<string, unknown>, keys);

    const { value, error } = Joi.object(schema)
      .prefs({ errors: { label: 'key' }, abortEarly: false, stripUnknown: true })
      .validate(object);

    if (error) {
      const message = error.details.map((d) => d.message).join('; ');
      return next(new ApiError(400, message));
    }

    Object.assign(req, value);
    next();
  };
}

export default validate;
