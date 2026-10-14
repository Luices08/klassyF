import { Router } from 'express';
import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import {
  descargarPlanDeArea,
  listarPlanesDeArea,
  obtenerPlanDeArea,
  radicarPlanDeArea,
  reabrirPlanDeArea,
  revisarPlanDeArea,
} from '../controllers/planArea.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import { subirPdfPlaneacion } from '../middlewares/subirPdfPlaneacion.middleware';
import validate from '../middlewares/validate.middleware';
import * as planeacionValidator from '../validators/planeacion.validator';

const router = Router();

const GESTION: Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR];

router.use(authenticate);

// Coordinación ve todas las áreas; un docente, las que lidera y aquellas donde dicta clase (el servicio acota).
router.get('/', checkRole(...GESTION, ROLES.DOCENTE), validate(planeacionValidator.listarPlanesArea), listarPlanesDeArea);
router.get('/:id', checkRole(...GESTION, ROLES.DOCENTE), validate(planeacionValidator.idParam), obtenerPlanDeArea);
router.get('/:id/archivo', checkRole(...GESTION, ROLES.DOCENTE), validate(planeacionValidator.archivoDePlan), descargarPlanDeArea);

// Solo el líder del área radica su plan de área: ni el ADMIN ni el COORDINADOR lo suben en su nombre (el servicio lo comprueba).
router.post('/', checkRole(ROLES.DOCENTE), subirPdfPlaneacion, validate(planeacionValidator.radicarPlanArea), radicarPlanDeArea);

router.patch('/:id/revision', checkRole(...GESTION), validate(planeacionValidator.revisarPlan), revisarPlanDeArea);
// Reabrir una aprobación es decisión del administrador, con motivo (mismo criterio que reabrir un periodo cerrado en M05).
router.patch('/:id/reabrir', checkRole(ROLES.ADMIN), validate(planeacionValidator.reabrirPlan), reabrirPlanDeArea);

export default router;
