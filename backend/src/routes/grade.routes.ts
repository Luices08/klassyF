import { Router } from 'express';
import { ROLES } from '../constants/roles';
import { actualizarEstado, listGrades } from '../controllers/grade.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as gradeValidator from '../validators/grade.validator';

const router = Router();

router.get('/', authenticate, validate(gradeValidator.listGrades), listGrades);

// Catalogo estructural de la institucion: solo ADMIN activa/desactiva grados.
router.patch(
  '/:id/estado',
  authenticate,
  checkRole(ROLES.ADMIN),
  validate(gradeValidator.actualizarEstado),
  actualizarEstado
);

export default router;
