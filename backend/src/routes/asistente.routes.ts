import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { orientar } from '../controllers/asistente.controller';
import { authenticate } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as asistenteValidator from '../validators/asistente.validator';

const router = Router();

// Cada pregunta cuesta una llamada al modelo: se limita por IP para que no se use como grifo abierto.
const limitarPreguntas = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });

// Cualquier rol autenticado: el frontend manda solo las pantallas que ese rol puede abrir.
router.post('/orientar', authenticate, limitarPreguntas, validate(asistenteValidator.orientar), orientar);

export default router;
