import { Router } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import {
  actualizarComentarioDocumento,
  agregarDocumentoChecklist,
  cambiarGrupo,
  cargarDocumento,
  createEnrollment,
  descargarActa,
  descargarDocumento,
  eliminarDocumentoChecklist,
  getEnrollment,
  listEnrollments,
  revisarDocumento,
  sincronizarRequisitos,
  updateStatus,
} from '../controllers/enrollment.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import ApiError from '../utils/ApiError';
import * as enrollmentValidator from '../validators/enrollment.validator';

const router = Router();

const STAFF_MATRICULAS: Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];

// En memoria, no en disco: el mimetype declarado aqui es solo un filtro rapido (barato de
// falsificar). El controlador valida el contenido real por firma de bytes — igual que la carga
// publica de preinscripcion (utils/firmasArchivo) — antes de escribirlo en disco (nunca como
// data URI en Mongo, ni en un servicio externo: son datos personales de menores, M03/habeas data).
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
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.use(authenticate);

router.post('/', checkRole(...STAFF_MATRICULAS), validate(enrollmentValidator.createEnrollment), createEnrollment);
router.get('/', checkRole(...STAFF_MATRICULAS), validate(enrollmentValidator.listEnrollments), listEnrollments);
router.get('/:id', checkRole(...STAFF_MATRICULAS), validate(enrollmentValidator.getEnrollment), getEnrollment);

router.patch('/:id/status', checkRole(...STAFF_MATRICULAS), validate(enrollmentValidator.updateStatus), updateStatus);
router.patch('/:id/grupo', checkRole(...STAFF_MATRICULAS), validate(enrollmentValidator.cambiarGrupo), cambiarGrupo);

router.post(
  '/:id/checklist/:tipoDocumento/upload',
  checkRole(...STAFF_MATRICULAS),
  validate(enrollmentValidator.cargarDocumento),
  upload.single('file'),
  cargarDocumento
);
router.patch(
  '/:id/checklist/:tipoDocumento/revisar',
  checkRole(...STAFF_MATRICULAS),
  validate(enrollmentValidator.revisarDocumento),
  revisarDocumento
);
router.get(
  '/:id/checklist/:tipoDocumento/archivo',
  checkRole(...STAFF_MATRICULAS),
  validate(enrollmentValidator.descargarDocumento),
  descargarDocumento
);

router.get('/:id/acta-compromiso.pdf', checkRole(...STAFF_MATRICULAS), validate(enrollmentValidator.descargarActa), descargarActa);

router.post(
  '/:id/checklist',
  checkRole(...STAFF_MATRICULAS),
  validate(enrollmentValidator.agregarDocumentoChecklist),
  agregarDocumentoChecklist
);

router.delete(
  '/:id/checklist/:tipoDocumento',
  checkRole(...STAFF_MATRICULAS),
  validate(enrollmentValidator.eliminarDocumentoChecklist),
  eliminarDocumentoChecklist
);

router.post(
  '/:id/sincronizar-requisitos',
  checkRole(...STAFF_MATRICULAS),
  validate(enrollmentValidator.getEnrollment),
  sincronizarRequisitos
);

router.patch(
  '/:id/checklist/:tipoDocumento/comentario',
  checkRole(...STAFF_MATRICULAS),
  validate(enrollmentValidator.actualizarComentario),
  actualizarComentarioDocumento
);

export default router;
