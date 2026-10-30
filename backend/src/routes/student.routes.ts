import { Router } from 'express';
import multer from 'multer';
import { ROLES } from '../constants/roles';
import {
  bulkImportStudents,
  crearEstudianteCompleto,
  listarEstudiantes,
  obtenerFicha360,
  expedienteDigital,
} from '../controllers/student.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import { marcarRevisado } from '../controllers/importacionSimat.controller';
import * as importacionSimatValidator from '../validators/importacionSimat.validator';
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

// Antes de '/:id': Express tomaría «expediente» como parte de otra ruta. Quién ve qué lo decide el servicio (y cada descarga, el módulo dueño del archivo).
router.get('/:id/expediente', checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA), validate(studentValidator.obtenerFicha360), expedienteDigital);

// Quien llegó por la importación desde SIMAT queda «pendiente de revisión» hasta que secretaría confirma sus datos y su acudiente.
router.patch('/:id/revision-simat', checkRole(ROLES.ADMIN, ROLES.SECRETARIA), validate(importacionSimatValidator.revisarEstudiante), marcarRevisado);

router.get(
  '/:id',
  checkRole(...STAFF, ROLES.DOCENTE),
  validate(studentValidator.obtenerFicha360),
  obtenerFicha360
);

export default router;
