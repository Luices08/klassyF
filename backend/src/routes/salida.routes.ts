import { Router } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import { MAX_BYTES_SOPORTE_SALIDA } from '../constants/salidas';
import * as controller from '../controllers/salida.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import ApiError from '../utils/ApiError';
import * as v from '../validators/salida.validator';

const router = Router();

// Secretaría registra la salida y verifica el paz y salvo; coordinación y el administrador (Rectoría) también. La excepción y la anulación las limita el servicio.
const QUIEN_GESTIONA_SALIDAS: Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];

const TIPOS_PERMITIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
function soloDocumentosYFotos(_req: Express.Request, file: Express.Multer.File, cb: FileFilterCallback) {
  if (!TIPOS_PERMITIDOS.has(file.mimetype)) return cb(new ApiError(400, 'Solo se aceptan PDF, JPG, PNG o WEBP.') as unknown as Error);
  cb(null, true);
}
const upload = multer({ storage: multer.memoryStorage(), fileFilter: soloDocumentosYFotos, limits: { fileSize: MAX_BYTES_SOPORTE_SALIDA } });

router.use(authenticate, checkRole(...QUIEN_GESTIONA_SALIDAS));

router.get('/', validate(v.listar), controller.listar);
router.get('/matriculas-disponibles', validate(v.matriculasDisponibles), controller.matriculasDisponibles);
router.post('/', validate(v.registrar), controller.registrar);
router.get('/:id', validate(v.detalle), controller.detalle);
router.post('/:id/soportes', validate(v.soporte), upload.single('file'), controller.cargarSoporte);
router.get('/:id/soportes/:soporteId', validate(v.soporteId), controller.descargarSoporte);
router.get('/:id/paz-y-salvo', validate(v.detalle), controller.pazYSalvo);
router.post('/:id/paz-y-salvo/:clave', validate(v.actuarSobreDependencia), controller.actuarSobreDependencia);
router.get('/:id/boletin-parcial', validate(v.boletin), controller.boletin);
router.get('/:id/boletin-parcial/pdf', validate(v.boletin), controller.boletinPdf);

export default router;
