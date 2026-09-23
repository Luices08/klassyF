import { Router } from 'express';
import { ROLES } from '../constants/roles';
import { createTeacherAssignment, myLoad } from '../controllers/teacherAssignment.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as teacherAssignmentValidator from '../validators/teacherAssignment.validator';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  checkRole(ROLES.SUPERADMIN, ROLES.ADMIN, ROLES.COORDINADOR),
  validate(teacherAssignmentValidator.createTeacherAssignment),
  createTeacherAssignment
);

router.get('/my-load', checkRole(ROLES.DOCENTE), myLoad);

export default router;
