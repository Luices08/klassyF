import { Router } from 'express';
import multer from 'multer';
import { ROLES } from '../constants/roles';
import {
  bulkImportStudents,
  crearEstudianteCompleto,
  listarEstudiantes,
  obtenerFicha360,
} from '../controllers/student.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as studentValidator from '../validators/student.validator';

const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const STAFF = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];

router.use(authenticate);

router.get(
  '/',
  checkRole(...STAFF, ROLES.DOCENTE),
  validate(studentValidator.listarEstudiantes),
  listarEstudiantes
);

router.post(
  '/',
  checkRole(...STAFF),
  validate(studentValidator.crearEstudianteCompleto),
  crearEstudianteCompleto
);

router.post('/bulk-import', checkRole(...STAFF), upload.single('file'), bulkImportStudents);

router.get(
  '/:id',
  checkRole(...STAFF, ROLES.DOCENTE),
  validate(studentValidator.obtenerFicha360),
  obtenerFicha360
);

export default router;
