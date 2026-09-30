import { Router } from 'express';
import { ROLES } from '../constants/roles';
import {
  actualizarPlantillaFranjas,
  getInstitution,
  getLimitesCarga,
  setupInstitution,
  updateInstitution,
  updateLimitesCarga,
} from '../controllers/institution.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as institutionValidator from '../validators/institution.validator';

const router = Router();

router.get('/', authenticate, getInstitution);

// M08: Topes de carga horaria docente por nivel (Decreto 1850)
router.get(
  '/limites-carga',
  authenticate,
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  getLimitesCarga
);

router.patch(
  '/limites-carga',
  authenticate,
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(institutionValidator.updateLimitesCarga),
  updateLimitesCarga
);

router.post(
  '/setup',
  authenticate,
  checkRole(ROLES.ADMIN),
  validate(institutionValidator.setup),
  setupInstitution
);

// Solo existe una institucion por despliegue: se modifica en lugar de crear otra.
router.patch(
  '/',
  authenticate,
  checkRole(ROLES.ADMIN),
  validate(institutionValidator.updateInstitution),
  updateInstitution
);

router.put(
  '/plantilla-franjas',
  authenticate,
  checkRole(ROLES.ADMIN),
  validate(institutionValidator.plantillaFranjas),
  actualizarPlantillaFranjas
);

export default router;
