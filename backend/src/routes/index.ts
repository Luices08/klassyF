import { Router } from 'express';
import academicYearRoutes from './academicYear.routes';
import activityRoutes from './activity.routes';
import admissionRequestRoutes from './admissionRequest.routes';
import areaRoutes from './area.routes';
import asistenteRoutes from './asistente.routes';
import attendanceRoutes from './attendance.routes';
import auditLogRoutes from './auditLog.routes';
import authRoutes from './auth.routes';
import campusRoutes from './campus.routes';
import casoRoutes from './caso.routes';
import orientacionRoutes from './orientacion.routes';
import curricularDevelopmentRoutes from './curricularDevelopment.routes';
import enrollmentRoutes from './enrollment.routes';
import espacioRoutes from './espacio.routes';
import gradeRoutes from './grade.routes';
import groupRoutes from './group.routes';
import guardianRoutes from './guardian.routes';
import horarioRoutes from './horario.routes';
import inclusionRoutes from './inclusion.routes';
import institutionRoutes from './institution.routes';
import jornadaOperativaRoutes from './jornadaOperativa.routes';
import notasRoutes from './notas.routes';
import observacionRoutes from './observacion.routes';
import periodLockRoutes from './periodLock.routes';
import publicRoutes from './public.routes';
import referenteCurricularRoutes from './referenteCurricular.routes';
import reportCardRoutes from './reportCard.routes';
import studentRoutes from './student.routes';
import studyPlanRoutes from './studyPlan.routes';
import subjectRoutes from './subject.routes';
import teacherAssignmentRoutes from './teacherAssignment.routes';
import userRoutes from './user.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);

// Asistente flotante: orienta al usuario hacia la pantalla que busca
router.use('/asistente', asistenteRoutes);
router.use('/audit-logs', auditLogRoutes);
router.use('/institution', institutionRoutes);
router.use('/campuses', campusRoutes);
router.use('/shifts', jornadaOperativaRoutes);
router.use('/grades', gradeRoutes);
router.use('/groups', groupRoutes);
router.use('/enrollments', enrollmentRoutes);

// M10: Espacios fisicos (aulas, laboratorios, canchas)
router.use('/espacios', espacioRoutes);

// M09: Horarios (variables, generación, versiones y publicación)
router.use('/horarios', horarioRoutes);

// M05: Año lectivo, periodos académicos y calendario
router.use('/academic-years', academicYearRoutes);

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

// M14: Observaciones y convivencia (Observador)
router.use('/observaciones', observacionRoutes);

// M15: Comité de convivencia escolar (casos, protocolos, medidas y entidades de remisión)
router.use('/convivencia', casoRoutes);

// Orientación: remisiones que convivencia le envía desde un caso (psicología / orientación escolar)
router.use('/orientacion', orientacionRoutes);

// M16: Inclusión (PIAR, plan de apoyo pedagógico y sus documentos)
router.use('/inclusion', inclusionRoutes);

// Prompt 3: Actividades, Calificaciones, Asistencia y Motor de Boletines
router.use('/activities', activityRoutes);
router.use('/attendance', attendanceRoutes);

// M12: Evaluación y notas (planilla, cierre, definitivas, Excel offline)
router.use('/notas', notasRoutes);
router.use('/periods', periodLockRoutes);
router.use('/reports', reportCardRoutes);

export default router;
