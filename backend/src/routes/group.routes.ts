import { Router } from 'express';
import { ROLES } from '../constants/roles';
import {
  actualizarEstadoGrupo,
  cambiarAulaGrupo,
  createGroup,
  listGroups,
  obtenerFicha,
  obtenerHorarioGrupo,
} from '../controllers/group.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as groupValidator from '../validators/group.validator';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(groupValidator.createGroup),
  createGroup
);

// Lectura de disponibilidad de cupos: abierta a cualquier rol autenticado.
router.get('/', validate(groupValidator.listGroups), listGroups);

// Ficha 360° (solo lectura): trae el roster de estudiantes y la carga docente, así que se limita a quien gestiona grupos.
router.get('/:groupId/ficha', checkRole(ROLES.ADMIN, ROLES.COORDINADOR), validate(groupValidator.groupIdParam), obtenerFicha);
router.get(
  '/:groupId/ficha/horario',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(groupValidator.groupIdParam),
  obtenerHorarioGrupo
);

router.patch(
  '/:groupId',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(groupValidator.actualizarEstado),
  actualizarEstadoGrupo
);

// M10: reasignar el salón titular de un grupo ya creado (reparaciones locativas, reorganización de aforos).
router.patch(
  '/:groupId/aula',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(groupValidator.cambiarAula),
  cambiarAulaGrupo
);

export default router;
