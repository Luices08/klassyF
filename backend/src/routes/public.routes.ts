import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  consultarEstado,
  crearSolicitud,
} from '../controllers/admissionRequest.controller';
import { listarGradosPublicos, obtenerInfoPublica } from '../controllers/public.controller';
import validate from '../middlewares/validate.middleware';
import * as admissionValidator from '../validators/admissionRequest.validator';

const router = Router();

// Sin autenticacion (home institucional publico, M01/M04). Rate limit generoso
// para lectura, mas estricto para el POST que escribe (evita spam de solicitudes).
const lecturaLimiter = rateLimit({ windowMs: 15 * 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
const escrituraLimiter = rateLimit({ windowMs: 60 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false });

router.get('/institution-info', lecturaLimiter, obtenerInfoPublica);
router.get('/grades', lecturaLimiter, listarGradosPublicos);

router.post(
  '/admission-requests',
  escrituraLimiter,
  validate(admissionValidator.crearSolicitud),
  crearSolicitud
);
router.get(
  '/admission-requests/status',
  lecturaLimiter,
  validate(admissionValidator.consultarEstado),
  consultarEstado
);

export default router;
