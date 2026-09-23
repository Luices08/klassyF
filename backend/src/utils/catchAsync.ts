import { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncRequestHandler<P = any, ResBody = any, ReqBody = any, ReqQuery = any> = (
  req: Request<P, ResBody, ReqBody, ReqQuery>,
  res: Response<ResBody>,
  next: NextFunction
) => Promise<unknown>;

/**
 * Envuelve un controlador/middleware async para propagar cualquier rechazo
 * de promesa al middleware de manejo centralizado de errores via next(err).
 */
export function catchAsync<P = any, ResBody = any, ReqBody = any, ReqQuery = any>(
  fn: AsyncRequestHandler<P, ResBody, ReqBody, ReqQuery>
): RequestHandler<P, ResBody, ReqBody, ReqQuery> {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default catchAsync;
