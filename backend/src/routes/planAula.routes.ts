import { Router } from 'express';
import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import {
  adoptarPlanDeAula,
  bandejaPlanesDeAula,
  descargarPlanDeAula,
  misPlanesDeAula,
  obtenerPlanDeAula,
  planDeAulaDeAsignacion,
  radicarPlanDeAula,
  reabrirPlanDeAula,
  revisarPlanDeAula,
} from '../controllers/planAula.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import { subirPdfPlaneacion } from '../middlewares/subirPdfPlaneacion.middleware';
import validate from '../middlewares/validate.middleware';
import * as planeacionValidator from '../validators/planeacion.validator';

const router = Router();

const GESTION: Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR];

router.use(authenticate);

// Rutas fijas antes de `/:id`, que de lo contrario las tomaría como un id.
router.get('/mios', checkRole(ROLES.DOCENTE), validate(planeacionValidator.misPlanesAula), misPlanesDeAula);
router.get('/', checkRole(...GESTION), validate(planeacionValidator.bandejaPlanesAula), bandejaPlanesDeAula);
// El visor del formulario de actividades (M11): el plan de aula de una clase en un periodo.
router.get('/de-asignacion', checkRole(ROLES.DOCENTE, ...GESTION), validate(planeacionValidator.planDeAulaDeAsignacion), planDeAulaDeAsignacion);
router.post('/adoptar', checkRole(ROLES.DOCENTE), validate(planeacionValidator.adoptarPlanAula), adoptarPlanDeAula);

// Radica el docente asignado; coordinación no sube planes en nombre de nadie.
router.post('/', checkRole(ROLES.DOCENTE), subirPdfPlaneacion, validate(planeacionValidator.radicarPlanAula), radicarPlanDeAula);

router.get('/:id', checkRole(...GESTION, ROLES.DOCENTE), validate(planeacionValidator.idParam), obtenerPlanDeAula);
router.get('/:id/archivo', checkRole(...GESTION, ROLES.DOCENTE), validate(planeacionValidator.archivoDePlan), descargarPlanDeAula);
router.patch('/:id/revision', checkRole(...GESTION), validate(planeacionValidator.revisarPlan), revisarPlanDeAula);
router.patch('/:id/reabrir', checkRole(ROLES.ADMIN), validate(planeacionValidator.reabrirPlan), reabrirPlanDeAula);

export default router;
