import { Router } from 'express';
import { ROLES } from '../constants/roles';
import {
  createActivity,
  createSubmission,
  gradeActivity,
  listActivities,
} from '../controllers/activity.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as activityValidator from '../validators/activity.validator';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  checkRole(ROLES.DOCENTE),
  validate(activityValidator.createActivity),
  createActivity
);

router.get('/', validate(activityValidator.listActivities), listActivities);

router.post(
  '/:id/submissions',
  checkRole(ROLES.ESTUDIANTE),
  validate(activityValidator.createSubmission),
  createSubmission
);

router.patch(
  '/:id/grade',
  checkRole(ROLES.DOCENTE),
  validate(activityValidator.gradeActivity),
  gradeActivity
);

export default router;
