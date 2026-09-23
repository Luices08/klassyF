import { Router } from 'express';
import { ROLES } from '../constants/roles';
import { createArea, listAreas } from '../controllers/area.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as areaValidator from '../validators/area.validator';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  checkRole(ROLES.SUPERADMIN, ROLES.ADMIN, ROLES.COORDINADOR),
  validate(areaValidator.createArea),
  createArea
);

// Lectura abierta a cualquier rol autenticado (docentes/coordinacion necesitan
// listar areas para elegir area_id al crear asignaturas, DBA o malla).
router.get('/', validate(areaValidator.listAreas), listAreas);

export default router;
