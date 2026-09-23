import { Router } from 'express';
import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import { createEnrollment, updateStatus } from '../controllers/enrollment.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as enrollmentValidator from '../validators/enrollment.validator';

const router = Router();

const STAFF_MATRICULAS: Rol[] = [ROLES.SUPERADMIN, ROLES.RECTOR, ROLES.COORDINADOR, ROLES.SECRETARIA];

router.use(authenticate);

router.post(
  '/',
  checkRole(...STAFF_MATRICULAS),
  validate(enrollmentValidator.createEnrollment),
  createEnrollment
);

router.patch(
  '/:id/status',
  checkRole(...STAFF_MATRICULAS),
  validate(enrollmentValidator.updateStatus),
  updateStatus
);

export default router;
