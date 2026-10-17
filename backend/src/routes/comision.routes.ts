import { Router } from 'express';
import { ROLES } from '../constants/roles';
import * as c from '../controllers/comision.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as v from '../validators/comision.validator';

const router = Router();

router.use(authenticate);

const gestion = checkRole(ROLES.ADMIN, ROLES.COORDINADOR);

// Configuración (semáforo, reprobación masiva, quórum, mayoría): la lee coordinación y la cambia el administrador.
router.get('/configuracion', gestion, c.obtenerConfiguracion);
router.put('/configuracion', checkRole(ROLES.ADMIN), validate(v.actualizarConfiguracion), c.actualizarConfiguracion);

// Tablero de riesgo y ficha técnica del estudiante (la ficha también la leen los integrantes de una sesión donde está el estudiante: el servicio lo comprueba).
router.get('/tablero', gestion, validate(v.tablero), c.tablero);
router.get('/estudiantes/:studentId/ficha', validate(v.ficha), c.fichaDeEstudiante);

// Sesiones: gestionan ADMIN/COORDINADOR (el Consejo Directivo, solo ADMIN: lo comprueba el servicio); los integrantes leen y firman las suyas.
router.get('/sesiones', validate(v.listarSesiones), c.listarSesiones);
router.post('/sesiones', gestion, validate(v.crearSesion), c.crearSesion);
router.get('/sesiones/:id', validate(v.idSesion), c.obtenerSesion);
router.patch('/sesiones/:id', gestion, validate(v.actualizarSesion), c.actualizarSesion);
router.post('/sesiones/:id/convocar', gestion, validate(v.idSesion), c.convocar);
router.post('/sesiones/:id/realizar', gestion, validate(v.idSesion), c.realizar);
router.post('/sesiones/:id/firmar', validate(v.firmar), c.firmar);
router.post('/sesiones/:id/anular', checkRole(ROLES.ADMIN), validate(v.anular), c.anular);
router.get('/sesiones/:id/integridad', validate(v.idSesion), c.integridad);
router.get('/sesiones/:id/pdf', validate(v.idSesion), c.pdf);

router.post('/sesiones/:id/casos', gestion, validate(v.agregarCaso), c.agregarCaso);
router.patch('/sesiones/:id/casos/:casoId', gestion, validate(v.actualizarCaso), c.actualizarCaso);
router.delete('/sesiones/:id/casos/:casoId', gestion, validate(v.quitarCaso), c.quitarCaso);

router.post('/sesiones/:id/compromisos', gestion, validate(v.agregarCompromiso), c.agregarCompromiso);
router.patch('/sesiones/:id/compromisos/:compromisoId', validate(v.actualizarCompromiso), c.actualizarCompromiso);

export default router;
