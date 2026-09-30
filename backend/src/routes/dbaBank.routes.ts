import { Router } from 'express';
import { ROLES } from '../constants/roles';
import { createDbaEntries, listDbaEntries, listOrganizadoresPorArea } from '../controllers/dbaBank.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as dbaBankValidator from '../validators/dbaBank.validator';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(dbaBankValidator.createDbaEntries),
  createDbaEntries
);

// Lectura abierta: el docente necesita filtrar por grade_id/area_id para elegir DBA.
router.get('/', validate(dbaBankValidator.listDbaEntries), listDbaEntries);
router.get('/organizadores/:areaId', listOrganizadoresPorArea);

export default router;
