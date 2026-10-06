import { Router } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { MAX_BYTES_EVIDENCIA } from './asistencia.constants';
import { Rol } from '../../../constants/enums';
import { ROLES } from '../../../constants/roles';
import {
  actualizarEstado,
  cambiarEstadoActivo,
  crearEstado,
  crearJustificacion,
  descargarPlantillaExcel,
  descargarSoporte,
  guardarCuadricula,
  listarClases,
  listarEstados,
  listarInasistencias,
  importarPlantillaExcel,
  listarJustificaciones,
  obtenerCuadricula,
  obtenerEstadisticas,
  pdfConsolidadoGrupo,
  pdfFichaEstudiante,
  pdfPlanilla,
  pdfReporteInstitucional,
  obtenerPlanilla,
  registrarAsistencia,
  revisarJustificacion,
} from './attendance.controller';
import { authenticate, checkRole } from '../../../middlewares/auth.middleware';
import validate from '../../../middlewares/validate.middleware';
import { MAX_BYTES_EXCEL } from './attendanceExcel.service';
import ApiError from '../../../utils/ApiError';
import * as attendanceValidator from './attendance.validator';

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

// Google Sheets exporta el mismo .xlsx; algunos navegadores lo declaran como octet-stream, así que se confía en
// la extensión aquí y el servicio confirma por firma de bytes.
const uploadExcel = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) =>
    /\.xlsx$/i.test(file.originalname)
      ? cb(null, true)
      : cb(new ApiError(400, 'Solo se acepta un archivo Excel (.xlsx).') as unknown as Error),
  limits: { fileSize: MAX_BYTES_EXCEL },
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

// Trabajo sin conexión (CU-DOC-05): se descarga la planilla en Excel y se vuelve a subir diligenciada.
router.get(
  '/planilla/excel',
  checkRole(ROLES.DOCENTE),
  validate(attendanceValidator.obtenerPlanilla),
  descargarPlantillaExcel
);
router.post('/planilla/excel', checkRole(ROLES.DOCENTE), uploadExcel.single('file'), importarPlantillaExcel);

// Planilla clásica: estudiantes en filas y los días del mes en columnas. El docente edita sus clases y consulta las del
// grupo que dirige; la coordinación y secretaría consultan (service decide por clase).
router.get('/clases', checkRole(...CONSULTA), validate(attendanceValidator.listarClases), listarClases);
router.get('/cuadricula', checkRole(...CONSULTA), validate(attendanceValidator.obtenerCuadricula), obtenerCuadricula);
router.put('/cuadricula', checkRole(ROLES.DOCENTE), validate(attendanceValidator.guardarCuadricula), guardarCuadricula);

// PDFs (el service aplica el permiso fino de cada uno).
router.get('/pdf/planilla', checkRole(...CONSULTA), validate(attendanceValidator.pdfPlanilla), pdfPlanilla);
router.get('/pdf/consolidado-grupo', checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.DOCENTE), validate(attendanceValidator.pdfConsolidadoGrupo), pdfConsolidadoGrupo);
router.get('/pdf/reporte', checkRole(...REVISION), validate(attendanceValidator.pdfReporteInstitucional), pdfReporteInstitucional);
router.get('/pdf/estudiante', checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA), validate(attendanceValidator.pdfFichaEstudiante), pdfFichaEstudiante);

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
