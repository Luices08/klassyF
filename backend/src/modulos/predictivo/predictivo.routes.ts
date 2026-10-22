import { Router } from 'express';
import { ROLES } from '../../constants/roles';
import { authenticate, checkRole } from '../../middlewares/auth.middleware';
import validate from '../../middlewares/validate.middleware';
import * as c from './predictivo.controller';
import { ROLES_PERSONAL_PREDICTIVO } from './utils/permisos';
import * as v from './predictivo.validator';

const router = Router();

router.use(authenticate);

// Solo el ADMIN entrena la IA y administra sus versiones; el entrenamiento corre en segundo plano (202).
router.get('/modelos', checkRole(ROLES.ADMIN), c.listarModelos);
router.post('/modelos/entrenar', checkRole(ROLES.ADMIN), c.entrenar);
router.post('/modelos/:id/activar', checkRole(ROLES.ADMIN), validate(v.porId), c.activar);

// El personal busca a cualquier estudiante; el estudiante ve el suyo y el acudiente el de cada hijo (el servicio comprueba el vínculo).
router.get('/estudiantes', checkRole(...ROLES_PERSONAL_PREDICTIVO), validate(v.busqueda), c.buscarEstudiantes);
router.get('/estudiantes/:id', checkRole(...ROLES_PERSONAL_PREDICTIVO), validate(v.analisisDeEstudiante), c.analisisDeEstudiante);
router.get('/mio', checkRole(ROLES.ESTUDIANTE), c.analisisPropio);
router.get('/hijos/:id', checkRole(ROLES.ACUDIENTE), validate(v.porId), c.analisisDeHijo);

export default router;
