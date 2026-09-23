import { NextFunction, Request, Response } from 'express';
import { Error as MongooseError } from 'mongoose';
import ApiError from '../utils/ApiError';

export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(404, `Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}

interface MongoDuplicateKeyError extends Error {
  code?: number;
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
}

/**
 * Middleware centralizado de manejo de errores. Traduce errores de
 * Mongoose (ValidationError, CastError, duplicate key 11000) y ApiError
 * a respuestas HTTP consistentes.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  const apiErr = err as Partial<ApiError> & Error;
  let statusCode = apiErr.statusCode || 500;
  let message = apiErr.message || 'Error interno del servidor.';

  if (err instanceof MongooseError.ValidationError) {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(' ');
  } else if (err instanceof MongooseError.CastError) {
    statusCode = 400;
    message = `Identificador invalido para el campo "${err.path}": ${err.value}.`;
  } else if ((err as MongoDuplicateKeyError).code === 11000) {
    const dupErr = err as MongoDuplicateKeyError;
    statusCode = 409;
    const field = Object.keys(dupErr.keyPattern || dupErr.keyValue || {}).join(', ');
    message = `El valor ingresado para "${field}" ya existe.`;
  }

  if (statusCode >= 500) {
    console.error(err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(apiErr.details ? { details: apiErr.details } : {}),
  });
}
