import { Router } from 'express';
import { ROLES } from '../../../constants/roles';
import {
  actualizarEstadoSubject,
  actualizarSubject,
  createSubject,
  listSubjects,
} from './subject.controller';
import { authenticate, checkRole } from '../../../middlewares/auth.middleware';
import validate from '../../../middlewares/validate.middleware';
import * as subjectValidator from './subject.validator';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(subjectValidator.createSubject),
  createSubject
);

router.get('/', validate(subjectValidator.listSubjects), listSubjects);

router.patch(
  '/:id',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(subjectValidator.actualizarSubject),
  actualizarSubject
);

// No hay DELETE: una asignatura nunca se elimina, solo se inactiva (trazabilidad).
router.patch(
  '/:id/estado',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(subjectValidator.actualizarEstadoSubject),
  actualizarEstadoSubject
);

export default router;
