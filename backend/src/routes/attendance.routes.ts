import { Router } from 'express';
import { ROLES } from '../constants/roles';
import { listAttendance, registerAttendance } from '../controllers/attendance.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as attendanceValidator from '../validators/attendance.validator';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  checkRole(ROLES.DOCENTE),
  validate(attendanceValidator.registerAttendance),
  registerAttendance
);

router.get('/', validate(attendanceValidator.listAttendance), listAttendance);

export default router;
