import { Router } from 'express';
import { listAcademicYears } from '../controllers/academicYear.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.get('/', authenticate, listAcademicYears);

export default router;
