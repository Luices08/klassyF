import { Router } from 'express';
import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import * as controller from '../controllers/citacion.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as v from '../validators/citacion.validator';

const router = Router();

// Convocan la coordinación y el administrador (a cualquier grupo), los docentes (a su grupo si lo dirigen, o a un estudiante suyo) y orientación y
// convivencia (a un estudiante de sus sedes). El servicio aplica la regla fina por grupo o estudiante y deja a cada quien ver solo lo que convocó.
const QUIEN_CONVOCA: Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.DOCENTE, ROLES.ORIENTADOR, ROLES.COORDINADOR_CONVIVENCIA];

router.use(authenticate, checkRole(...QUIEN_CONVOCA));

router.get('/', validate(v.listar), controller.listar);
router.get('/grupos', controller.grupos);
router.get('/estudiantes', validate(v.estudiantes), controller.estudiantes);
router.post('/', validate(v.crear), controller.crear);
router.get('/:id', validate(v.detalle), controller.detalle);
router.patch('/:id', validate(v.actualizar), controller.actualizar);
router.post('/:id/cancelar', validate(v.cancelar), controller.cancelar);
router.post('/:id/realizada', validate(v.detalle), controller.realizada);
router.post('/:id/destinatarios/:destinatarioId/reenviar', validate(v.reenviar), controller.reenviar);

export default router;
