import { Router } from 'express';
import { login } from '../controllers/auth.controller';
import validate from '../middlewares/validate.middleware';
import * as authValidator from '../validators/auth.validator';

const router = Router();

router.post('/login', validate(authValidator.login), login);

export default router;
