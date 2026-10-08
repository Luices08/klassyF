import { Router } from 'express';
import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import * as ctrl from '../controllers/orientacion.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as v from '../validators/orientacion.validator';

const router = Router();
const ORIENTACION: Rol[] = [ROLES.ADMIN, ROLES.ORIENTADOR];

// Las remisiones a orientación son de orientación (de su sede) y las puede auditar un ADMIN. Ni convivencia ni el coordinador
// académico entran aquí: convivencia ve solo el estado desde su caso. El servicio vuelve a comprobar rol y sede.
router.use(authenticate, checkRole(...ORIENTACION));

router.get('/remisiones', validate(v.listarRemisiones), ctrl.listarRemisiones);
router.get('/remisiones/:id', validate(v.obtenerRemision), ctrl.obtenerRemision);
router.post('/remisiones/:id/atenciones', validate(v.registrarAtencion), ctrl.registrarAtencion);
router.post('/remisiones/:id/atendida', validate(v.marcarAtendida), ctrl.marcarAtendida);

export default router;
