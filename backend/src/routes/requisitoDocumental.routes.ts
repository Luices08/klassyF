import { Router } from 'express';
import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import { actualizar, cambiarEstado, crear, eliminar, listar } from '../controllers/requisitoDocumental.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as validator from '../validators/requisitoDocumental.validator';

const router = Router();

// Quien matricula decide qué documentos pide el colegio (y ya puede agregar o quitar documentos de cada matrícula). Todo cambio queda en auditoría.
const STAFF_MATRICULAS: Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];

router.use(authenticate, checkRole(...STAFF_MATRICULAS));

router.get('/', validate(validator.listar), listar);
router.post('/', validate(validator.crear), crear);
router.put('/:id', validate(validator.actualizar), actualizar);
router.patch('/:id/estado', validate(validator.cambiarEstado), cambiarEstado);
router.delete('/:id', validate(validator.idParam), eliminar);

export default router;
