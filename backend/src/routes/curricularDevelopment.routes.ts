import { Router } from 'express';
import { ROLES } from '../constants/roles';
import { review, submit, upsertDraft } from '../controllers/curricularDevelopment.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as curricularDevelopmentValidator from '../validators/curricularDevelopment.validator';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  checkRole(ROLES.DOCENTE),
  validate(curricularDevelopmentValidator.upsertDraft),
  upsertDraft
);

router.patch(
  '/:id/submit',
  checkRole(ROLES.DOCENTE),
  validate(curricularDevelopmentValidator.submitParams),
  submit
);

router.patch(
  '/:id/review',
  checkRole(ROLES.COORDINADOR, ROLES.RECTOR, ROLES.SUPERADMIN),
  validate(curricularDevelopmentValidator.review),
  review
);

export default router;
