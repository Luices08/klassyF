import { Router } from 'express';
import { ROLES } from '../constants/roles';
import * as ctrl from '../controllers/academicYear.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as v from '../validators/academicYear.validator';

const router = Router();

const soloAdmin = [authenticate, checkRole(ROLES.ADMIN)];
// El coordinador controla aperturas de planillas y prorrogas (CU-CRD-05).
const adminOCoordinador = [authenticate, checkRole(ROLES.ADMIN, ROLES.COORDINADOR)];

// Consulta del calendario: cualquier usuario autenticado (docentes y estudiantes en solo lectura).
router.get('/', authenticate, ctrl.listarAnios);
router.get('/actual', authenticate, ctrl.obtenerAnioActivo);
router.get('/:id', authenticate, validate(v.anioPorId), ctrl.obtenerAnio);

router.post('/', ...soloAdmin, validate(v.crearAnio), ctrl.crearAnio);
router.patch('/:id', ...soloAdmin, validate(v.actualizarAnio), ctrl.actualizarAnio);
router.patch('/:id/activar', ...soloAdmin, validate(v.anioPorId), ctrl.activarAnio);
router.get('/:id/cierre', ...soloAdmin, validate(v.anioPorId), ctrl.verificarCierre);
router.post('/:id/cerrar', ...soloAdmin, validate(v.cerrarAnio), ctrl.cerrarAnio);

router.patch(
  '/:id/periodos/:numero/estado',
  ...adminOCoordinador,
  validate(v.cambiarEstadoPeriodo),
  ctrl.cambiarEstadoPeriodo
);

router.get('/:id/prorrogas', ...adminOCoordinador, validate(v.anioPorId), ctrl.listarProrrogas);
router.post('/:id/prorrogas', ...adminOCoordinador, validate(v.otorgarProrroga), ctrl.otorgarProrroga);
router.patch('/:id/prorrogas/:prorrogaId/revocar', ...adminOCoordinador, validate(v.revocarProrroga), ctrl.revocarProrroga);

router.post('/:id/eventos', ...soloAdmin, validate(v.crearEvento), ctrl.crearEvento);
router.patch('/:id/eventos/:eventoId', ...soloAdmin, validate(v.actualizarEvento), ctrl.actualizarEvento);
router.delete('/:id/eventos/:eventoId', ...soloAdmin, validate(v.eliminarEvento), ctrl.eliminarEvento);

router.put('/:id/sedes/:sedeId/calendario', ...soloAdmin, validate(v.guardarCalendarioSede), ctrl.guardarCalendarioSede);
router.delete('/:id/sedes/:sedeId/calendario', ...soloAdmin, validate(v.quitarCalendarioSede), ctrl.quitarCalendarioSede);

export default router;
