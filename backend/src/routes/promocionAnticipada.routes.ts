import { Router } from 'express';
import { ROLES } from '../constants/roles';
import * as c from '../controllers/promocionAnticipada.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as v from '../validators/promocionAnticipada.validator';

const router = Router();

router.use(authenticate);

const gestion = checkRole(ROLES.ADMIN, ROLES.COORDINADOR);
const rector = checkRole(ROLES.ADMIN);

// Configuración (criterios, pasos exigidos, trato de las notas): la lee coordinación y la cambia el administrador.
router.get('/configuracion', gestion, c.obtenerConfiguracion);
router.put('/configuracion', rector, validate(v.actualizarConfiguracion), c.actualizarConfiguracion);

// Trámites. Recomendar y decidir se hacen en las sesiones de M20 (casos de tipo PROMOCION_ANTICIPADA), no aquí.
router.get('/', gestion, validate(v.listar), c.listar);
router.post('/', gestion, validate(v.solicitar), c.solicitar);
router.get('/:id', gestion, validate(v.idTramite), c.obtener);
router.post('/:id/consentimiento', gestion, validate(v.consentimiento), c.consentimiento);
router.post('/:id/resolucion', rector, validate(v.resolucion), c.resolucion);
router.post('/:id/aplicar', rector, validate(v.aplicar), c.aplicar);
router.post('/:id/anular', gestion, validate(v.anular), c.anular);
router.get('/:id/integridad', gestion, validate(v.idTramite), c.integridad);
router.get('/:id/resolucion/pdf', gestion, validate(v.idTramite), c.resolucionPdf);

// La nivelación la registra también el docente que dicta la asignatura en el grupo nuevo: el servicio comprueba la clase.
router.post('/:id/nivelaciones/:subjectId', checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.DOCENTE), validate(v.nivelacion), c.nivelacion);

export default router;
