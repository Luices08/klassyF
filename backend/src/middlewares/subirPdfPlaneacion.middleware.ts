import { NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';
import { MAX_BYTES_PLANEACION, MIMETYPES_PLANEACION } from '../constants/planeacion';
import ApiError from '../utils/ApiError';

// En memoria: el contenido real se confirma por firma de bytes en `guardarPdf` antes de escribir en disco.
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) =>
    MIMETYPES_PLANEACION.has(file.mimetype) ? cb(null, true) : cb(new ApiError(400, 'Solo se aceptan documentos en formato PDF.') as unknown as Error),
  limits: { fileSize: MAX_BYTES_PLANEACION },
});

/** Recibe un único PDF en el campo `file`. Va antes de `validate`: el cuerpo multipart no existe hasta que multer lo lee. */
export const subirPdfPlaneacion: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return next(new ApiError(400, `El PDF supera el tamaño máximo permitido (${MAX_BYTES_PLANEACION / 1024 / 1024} MB).`));
    }
    next(err);
  });
};
