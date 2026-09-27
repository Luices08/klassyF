import { Router } from 'express';
import { ROLES } from '../constants/roles';
import {
  configurarAsignaturasGrado,
  configurarDistribucionGrupo,
  configurarEvaluacionArea,
  obtenerStudyPlan,
} from '../controllers/studyPlan.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as studyPlanValidator from '../validators/studyPlan.validator';

const router = Router();

router.use(authenticate);

router.get('/', validate(studyPlanValidator.obtenerStudyPlan), obtenerStudyPlan);

// 2.1 Configuracion General: asignaturas e intensidad horaria por grado.
router.post(
  '/asignaturas-grado',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(studyPlanValidator.configurarAsignaturasGrado),
  configurarAsignaturasGrado
);

// 2.3 Configuracion de Evaluacion: metodo de calculo y ponderacion por area.
router.post(
  '/evaluacion-area',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(studyPlanValidator.configurarEvaluacionArea),
  configurarEvaluacionArea
);

// 2.2 Distribucion por Grupos: personalizacion de un grupo sobre su grado.
router.post(
  '/distribucion-grupo',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(studyPlanValidator.configurarDistribucionGrupo),
  configurarDistribucionGrupo
);

export default router;
