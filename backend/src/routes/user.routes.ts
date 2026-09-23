import { Router } from 'express';
import { ROLES } from '../constants/roles';
import { getProfile, upsertProfile } from '../controllers/studentProfile.controller';
import { createUser, listUsers } from '../controllers/user.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as studentProfileValidator from '../validators/studentProfile.validator';
import * as userValidator from '../validators/user.validator';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  checkRole(ROLES.SUPERADMIN, ROLES.RECTOR, ROLES.COORDINADOR, ROLES.SECRETARIA),
  validate(userValidator.createUser),
  createUser
);

router.get(
  '/',
  checkRole(ROLES.SUPERADMIN, ROLES.RECTOR, ROLES.COORDINADOR, ROLES.SECRETARIA, ROLES.DOCENTE),
  validate(userValidator.listUsers),
  listUsers
);

// Hoja de vida del estudiante (StudentProfile) - anidada bajo /users/:userId
router.put(
  '/:userId/student-profile',
  checkRole(ROLES.SUPERADMIN, ROLES.RECTOR, ROLES.COORDINADOR, ROLES.SECRETARIA),
  validate(studentProfileValidator.upsertProfile),
  upsertProfile
);

router.get(
  '/:userId/student-profile',
  checkRole(ROLES.SUPERADMIN, ROLES.RECTOR, ROLES.COORDINADOR, ROLES.SECRETARIA, ROLES.DOCENTE),
  validate(studentProfileValidator.getProfile),
  getProfile
);

export default router;
