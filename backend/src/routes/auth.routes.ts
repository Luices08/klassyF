import { Router } from 'express';
import { cambiarPerfil, login, seleccionarPerfil } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as authValidator from '../validators/auth.validator';

const router = Router();

router.post('/login', validate(authValidator.login), login);
router.post('/seleccionar-perfil', validate(authValidator.seleccionarPerfil), seleccionarPerfil);
router.post('/cambiar-perfil', authenticate, validate(authValidator.cambiarPerfil), cambiarPerfil);

export default router;
