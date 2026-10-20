import { Router } from 'express';
import { ROLES } from '../constants/roles';
import * as c from '../controllers/valoracionDescriptiva.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as v from '../validators/valoracionDescriptiva.validator';

const router = Router();

router.use(authenticate);

// Preescolar (Decreto 2247/1997): valoración cualitativa y descriptiva en lugar de notas. La registra el docente de la clase; coordinación y el administrador consultan.
router.get('/planilla', checkRole(ROLES.DOCENTE, ROLES.ADMIN, ROLES.COORDINADOR), validate(v.planilla), c.planilla);
router.put('/planilla', checkRole(ROLES.DOCENTE), validate(v.guardar), c.guardar);
// El informe de un estudiante lo arma Secretaría, coordinación o el administrador (el servicio acota por sedes).
router.get('/informe/pdf', checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA), validate(v.informe), c.informe);

export default router;
