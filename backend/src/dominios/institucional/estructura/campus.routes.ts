import { Router } from 'express';
import { ROLES } from '../../../constants/roles';
import {
  actualizarEstadoSede,
  actualizarSede,
  crearSede,
  eliminarSede,
  listCampuses,
} from './campus.controller';
import { authenticate, checkRole } from '../../../middlewares/auth.middleware';
import validate from '../../../middlewares/validate.middleware';
import * as campusValidator from './campus.validator';

const router = Router();

router.get('/', authenticate, validate(campusValidator.listCampuses), listCampuses);

// Administracion estructural de la institucion: solo ADMIN gestiona sedes.
router.post(
  '/',
  authenticate,
  checkRole(ROLES.ADMIN),
  validate(campusValidator.crearSede),
  crearSede
);

router.patch(
  '/:id',
  authenticate,
  checkRole(ROLES.ADMIN),
  validate(campusValidator.actualizarSede),
  actualizarSede
);

router.patch(
  '/:id/estado',
  authenticate,
  checkRole(ROLES.ADMIN),
  validate(campusValidator.actualizarEstadoSede),
  actualizarEstadoSede
);

router.delete(
  '/:id',
  authenticate,
  checkRole(ROLES.ADMIN),
  validate(campusValidator.eliminarSede),
  eliminarSede
);

export default router;
