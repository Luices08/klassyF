import { UserDocument } from '../../models/user.model';

declare global {
  namespace Express {
    interface Request {
      /** Adjuntado por el middleware `authenticate` tras validar el JWT. */
      user?: UserDocument;
    }
  }
}

export {};
