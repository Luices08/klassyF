import { Router } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { MAX_BYTES_IMAGEN_INSTITUCIONAL, TIPOS_IMAGEN_INSTITUCIONAL } from '../constants/imagenesInstitucionales';
import ApiError from '../utils/ApiError';
import { ROLES } from '../constants/roles';
import {
  actualizarAjustes,
  actualizarPlantillaFranjas,
  guardarImagen,
  quitarImagen,
  resumenImagenes,
  getInstitution,
  getLimitesCarga,
  getLimitesHorasPlan,
  setupInstitution,
  updateInstitution,
  updateLimitesCarga,
  updateLimitesHorasPlan,
} from '../controllers/institution.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as institutionValidator from '../validators/institution.validator';

const router = Router();

// El mimetype lo declara el cliente: el servicio confirma el contenido real por firma de bytes.
const soloImagenes = (_req: Express.Request, file: Express.Multer.File, cb: FileFilterCallback) =>
  (TIPOS_IMAGEN_INSTITUCIONAL as readonly string[]).includes(file.mimetype) ? cb(null, true) : cb(new ApiError(400, 'Solo se aceptan imágenes PNG, JPG o WEBP.') as unknown as Error);
const subirImagen = multer({ storage: multer.memoryStorage(), fileFilter: soloImagenes, limits: { fileSize: MAX_BYTES_IMAGEN_INSTITUCIONAL, files: 1 } });

router.get('/', authenticate, getInstitution);

// M08: Topes de carga horaria docente por nivel (Decreto 1850)
router.get(
  '/limites-carga',
  authenticate,
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  getLimitesCarga
);

router.patch(
  '/limites-carga',
  authenticate,
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(institutionValidator.updateLimitesCarga),
  updateLimitesCarga
);

// M06: Tope de horas semanales del Plan de Estudios por nivel (antes quemado en el frontend)
router.get(
  '/limites-horas-plan',
  authenticate,
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  getLimitesHorasPlan
);

router.patch(
  '/limites-horas-plan',
  authenticate,
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(institutionValidator.updateLimitesHorasPlan),
  updateLimitesHorasPlan
);

router.post(
  '/setup',
  authenticate,
  checkRole(ROLES.ADMIN),
  validate(institutionValidator.setup),
  setupInstitution
);

// Solo existe una institucion por despliegue: se modifica en lugar de crear otra.
router.patch(
  '/',
  authenticate,
  checkRole(ROLES.ADMIN),
  validate(institutionValidator.updateInstitution),
  updateInstitution
);

router.put(
  '/plantilla-franjas',
  authenticate,
  checkRole(ROLES.ADMIN),
  validate(institutionValidator.plantillaFranjas),
  actualizarPlantillaFranjas
);

// Ajustes de funcionamiento (modalidad, aforo, paz y salvo) en sus propios bloques; sin contraseña, con auditoría.
router.patch('/ajustes', authenticate, checkRole(ROLES.ADMIN), validate(institutionValidator.actualizarAjustes), actualizarAjustes);

// Fotos del login y del tablero. POST como el resto de cargas del sistema (`api.upload` solo envía POST).
router.get('/imagenes', authenticate, checkRole(ROLES.ADMIN), resumenImagenes);
router.post('/imagenes/:clave', authenticate, checkRole(ROLES.ADMIN), validate(institutionValidator.conClaveDeImagen), subirImagen.single('file'), guardarImagen);
router.delete('/imagenes/:clave', authenticate, checkRole(ROLES.ADMIN), validate(institutionValidator.conClaveDeImagen), quitarImagen);

export default router;
