import { Router } from 'express';
import { ROLES } from '../constants/roles';
import { createSubject, listSubjects } from '../controllers/subject.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as subjectValidator from '../validators/subject.validator';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  checkRole(ROLES.SUPERADMIN, ROLES.RECTOR, ROLES.COORDINADOR),
  validate(subjectValidator.createSubject),
  createSubject
);

router.get('/', validate(subjectValidator.listSubjects), listSubjects);

export default router;
