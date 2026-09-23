import { Router } from 'express';
import { ROLES } from '../constants/roles';
import { actualizarEstadoGrupo, createGroup, listGroups } from '../controllers/group.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as groupValidator from '../validators/group.validator';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  checkRole(ROLES.SUPERADMIN, ROLES.ADMIN, ROLES.COORDINADOR),
  validate(groupValidator.createGroup),
  createGroup
);

// Lectura de disponibilidad de cupos: abierta a cualquier rol autenticado.
router.get('/', validate(groupValidator.listGroups), listGroups);

router.patch(
  '/:groupId',
  checkRole(ROLES.SUPERADMIN, ROLES.ADMIN, ROLES.COORDINADOR),
  validate(groupValidator.actualizarEstado),
  actualizarEstadoGrupo
);

export default router;
