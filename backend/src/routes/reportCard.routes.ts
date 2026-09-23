import { Router } from 'express';
import { getReportCard } from '../controllers/reportCard.controller';
import { authenticate } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as reportCardValidator from '../validators/reportCard.validator';

const router = Router();

// Sin checkRole por ruta: el permiso es contextual (docente/coordinacion ven
// cualquier boletin; estudiante solo el propio; acudiente solo el de su
// estudiante a cargo) y se resuelve dentro de reportCard.service.ts.
router.get('/report-card', authenticate, validate(reportCardValidator.getReportCard), getReportCard);

export default router;
