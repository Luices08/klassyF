import { Router } from 'express';
import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import { configurarVentana, listarVentanas } from '../controllers/ventanaPlanes.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as planeacionValidator from '../validators/planeacion.validator';

const router = Router();

const GESTION: Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR];

router.use(authenticate);

// Docentes, coordinación y administración ven cuándo abre y cierra la entrega; solo coordinación y administración la configuran.
router.get('/', checkRole(...GESTION, ROLES.DOCENTE), validate(planeacionValidator.listarVentanas), listarVentanas);
router.put('/:academic_year_id/periodos/:numero', checkRole(...GESTION), validate(planeacionValidator.configurarVentana), configurarVentana);

export default router;
