import { Router } from 'express';
import { ROLES } from '../constants/roles';
import { setupInstitution } from '../controllers/institution.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as institutionValidator from '../validators/institution.validator';

const router = Router();

router.post(
  '/setup',
  authenticate,
  checkRole(ROLES.SUPERADMIN),
  validate(institutionValidator.setup),
  setupInstitution
);

export default router;
