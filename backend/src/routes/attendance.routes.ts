import { Router } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { MAX_BYTES_EVIDENCIA } from '../constants/asistencia';
import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import {
  actualizarEstado,
  cambiarEstadoActivo,
  crearEstado,
  crearJustificacion,
  descargarSoporte,
  listarEstados,
  listarInasistencias,
  listarJustificaciones,
  obtenerEstadisticas,
  obtenerPlanilla,
  registrarAsistencia,
  revisarJustificacion,
} from '../controllers/attendance.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import ApiError from '../utils/ApiError';
import * as attendanceValidator from '../validators/attendance.validator';

const router = Router();

const CONSULTA: Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA, ROLES.DOCENTE];
const REVISION: Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR];

// En memoria: el contenido real se confirma por firma de bytes en el servicio antes de escribir en disco.
const TIPOS_PERMITIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function soloDocumentosYFotos(_req: Express.Request, file: Express.Multer.File, cb: FileFilterCallback) {
  if (!TIPOS_PERMITIDOS.has(file.mimetype)) {
    return cb(new ApiError(400, 'Solo se aceptan PDF, JPG, PNG o WEBP.') as unknown as Error);
  }
  cb(null, true);
}

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: soloDocumentosYFotos,
  limits: { fileSize: MAX_BYTES_EVIDENCIA },
});

router.use(authenticate);

// Estados parametrizables por la institución (solo ADMIN los modifica; todos los que consultan los leen).
router.get('/estados', checkRole(...CONSULTA), validate(attendanceValidator.listarEstados), listarEstados);
router.post('/estados', checkRole(ROLES.ADMIN), validate(attendanceValidator.crearEstado), crearEstado);
router.patch('/estados/:id', checkRole(ROLES.ADMIN), validate(attendanceValidator.actualizarEstado), actualizarEstado);
router.patch(
  '/estados/:id/estado',
  checkRole(ROLES.ADMIN),
  validate(attendanceValidator.cambiarEstadoActivo),
  cambiarEstadoActivo
);

// Planilla rápida de aula (CU-DOC-04).
router.get('/planilla', checkRole(ROLES.DOCENTE), validate(attendanceValidator.obtenerPlanilla), obtenerPlanilla);
router.put('/planilla', checkRole(ROLES.DOCENTE), validate(attendanceValidator.registrarAsistencia), registrarAsistencia);

router.get('/inasistencias', checkRole(...CONSULTA), validate(attendanceValidator.listarInasistencias), listarInasistencias);
router.get('/estadisticas', checkRole(...CONSULTA), validate(attendanceValidator.obtenerEstadisticas), obtenerEstadisticas);

// Justificaciones: multer va antes de validate porque el cuerpo multipart no existe hasta que multer lo lee.
router.get(
  '/justificaciones',
  checkRole(...CONSULTA),
  validate(attendanceValidator.listarJustificaciones),
  listarJustificaciones
);
router.post(
  '/justificaciones',
  checkRole(...CONSULTA),
  upload.single('file'),
  validate(attendanceValidator.crearJustificacion),
  crearJustificacion
);
router.patch(
  '/justificaciones/:id/revisar',
  checkRole(...REVISION),
  validate(attendanceValidator.revisarJustificacion),
  revisarJustificacion
);
router.get('/justificaciones/:id/archivo', checkRole(...CONSULTA), validate(attendanceValidator.idParam), descargarSoporte);

export default router;
