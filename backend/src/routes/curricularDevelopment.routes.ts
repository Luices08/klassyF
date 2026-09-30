import { Router } from 'express';
import { ROLES } from '../constants/roles';
import {
  getByAssignmentAndPeriod,
  listDevelopments,
  review,
  submit,
  upsertDraft,
} from '../controllers/curricularDevelopment.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as curricularDevelopmentValidator from '../validators/curricularDevelopment.validator';

const router = Router();

router.use(authenticate);

// 1. Listado de desarrollos curriculares (Bandeja de revisión o lista de cursos del docente)
router.get(
  '/',
  checkRole(ROLES.DOCENTE, ROLES.COORDINADOR, ROLES.ADMIN),
  validate(curricularDevelopmentValidator.listDevelopments),
  listDevelopments
);

// 2. Consulta de un desarrollo específico por asignación y periodo
router.get(
  '/assignment/:assignmentId/periodo/:periodoNumero',
  validate(curricularDevelopmentValidator.getOneParams),
  getByAssignmentAndPeriod
);

// 3. Crear o actualizar borrador (solo docente titular)
router.post(
  '/',
  checkRole(ROLES.DOCENTE),
  validate(curricularDevelopmentValidator.upsertDraft),
  upsertDraft
);

// 4. Enviar a revisión a Coordinación
router.patch(
  '/:id/submit',
  checkRole(ROLES.DOCENTE),
  validate(curricularDevelopmentValidator.submitParams),
  submit
);

// 5. Revisar y emitir concepto (Aprobar o Devolver con observaciones)
router.patch(
  '/:id/review',
  checkRole(ROLES.COORDINADOR, ROLES.ADMIN),
  validate(curricularDevelopmentValidator.review),
  review
);

export default router;
