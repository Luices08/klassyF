import fs from 'fs';
import { Router } from 'express';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import {
  cambiarGrupo,
  cargarDocumento,
  createEnrollment,
  descargarActa,
  descargarDocumento,
  getEnrollment,
  listEnrollments,
  revisarDocumento,
  updateStatus,
} from '../controllers/enrollment.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import ApiError from '../utils/ApiError';
import { carpetaMatricula } from '../utils/uploadPaths';
import * as enrollmentValidator from '../validators/enrollment.validator';

const router = Router();

const STAFF_MATRICULAS: Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];

// Documentos de matricula (cedulas, certificados, fotos) en disco, en el
// mismo VPS del colegio — nunca como data URI en Mongo (pesan demasiado) ni
// en un servicio externo (son datos personales de menores, ver M03/habeas data).
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const carpeta = carpetaMatricula(req.params.id as string);
    fs.mkdirSync(carpeta, { recursive: true });
    cb(null, carpeta);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.params.tipoDocumento}-${Date.now()}${ext}`);
  },
});

const TIPOS_PERMITIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function soloDocumentosYFotos(_req: Express.Request, file: Express.Multer.File, cb: FileFilterCallback) {
  if (!TIPOS_PERMITIDOS.has(file.mimetype)) {
    return cb(new ApiError(400, 'Solo se aceptan PDF, JPG, PNG o WEBP.') as unknown as Error);
  }
  cb(null, true);
}

const upload = multer({ storage, fileFilter: soloDocumentosYFotos, limits: { fileSize: 5 * 1024 * 1024 } });

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

export default router;
