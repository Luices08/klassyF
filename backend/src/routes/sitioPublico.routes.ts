import { Router } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { MAX_BYTES_IMAGEN_INSTITUCIONAL, TIPOS_IMAGEN_INSTITUCIONAL } from '../constants/imagenesInstitucionales';
import { ROLES } from '../constants/roles';
import { agregarImagen, guardarConfiguracion, quitarImagen, verParaAdministrar } from '../controllers/sitioPublico.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import ApiError from '../utils/ApiError';
import * as sitioValidator from '../validators/sitioPublico.validator';

const router = Router();

// El mimetype lo declara el cliente: el servicio confirma el contenido real por firma de bytes.
const soloImagenes = (_req: Express.Request, file: Express.Multer.File, cb: FileFilterCallback) =>
  (TIPOS_IMAGEN_INSTITUCIONAL as readonly string[]).includes(file.mimetype) ? cb(null, true) : cb(new ApiError(400, 'Solo se aceptan imágenes PNG, JPG o WEBP.') as unknown as Error);
const subirImagen = multer({ storage: multer.memoryStorage(), fileFilter: soloImagenes, limits: { fileSize: MAX_BYTES_IMAGEN_INSTITUCIONAL, files: 1 } });

router.use(authenticate, checkRole(ROLES.ADMIN));

router.get('/', verParaAdministrar);
router.put('/', validate(sitioValidator.guardarConfiguracion), guardarConfiguracion);
// POST como el resto de cargas del sistema (`api.upload` solo envía POST).
router.post('/imagenes', subirImagen.single('file'), agregarImagen);
router.delete('/imagenes/:id', validate(sitioValidator.conIdDeImagen), quitarImagen);

export default router;
