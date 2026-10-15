import { Router } from 'express';
import { ROLES } from '../constants/roles';
import { actualizarPolitica, listarCandidatos, obtenerPolitica, registrarIntento } from '../controllers/recuperacion.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as recuperacionValidator from '../validators/recuperacion.validator';

const router = Router();

router.use(authenticate);

// La política es información pública para la comunidad (el estudiante tiene derecho a conocer cómo se recupera): la lee cualquier
// usuario con sesión; solo el administrador la cambia.
router.get('/politica/:academic_year_id', validate(recuperacionValidator.anioParam), obtenerPolitica);
router.put('/politica/:academic_year_id', checkRole(ROLES.ADMIN), validate(recuperacionValidator.actualizarPolitica), actualizarPolitica);

// Quién debe recuperar: el docente de su clase; coordinación y administración consultan por grupo o clase.
router.get('/', checkRole(ROLES.DOCENTE, ROLES.COORDINADOR, ROLES.ADMIN), validate(recuperacionValidator.listarCandidatos), listarCandidatos);

// El resultado lo registra el docente titular.
router.post('/intentos', checkRole(ROLES.DOCENTE), validate(recuperacionValidator.registrarIntento), registrarIntento);

export default router;
