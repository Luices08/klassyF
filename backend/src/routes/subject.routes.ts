import { Router } from 'express';
import { ROLES } from '../constants/roles';
import {
  actualizarEstadoSubject,
  actualizarSubject,
  createSubject,
  listSubjects,
} from '../controllers/subject.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as subjectValidator from '../validators/subject.validator';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  checkRole(ROLES.COORDINADOR),
  validate(subjectValidator.createSubject),
  createSubject
);

router.get('/', validate(subjectValidator.listSubjects), listSubjects);

router.patch(
  '/:id',
  checkRole(ROLES.COORDINADOR),
  validate(subjectValidator.actualizarSubject),
  actualizarSubject
);

// No hay DELETE: una asignatura nunca se elimina, solo se inactiva (trazabilidad).
router.patch(
  '/:id/estado',
  checkRole(ROLES.COORDINADOR),
  validate(subjectValidator.actualizarEstadoSubject),
  actualizarEstadoSubject
);

export default router;
