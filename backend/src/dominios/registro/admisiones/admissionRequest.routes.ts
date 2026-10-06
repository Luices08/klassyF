import { Router } from 'express';
import {
  aprobarSolicitud,
  listarSolicitudes,
  obtenerSolicitud,
  rechazarSolicitud,
} from './admissionRequest.controller';
import { ROLES } from '../../../constants/roles';
import { authenticate, checkRole } from '../../../middlewares/auth.middleware';
import validate from '../../../middlewares/validate.middleware';
import * as admissionValidator from './admissionRequest.validator';

const router = Router();

const STAFF = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];

router.use(authenticate);

router.get('/', checkRole(...STAFF), validate(admissionValidator.listarSolicitudes), listarSolicitudes);
router.get('/:id', checkRole(...STAFF), validate(admissionValidator.obtenerSolicitud), obtenerSolicitud);
router.patch(
  '/:id/aprobar',
  checkRole(...STAFF),
  validate(admissionValidator.aprobarSolicitud),
  aprobarSolicitud
);
router.patch(
  '/:id/rechazar',
  checkRole(...STAFF),
  validate(admissionValidator.rechazarSolicitud),
  rechazarSolicitud
);

export default router;
