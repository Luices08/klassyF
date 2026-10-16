import { Router } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import {
  cargarPazYSalvo,
  descargarPazYSalvo,
  listarPazYSalvo,
  revisarPazYSalvo,
} from '../controllers/pazYSalvo.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import ApiError from '../utils/ApiError';
import * as pazYSalvoValidator from '../validators/pazYSalvo.validator';

const router = Router();

// El docente entra a la ruta y el servicio decide según la configuración institucional (si no está habilitado, 403 con el motivo).
const QUIEN_GESTIONA: Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA, ROLES.DOCENTE];

const TIPOS_PERMITIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function soloDocumentosYFotos(_req: Express.Request, file: Express.Multer.File, cb: FileFilterCallback) {
  if (!TIPOS_PERMITIDOS.has(file.mimetype)) {
    return cb(new ApiError(400, 'Solo se aceptan PDF, JPG, PNG o WEBP.') as unknown as Error);
  }
  cb(null, true);
}

const upload = multer({ storage: multer.memoryStorage(), fileFilter: soloDocumentosYFotos, limits: { fileSize: 5 * 1024 * 1024 } });

router.use(authenticate, checkRole(...QUIEN_GESTIONA));

router.get('/', validate(pazYSalvoValidator.listarPazYSalvo), listarPazYSalvo);
router.post('/estudiantes/:studentId/anios/:anioId/archivo', validate(pazYSalvoValidator.cargarPazYSalvo), upload.single('file'), cargarPazYSalvo);
router.patch('/estudiantes/:studentId/anios/:anioId', validate(pazYSalvoValidator.revisarPazYSalvo), revisarPazYSalvo);
router.get('/:id/archivo', validate(pazYSalvoValidator.descargarPazYSalvo), descargarPazYSalvo);

export default router;
