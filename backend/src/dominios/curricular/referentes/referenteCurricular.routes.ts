import { Router } from 'express';
import { ROLES } from '../../../constants/roles';
import {
  createReferentes,
  getPanelApoyo,
  listOrganizadoresPorArea,
  listReferentes,
} from './referenteCurricular.controller';
import { authenticate, checkRole } from '../../../middlewares/auth.middleware';
import validate from '../../../middlewares/validate.middleware';
import * as referenteCurricularValidator from './referenteCurricular.validator';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(referenteCurricularValidator.createReferentes),
  createReferentes
);

// Lectura abierta: el docente necesita filtrar por grade_id/area_id para elegir DBA.
router.get('/', validate(referenteCurricularValidator.listReferentes), listReferentes);
router.get(
  '/organizadores/:areaId',
  validate(referenteCurricularValidator.organizadoresParams),
  listOrganizadoresPorArea
);
router.get('/apoyo', validate(referenteCurricularValidator.panelApoyoQuery), getPanelApoyo);

export default router;
