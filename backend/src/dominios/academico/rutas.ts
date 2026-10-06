import { Router } from 'express';
import activityRoutes from './actividades-notas/activity.routes';
import attendanceRoutes from './asistencia/attendance.routes';
import reportCardRoutes from './boletines/reportCard.routes';

const router = Router();

// M11/M12: actividades y calificaciones, M13: asistencia, M17: motor de boletines
router.use('/activities', activityRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/reports', reportCardRoutes);

export default router;
