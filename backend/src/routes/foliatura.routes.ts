import { Router } from 'express';
import { ROLES } from '../constants/roles';
import { actualizarFoliatura, verFoliatura } from '../controllers/foliatura.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as foliaturaValidator from '../validators/foliatura.validator';

const router = Router();

router.use(authenticate);

// Quien matricula ve cómo se numera el Libro de Matrícula; lo configuran el administrador y la secretaría académica (el servicio lo vuelve a comprobar).
router.get('/', checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA), validate(foliaturaValidator.verFoliatura), verFoliatura);
router.put('/', checkRole(ROLES.ADMIN, ROLES.SECRETARIA), validate(foliaturaValidator.actualizarFoliatura), actualizarFoliatura);

export default router;
