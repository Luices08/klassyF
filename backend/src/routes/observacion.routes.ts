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
const REGISTRAN: Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.COORDINADOR_CONVIVENCIA, ROLES.ORIENTADOR, ROLES.DOCENTE];
// Las faltas las registran el docente de área o titular y convivencia; el coordinador académico y orientación no.
const REGISTRAN_FALTA: Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR_CONVIVENCIA, ROLES.DOCENTE];
const GESTORES: Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR_CONVIVENCIA];

router.use(authenticate);

// Catálogo para registrar (tipos de observación y faltas del manual) y política. Los tipos y la política los configuran ADMIN y el
// coordinador de convivencia; las faltas del manual se gestionan en /convivencia/faltas (M15).
router.get('/catalogo', checkRole(...REGISTRAN), validate(v.listarCatalogo), ctrl.listarCatalogo);
router.post('/tipos', checkRole(...GESTORES), validate(v.crearTipo), ctrl.crearTipo);
router.patch('/tipos/:id', checkRole(...GESTORES), validate(v.actualizarTipo), ctrl.actualizarTipo);
router.patch('/tipos/:id/estado', checkRole(...GESTORES), validate(v.cambiarEstadoTipo), ctrl.cambiarEstadoTipo);
router.delete('/tipos/:id', checkRole(...GESTORES), validate(v.eliminarTipo), ctrl.eliminarTipo);

router.get('/configuracion', checkRole(...GESTORES), ctrl.obtenerConfiguracion);
router.patch('/configuracion', checkRole(...GESTORES), validate(v.actualizarConfiguracion), ctrl.actualizarConfiguracion);

// Buscador propio de M14: acotado a la sede o al vínculo docente, sin abrir /students.
router.get('/grupos', checkRole(...REGISTRAN), ctrl.listarGrupos);
router.get('/estudiantes', checkRole(...REGISTRAN), validate(v.buscarEstudiantes), ctrl.buscarEstudiantes);

router.post('/', checkRole(...REGISTRAN), validate(v.registrarObservacion), ctrl.registrarObservacion);
router.post('/faltas', checkRole(...REGISTRAN_FALTA), validate(v.registrarFalta), ctrl.registrarFalta);
router.get('/mias', checkRole(...REGISTRAN), validate(v.listarMisObservaciones), ctrl.listarMisObservaciones);
router.get('/mi-observador', checkRole(ROLES.ESTUDIANTE), ctrl.miObservador);
router.get('/estudiantes/:studentId', checkRole(...REGISTRAN), validate(v.historialDeEstudiante), ctrl.historialDeEstudiante);
router.get('/:id', checkRole(...REGISTRAN), validate(v.obtenerObservacion), ctrl.obtenerObservacion);
router.patch('/:id', checkRole(...REGISTRAN), validate(v.enmendarObservacion), ctrl.enmendarObservacion);
router.patch('/:id/anular', checkRole(...REGISTRAN), validate(v.anularObservacion), ctrl.anularObservacion);

// Seguimiento: notas, cumplimiento del compromiso y citación realizada (solo registro; el envío de avisos es de M28).
router.post('/:id/seguimientos', checkRole(...REGISTRAN), validate(v.agregarSeguimiento), ctrl.agregarSeguimiento);
router.patch('/:id/compromiso', checkRole(...REGISTRAN), validate(v.marcarCompromiso), ctrl.marcarCompromiso);
router.post('/:id/citacion', checkRole(...REGISTRAN), validate(v.registrarCitacionRealizada), ctrl.registrarCitacionRealizada);

export default router;
