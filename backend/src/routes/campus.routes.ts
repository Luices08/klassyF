import { Router } from 'express';
import { listCampuses } from '../controllers/campus.controller';
import { authenticate } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as campusValidator from '../validators/campus.validator';

const router = Router();

router.get('/', authenticate, validate(campusValidator.listCampuses), listCampuses);

export default router;
