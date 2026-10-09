import { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import multer from 'multer';
import { MAX_BYTES_ENTREGA, MIMETYPES_EVIDENCIA } from '../constants/actividades';
import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import {
  actualizarConfiguracion,
  createActivity,
  createSubmission,
  deleteActivity,
  descargarEntrega,
  getActivity,
  gradeActivity,
  listActivities,
  listEntregas,
  listMisActividades,
  obtenerConfiguracion,
  revisionCalendario,
  updateActivity,
} from '../controllers/activity.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import ApiError from '../utils/ApiError';
import * as activityValidator from '../validators/activity.validator';

const router = Router();

const GESTION: Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR];

// En memoria: el contenido real se confirma por firma de bytes en el servicio antes de escribir en disco.
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) =>
    MIMETYPES_EVIDENCIA.has(file.mimetype)
      ? cb(null, true)
      : cb(new ApiError(400, 'Solo se aceptan PDF, Word, Excel, PowerPoint o imágenes (JPG, PNG, WEBP).') as unknown as Error),
  limits: { fileSize: MAX_BYTES_ENTREGA },
});

// El mensaje genérico del manejador de errores nombra 5 MB (el de matrículas): aquí el tope es otro.
const subirEntrega: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return next(new ApiError(400, `El archivo supera el tamaño máximo permitido (${MAX_BYTES_ENTREGA / 1024 / 1024} MB).`));
    }
    next(err);
  });
};

router.use(authenticate);

// Política de carga del colegio: la leen quienes programan; la cambia coordinación.
router.get('/configuracion', checkRole(...GESTION, ROLES.DOCENTE), obtenerConfiguracion);
router.put('/configuracion', checkRole(...GESTION), validate(activityValidator.actualizarConfiguracion), actualizarConfiguracion);

// Portal del estudiante (CU-EST-03).
router.get('/mias', checkRole(ROLES.ESTUDIANTE), validate(activityValidator.listMisActividades), listMisActividades);
router.get('/entregas/:id/archivo', checkRole(ROLES.ESTUDIANTE, ROLES.DOCENTE, ...GESTION), validate(activityValidator.idParam), descargarEntrega);

// Gestor del docente (CU-DOC-02).
router.get('/revision-calendario', checkRole(ROLES.DOCENTE), validate(activityValidator.revisionCalendario), revisionCalendario);
router.post('/', checkRole(ROLES.DOCENTE), validate(activityValidator.createActivity), createActivity);
router.get('/', checkRole(ROLES.DOCENTE, ...GESTION), validate(activityValidator.listActivities), listActivities);

router.get('/:id', checkRole(ROLES.DOCENTE, ROLES.ESTUDIANTE, ...GESTION), validate(activityValidator.idParam), getActivity);
router.patch('/:id', checkRole(ROLES.DOCENTE), validate(activityValidator.updateActivity), updateActivity);
router.delete('/:id', checkRole(ROLES.DOCENTE), validate(activityValidator.idParam), deleteActivity);
router.get('/:id/entregas', checkRole(ROLES.DOCENTE, ...GESTION), validate(activityValidator.idParam), listEntregas);

// multer va antes de validate: el cuerpo multipart no existe hasta que multer lo lee.
router.post(
  '/:id/submissions',
  checkRole(ROLES.ESTUDIANTE),
  subirEntrega,
  validate(activityValidator.createSubmission),
  createSubmission
);

router.patch('/:id/grade', checkRole(ROLES.DOCENTE), validate(activityValidator.gradeActivity), gradeActivity);

export default router;
