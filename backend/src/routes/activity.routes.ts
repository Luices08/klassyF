import { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import { MAX_ARCHIVOS_POR_SUBIDA, MAX_BYTES_ADJUNTO, MAX_BYTES_ENTREGA, MIMETYPES_EVIDENCIA } from '../constants/actividades';
import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import {
  actualizarConfiguracion,
  analisisActividad,
  crearComentario,
  createActivity,
  createSubmission,
  deleteActivity,
  descargarAdjunto,
  descargarEntrega,
  elegirIntentoValido,
  eliminarComentario,
  getActivity,
  gradeActivity,
  listActivities,
  listarComentarios,
  listEntregas,
  listMisActividades,
  obtenerConfiguracion,
  otorgarAccesoEspecial,
  revisionCalendario,
  revocarAccesoEspecial,
  subirAdjuntos,
  updateActivity,
} from '../controllers/activity.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import ApiError from '../utils/ApiError';
import { MIMETYPES_ADJUNTO_MEDIOS } from '../utils/adjuntosActividad';
import { TEMPORAL_ACTIVIDADES_DIR } from '../utils/uploadPaths';
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

// Adjuntos del docente: a una carpeta temporal en disco (hasta 50 MB no caben cómodos en memoria); el servicio confirma por los
// bytes qué es cada uno, los guarda con el nombre de su huella y borra el temporal.
const MIMETYPES_ADJUNTO = new Set<string>([...MIMETYPES_EVIDENCIA, ...MIMETYPES_ADJUNTO_MEDIOS]);
const uploadAdjuntos = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(TEMPORAL_ACTIVIDADES_DIR, { recursive: true });
      cb(null, TEMPORAL_ACTIVIDADES_DIR);
    },
  }),
  fileFilter: (_req, file, cb) =>
    MIMETYPES_ADJUNTO.has(file.mimetype)
      ? cb(null, true)
      : cb(new ApiError(400, `«${file.originalname}» no es un tipo de archivo admitido (JPG, PNG, WEBP, PDF, Word, Excel, PowerPoint, MP3, MP4).`) as unknown as Error),
  limits: { fileSize: MAX_BYTES_ADJUNTO, files: MAX_ARCHIVOS_POR_SUBIDA },
});

const subirVariosAdjuntos: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  uploadAdjuntos.array('files', MAX_ARCHIVOS_POR_SUBIDA)(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(new ApiError(400, `Cada archivo puede pesar hasta ${MAX_BYTES_ADJUNTO / 1024 / 1024} MB.`));
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(new ApiError(400, `Sube hasta ${MAX_ARCHIVOS_POR_SUBIDA} archivos a la vez.`));
      }
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
router.get('/entregas/:id/archivo', checkRole(ROLES.ESTUDIANTE, ROLES.DOCENTE, ...GESTION), validate(activityValidator.descargarEntrega), descargarEntrega);

// Gestor del docente (CU-DOC-02).
router.get('/revision-calendario', checkRole(ROLES.DOCENTE), validate(activityValidator.revisionCalendario), revisionCalendario);
// multer va antes de validate: el cuerpo multipart no existe hasta que multer lo lee.
router.post('/adjuntos', checkRole(ROLES.DOCENTE), subirVariosAdjuntos, subirAdjuntos);
router.post('/', checkRole(ROLES.DOCENTE), validate(activityValidator.createActivity), createActivity);
router.get('/', checkRole(ROLES.DOCENTE, ...GESTION), validate(activityValidator.listActivities), listActivities);

router.get('/:id', checkRole(ROLES.DOCENTE, ROLES.ESTUDIANTE, ...GESTION), validate(activityValidator.idParam), getActivity);
router.patch('/:id', checkRole(ROLES.DOCENTE), validate(activityValidator.updateActivity), updateActivity);
router.delete('/:id', checkRole(ROLES.DOCENTE), validate(activityValidator.idParam), deleteActivity);
router.get('/:id/entregas', checkRole(ROLES.DOCENTE, ...GESTION), validate(activityValidator.idParam), listEntregas);
router.patch('/:id/entregas/:studentId/valida', checkRole(ROLES.DOCENTE), validate(activityValidator.elegirIntentoValido), elegirIntentoValido);
router.get('/:id/analisis', checkRole(ROLES.DOCENTE, ...GESTION), validate(activityValidator.idParam), analisisActividad);
router.get('/:id/adjuntos/:adjuntoId', checkRole(ROLES.DOCENTE, ROLES.ESTUDIANTE, ...GESTION), validate(activityValidator.descargarAdjunto), descargarAdjunto);

// Acceso especial: un plazo personal para el estudiante con una excusa válida.
router.post('/:id/accesos-especiales', checkRole(ROLES.DOCENTE), validate(activityValidator.otorgarAccesoEspecial), otorgarAccesoEspecial);
router.delete('/:id/accesos-especiales/:studentId', checkRole(ROLES.DOCENTE), validate(activityValidator.accesoEspecialDeEstudiante), revocarAccesoEspecial);

// Comentarios públicos de la actividad: el docente, su grupo y coordinación.
router.get('/:id/comentarios', checkRole(ROLES.DOCENTE, ROLES.ESTUDIANTE, ...GESTION), validate(activityValidator.idParam), listarComentarios);
router.post('/:id/comentarios', checkRole(ROLES.DOCENTE, ROLES.ESTUDIANTE, ...GESTION), validate(activityValidator.crearComentario), crearComentario);
router.delete('/:id/comentarios/:comentarioId', checkRole(ROLES.DOCENTE, ROLES.ESTUDIANTE, ...GESTION), validate(activityValidator.eliminarComentario), eliminarComentario);

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
