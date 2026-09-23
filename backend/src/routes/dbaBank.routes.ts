import { Router } from 'express';
import { ROLES } from '../constants/roles';
import { createDbaEntries, listDbaEntries } from '../controllers/dbaBank.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as dbaBankValidator from '../validators/dbaBank.validator';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  checkRole(ROLES.SUPERADMIN, ROLES.RECTOR, ROLES.COORDINADOR),
  validate(dbaBankValidator.createDbaEntries),
  createDbaEntries
);

// Lectura abierta: el docente necesita filtrar por grade_id/area_id para elegir DBA.
router.get('/', validate(dbaBankValidator.listDbaEntries), listDbaEntries);

export default router;
