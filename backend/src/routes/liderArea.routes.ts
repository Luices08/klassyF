import { Router } from 'express';
import { ROLES } from '../constants/roles';
import { actualizarLiderArea, crearLiderArea, listarLideresArea, quitarLiderArea } from '../controllers/liderArea.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as planeacionValidator from '../validators/planeacion.validator';

const router = Router();

// Designar a los líderes de área es de coordinación; el ADMIN tiene todo lo del coordinador (checkRole no hereda: se nombran los dos).
router.use(authenticate, checkRole(ROLES.ADMIN, ROLES.COORDINADOR));

router.get('/', validate(planeacionValidator.listarLideresArea), listarLideresArea);
router.post('/', validate(planeacionValidator.crearLiderArea), crearLiderArea);
router.patch('/:id', validate(planeacionValidator.actualizarLiderArea), actualizarLiderArea);
router.delete('/:id', validate(planeacionValidator.idParam), quitarLiderArea);

export default router;
