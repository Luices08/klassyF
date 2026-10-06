import { Router } from 'express';
import { ROLES } from '../../../constants/roles';
import {
  actualizarEspacio,
  cambiarEstadoEspacio,
  crearEspacio,
  eliminarEspacio,
  listarEspacios,
} from './espacio.controller';
import { authenticate, checkRole } from '../../../middlewares/auth.middleware';
import validate from '../../../middlewares/validate.middleware';
import * as espacioValidator from './espacio.validator';

const router = Router();

router.use(authenticate);

// Lectura abierta a cualquier rol autenticado: el inventario de aulas lo consultan grupos, horarios y docentes.
router.get('/', validate(espacioValidator.listarEspacios), listarEspacios);

// Administracion del inventario: ADMIN y COORDINADOR.
const gestores = checkRole(ROLES.ADMIN, ROLES.COORDINADOR);
router.post('/', gestores, validate(espacioValidator.crearEspacio), crearEspacio);
router.patch('/:id', gestores, validate(espacioValidator.actualizarEspacio), actualizarEspacio);
router.patch('/:id/estado', gestores, validate(espacioValidator.cambiarEstadoEspacio), cambiarEstadoEspacio);
router.delete('/:id', gestores, validate(espacioValidator.eliminarEspacio), eliminarEspacio);

export default router;
