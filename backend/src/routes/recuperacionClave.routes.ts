import { Router } from 'express';
import { ROLES_QUE_ATIENDEN_CLAVE } from '../constants/recuperacionClave';
import { aprobar, listar, rechazar } from '../controllers/recuperacionClave.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as validator from '../validators/recuperacionClave.validator';

const router = Router();

// Las rutas dejan pasar a quien atiende solicitudes; qué solicitudes ve cada quien lo decide el servicio (rol y sedes).
router.use(authenticate, checkRole(...ROLES_QUE_ATIENDEN_CLAVE));

router.get('/', validate(validator.listar), listar);
router.post('/:id/aprobar', validate(validator.aprobar), aprobar);
router.post('/:id/rechazar', validate(validator.rechazar), rechazar);

export default router;
