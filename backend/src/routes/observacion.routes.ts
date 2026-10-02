import { Router } from 'express';
import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import * as ctrl from '../controllers/observacion.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as v from '../validators/observacion.validator';

const router = Router();

// El rol solo abre la puerta: quién ve a qué estudiante lo decide `permisoSobreEstudiante` en el servicio.
// SECRETARIA y ACUDIENTE no tienen acceso a convivencia; el estudiante solo a su propio observador.
const REGISTRAN: Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.COORDINADOR_CONVIVENCIA, ROLES.DOCENTE];
const GESTORES: Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR_CONVIVENCIA];
const CONSULTAN_HISTORIAL: Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.COORDINADOR_CONVIVENCIA, ROLES.DOCENTE];

router.use(authenticate);

// Catálogo (tipos, categorías y frases/faltas del manual) y política: la configuran ADMIN y el coordinador de convivencia.
router.get('/catalogo', checkRole(...REGISTRAN), validate(v.listarCatalogo), ctrl.listarCatalogo);
router.post('/tipos', checkRole(...GESTORES), validate(v.crearTipo), ctrl.crearTipo);
router.patch('/tipos/:id', checkRole(...GESTORES), validate(v.actualizarTipo), ctrl.actualizarTipo);
router.patch('/tipos/:id/estado', checkRole(...GESTORES), validate(v.cambiarEstadoTipo), ctrl.cambiarEstadoTipo);
router.delete('/tipos/:id', checkRole(...GESTORES), validate(v.eliminarTipo), ctrl.eliminarTipo);

router.post('/categorias', checkRole(...GESTORES), validate(v.crearCategoria), ctrl.crearCategoria);
router.patch('/categorias/:id', checkRole(...GESTORES), validate(v.actualizarCategoria), ctrl.actualizarCategoria);
router.patch('/categorias/:id/estado', checkRole(...GESTORES), validate(v.cambiarEstadoCategoria), ctrl.cambiarEstadoCategoria);
router.delete('/categorias/:id', checkRole(...GESTORES), validate(v.eliminarCategoria), ctrl.eliminarCategoria);

router.post('/descriptores', checkRole(...GESTORES), validate(v.crearDescriptor), ctrl.crearDescriptor);
router.patch('/descriptores/:id', checkRole(...GESTORES), validate(v.actualizarDescriptor), ctrl.actualizarDescriptor);
router.patch('/descriptores/:id/estado', checkRole(...GESTORES), validate(v.cambiarEstadoDescriptor), ctrl.cambiarEstadoDescriptor);
router.delete('/descriptores/:id', checkRole(...GESTORES), validate(v.eliminarDescriptor), ctrl.eliminarDescriptor);

router.get('/configuracion', checkRole(...GESTORES), ctrl.obtenerConfiguracion);
router.patch('/configuracion', checkRole(...GESTORES), validate(v.actualizarConfiguracion), ctrl.actualizarConfiguracion);

// Buscador propio de M14: acotado a la sede o al vínculo docente, sin abrir /students.
router.get('/grupos', checkRole(...REGISTRAN), ctrl.listarGrupos);
router.get('/estudiantes', checkRole(...REGISTRAN), validate(v.buscarEstudiantes), ctrl.buscarEstudiantes);

router.post('/', checkRole(...REGISTRAN), validate(v.registrarObservacion), ctrl.registrarObservacion);
router.get('/mias', checkRole(...REGISTRAN), validate(v.listarMisObservaciones), ctrl.listarMisObservaciones);
router.get('/mi-observador', checkRole(ROLES.ESTUDIANTE), ctrl.miObservador);
router.get('/estudiantes/:studentId', checkRole(...CONSULTAN_HISTORIAL), validate(v.historialDeEstudiante), ctrl.historialDeEstudiante);
router.get('/:id', checkRole(...REGISTRAN), validate(v.obtenerObservacion), ctrl.obtenerObservacion);
router.patch('/:id', checkRole(...REGISTRAN), validate(v.enmendarObservacion), ctrl.enmendarObservacion);
router.patch('/:id/anular', checkRole(...REGISTRAN), validate(v.anularObservacion), ctrl.anularObservacion);

export default router;
