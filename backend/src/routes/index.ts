import { Router } from 'express';
import activityRoutes from './activity.routes';
import admissionRequestRoutes from './admissionRequest.routes';
import areaRoutes from './area.routes';
import attendanceRoutes from './attendance.routes';
import auditLogRoutes from './auditLog.routes';
import authRoutes from './auth.routes';
import curricularDevelopmentRoutes from './curricularDevelopment.routes';
import enrollmentRoutes from './enrollment.routes';
import guardianRoutes from './guardian.routes';
import publicRoutes from './public.routes';
import referenteCurricularRoutes from './referenteCurricular.routes';
import reportCardRoutes from './reportCard.routes';
import studentRoutes from './student.routes';
import studyPlanRoutes from './studyPlan.routes';
import subjectRoutes from './subject.routes';
import teacherAssignmentRoutes from './teacherAssignment.routes';
import rutasBienestar from '../dominios/bienestar/rutas';
import rutasInstitucional from '../dominios/institucional/rutas';

const router = Router();

router.use('/auth', authRoutes);
router.use('/audit-logs', auditLogRoutes);

// Institucional (M01 institución y estructura, M02 usuarios, M05 calendario, M10 espacios)
router.use(rutasInstitucional);

router.use('/enrollments', enrollmentRoutes);

// M03: Expediente y hoja de vida del estudiante
router.use('/students', studentRoutes);
router.use('/guardians', guardianRoutes);

// M04: Admisiones — revision interna de secretaria y sitio publico sin login
router.use('/admission-requests', admissionRequestRoutes);
router.use('/public', publicRoutes);

// Prompt 2: Malla Curricular, Banco de DBA y Planeación Pedagógica
router.use('/curriculum/areas', areaRoutes);
router.use('/curriculum/subjects', subjectRoutes);
router.use('/curriculum/referentes', referenteCurricularRoutes);
router.use('/curriculum/study-plan', studyPlanRoutes);
router.use('/teacher-assignments', teacherAssignmentRoutes);
router.use('/curricular-developments', curricularDevelopmentRoutes);

// Bienestar (M14 observador, M15 convivencia y comité, orientación, M16 inclusión)
router.use(rutasBienestar);

// Prompt 3: Actividades, Calificaciones, Asistencia y Motor de Boletines
router.use('/activities', activityRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/reports', reportCardRoutes);

export default router;
