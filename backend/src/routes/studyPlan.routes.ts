import { Router } from 'express';
import { ROLES } from '../constants/roles';
import { setStudyPlan } from '../controllers/studyPlan.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as studyPlanValidator from '../validators/studyPlan.validator';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  checkRole(ROLES.SUPERADMIN, ROLES.RECTOR, ROLES.COORDINADOR),
  validate(studyPlanValidator.setStudyPlan),
  setStudyPlan
);

export default router;
