import { Router } from 'express';
import { listGrades } from '../controllers/grade.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.get('/', authenticate, listGrades);

export default router;
