import { Router } from 'express';
import { ROLES } from '../constants/roles';
import * as ctrl from '../controllers/continuidad.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as v from '../validators/continuidad.validator';

const router = Router();

router.use(authenticate);

// Quién renueva el año siguiente: lo consultan matrículas y coordinación; lo registran el administrador y la secretaría (el servicio lo vuelve a comprobar).
router.get('/', checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA), validate(v.listar), ctrl.listar);
router.put('/:studentId', checkRole(ROLES.ADMIN, ROLES.SECRETARIA), validate(v.registrar), ctrl.registrar);

export default router;
