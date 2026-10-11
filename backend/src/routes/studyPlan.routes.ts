import { Router } from 'express';
import { ROLES } from '../constants/roles';
import {
  configurarAsignaturasGrado,
  configurarAsignaturasMultiplesGrados,
  configurarDistribucionGrupo,
  configurarDistribucionJornada,
  configurarEvaluacionArea,
  configurarEvaluacionAreaGrupo,
  crearPlanDesdeAnioAnterior,
  obtenerStudyPlan,
} from '../controllers/studyPlan.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as studyPlanValidator from '../validators/studyPlan.validator';

const router = Router();

router.use(authenticate);

router.get('/', validate(studyPlanValidator.obtenerStudyPlan), obtenerStudyPlan);

// "Crear a partir del plan del año anterior": copia Configuracion General y
// de Evaluacion hacia un año lectivo nuevo que todavia no tiene plan.
router.post(
  '/copiar-anio-anterior',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(studyPlanValidator.crearPlanDesdeAnioAnterior),
  crearPlanDesdeAnioAnterior
);

// 2.1 Configuracion General: asignaturas e intensidad horaria por grado.
router.post(
  '/asignaturas-grado',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(studyPlanValidator.configurarAsignaturasGrado),
  configurarAsignaturasGrado
);

// 2.1 Configuracion General: asignaturas e intensidad horaria para múltiples grados en bloque.
router.post(
  '/asignaturas-grados',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(studyPlanValidator.configurarAsignaturasMultiplesGrados),
  configurarAsignaturasMultiplesGrados
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

// 2.2b Distribucion por Jornadas: extension de una jornada completa sobre el grado.
router.post(
  '/distribucion-jornada',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(studyPlanValidator.configurarDistribucionJornada),
  configurarDistribucionJornada
);

// 2.3b Configuracion de Evaluacion por Grupo: ponderacion de area para un grupo especifico.
router.post(
  '/evaluacion-area-grupo',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(studyPlanValidator.configurarEvaluacionAreaGrupo),
  configurarEvaluacionAreaGrupo
);

export default router;
