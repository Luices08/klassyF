import { Router } from 'express';
import { ROLES } from '../../../constants/roles';
import { actualizarArea, actualizarEstadoArea, createArea, listAreas } from './area.controller';
import { authenticate, checkRole } from '../../../middlewares/auth.middleware';
import validate from '../../../middlewares/validate.middleware';
import * as areaValidator from './area.validator';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(areaValidator.createArea),
  createArea
);

// Lectura abierta a cualquier rol autenticado (docentes/coordinacion necesitan
// listar areas para elegir area_id al crear asignaturas, DBA o malla).
router.get('/', validate(areaValidator.listAreas), listAreas);

router.patch(
  '/:id',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(areaValidator.actualizarArea),
  actualizarArea
);

// No hay DELETE: un area nunca se elimina, solo se inactiva (trazabilidad).
router.patch(
  '/:id/estado',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(areaValidator.actualizarEstadoArea),
  actualizarEstadoArea
);

export default router;
