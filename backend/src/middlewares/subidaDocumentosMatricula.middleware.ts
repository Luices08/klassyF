import multer, { FileFilterCallback } from 'multer';
import ApiError from '../utils/ApiError';

// En memoria, no en disco: el mimetype declarado aquí es solo un filtro rápido (barato de falsificar). El servicio valida el contenido real
// por firma de bytes (utils/firmasArchivo) antes de escribirlo en disco (nunca como data URI en Mongo, ni en un servicio externo: son datos
// personales de menores, M03/habeas data).
const TIPOS_PERMITIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function soloDocumentosYFotos(_req: Express.Request, file: Express.Multer.File, cb: FileFilterCallback) {
  if (!TIPOS_PERMITIDOS.has(file.mimetype)) {
    return cb(new ApiError(400, 'Solo se aceptan PDF, JPG, PNG o WEBP.') as unknown as Error);
  }
  cb(null, true);
}

/** Un documento del checklist de matrícula (M04), hasta 5 MB. Lo usan secretaría y el portal del acudiente. */
export const subirDocumentoMatricula = multer({
  storage: multer.memoryStorage(),
  fileFilter: soloDocumentosYFotos,
  limits: { fileSize: 5 * 1024 * 1024 },
});
