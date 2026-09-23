import { Router } from 'express';
import { ROLES } from '../constants/roles';
import { crearJornada, listarJornadas } from '../controllers/jornadaOperativa.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as jornadaOperativaValidator from '../validators/jornadaOperativa.validator';

const router = Router();

router.use(authenticate);

// Administracion estructural de la sede: solo SUPERADMIN/ADMIN habilitan jornadas.
router.post(
  '/',
  checkRole(ROLES.SUPERADMIN, ROLES.ADMIN),
  validate(jornadaOperativaValidator.crearJornada),
  crearJornada
);

router.get('/', validate(jornadaOperativaValidator.listarJornadas), listarJornadas);

export default router;
