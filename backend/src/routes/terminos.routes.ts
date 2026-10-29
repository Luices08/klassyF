import { Router } from 'express';
import * as ctrl from '../controllers/terminos.controller';
import { authenticate } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as v from '../validators/terminos.validator';

const router = Router();

// Cada persona registra solo su propia aceptación, con el perfil de su sesión; los textos son públicos (`GET /public/terminos`).
router.use(authenticate);

router.get('/pendientes', ctrl.pendientes);
router.post('/aceptar', validate(v.aceptar), ctrl.aceptar);

export default router;
