import { Router } from 'express';
import activityRoutes from './activity.routes';
import areaRoutes from './area.routes';
import attendanceRoutes from './attendance.routes';
import authRoutes from './auth.routes';
import campusRoutes from './campus.routes';
import curricularDevelopmentRoutes from './curricularDevelopment.routes';
import dbaBankRoutes from './dbaBank.routes';
import enrollmentRoutes from './enrollment.routes';
import gradeRoutes from './grade.routes';
import groupRoutes from './group.routes';
import institutionRoutes from './institution.routes';
import periodLockRoutes from './periodLock.routes';
import reportCardRoutes from './reportCard.routes';
import studyPlanRoutes from './studyPlan.routes';
import subjectRoutes from './subject.routes';
import teacherAssignmentRoutes from './teacherAssignment.routes';
import userRoutes from './user.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/institution', institutionRoutes);
router.use('/campuses', campusRoutes);
router.use('/grades', gradeRoutes);
router.use('/groups', groupRoutes);
router.use('/enrollments', enrollmentRoutes);

// Prompt 2: Malla Curricular, Banco de DBA y Planeación Pedagógica
router.use('/curriculum/areas', areaRoutes);
router.use('/curriculum/subjects', subjectRoutes);
router.use('/curriculum/dba-bank', dbaBankRoutes);
router.use('/curriculum/study-plan', studyPlanRoutes);
router.use('/teacher-assignments', teacherAssignmentRoutes);
router.use('/curricular-developments', curricularDevelopmentRoutes);

// Prompt 3: Actividades, Calificaciones, Asistencia y Motor de Boletines
router.use('/activities', activityRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/periods', periodLockRoutes);
router.use('/reports', reportCardRoutes);

export default router;
