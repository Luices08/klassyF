import { Router } from 'express';
import { ROLES } from '../constants/roles';
import { setPeriodLock } from '../controllers/periodLock.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as periodLockValidator from '../validators/periodLock.validator';

const router = Router();

router.patch(
  '/lock',
  authenticate,
  checkRole(ROLES.SUPERADMIN, ROLES.RECTOR, ROLES.COORDINADOR),
  validate(periodLockValidator.setPeriodLock),
  setPeriodLock
);

export default router;
