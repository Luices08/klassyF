import { Router } from 'express';
import { ROLES } from '../constants/roles';
import {
  actualizarHorario,
  crearJornada,
  franjasDesdePlantilla,
  listarJornadas,
} from '../controllers/jornadaOperativa.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as jornadaOperativaValidator from '../validators/jornadaOperativa.validator';

const router = Router();

router.use(authenticate);

// Administracion estructural de la sede: solo ADMIN habilita jornadas.
router.post(
  '/',
  checkRole(ROLES.ADMIN),
  validate(jornadaOperativaValidator.crearJornada),
  crearJornada
);

router.get('/', validate(jornadaOperativaValidator.listarJornadas), listarJornadas);

// Estructura de tiempo de la jornada (dias habiles y franjas): la define quien arma los horarios, no solo el ADMIN.
const gestoresDeHorario = checkRole(ROLES.ADMIN, ROLES.COORDINADOR);
router.patch('/:id/horario', gestoresDeHorario, validate(jornadaOperativaValidator.actualizarHorario), actualizarHorario);
router.get(
  '/:id/horario/plantilla',
  gestoresDeHorario,
  validate(jornadaOperativaValidator.franjasDesdePlantilla),
  franjasDesdePlantilla
);

export default router;
