import { Router } from 'express';
import { ROLES } from '../../../constants/roles';
import {
  actualizarAcudiente,
  actualizarEstadoAcudiente,
  listarAcudientes,
} from './guardian.controller';
import { authenticate, checkRole } from '../../../middlewares/auth.middleware';
import validate from '../../../middlewares/validate.middleware';
import * as guardianValidator from './guardian.validator';

const router = Router();

const STAFF = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];

router.use(authenticate);

router.get('/', checkRole(...STAFF), validate(guardianValidator.listarAcudientes), listarAcudientes);

router.patch('/:id', checkRole(...STAFF), validate(guardianValidator.actualizarAcudiente), actualizarAcudiente);

router.patch(
  '/:id/estado',
  checkRole(...STAFF),
  validate(guardianValidator.actualizarEstadoAcudiente),
  actualizarEstadoAcudiente
);

export default router;
