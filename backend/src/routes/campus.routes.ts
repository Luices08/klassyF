import { Router } from 'express';
import { ROLES } from '../constants/roles';
import { crearSede, listCampuses } from '../controllers/campus.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as campusValidator from '../validators/campus.validator';

const router = Router();

router.get('/', authenticate, validate(campusValidator.listCampuses), listCampuses);

// Administracion estructural de la institucion: solo SUPERADMIN/ADMIN crean sedes.
router.post(
  '/',
  authenticate,
  checkRole(ROLES.SUPERADMIN, ROLES.ADMIN),
  validate(campusValidator.crearSede),
  crearSede
);

export default router;
