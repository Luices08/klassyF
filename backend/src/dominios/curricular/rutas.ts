import { Router } from 'express';
import teacherAssignmentRoutes from './carga-docente/teacherAssignment.routes';
import curricularDevelopmentRoutes from './desarrollo/curricularDevelopment.routes';
import areaRoutes from './plan-estudios/area.routes';
import studyPlanRoutes from './plan-estudios/studyPlan.routes';
import subjectRoutes from './plan-estudios/subject.routes';
import referenteCurricularRoutes from './referentes/referenteCurricular.routes';

const router = Router();

// M06: malla curricular (áreas, asignaturas y plan de estudios), M07: banco de referentes y desarrollo curricular, M08: carga docente
router.use('/curriculum/areas', areaRoutes);
router.use('/curriculum/subjects', subjectRoutes);
router.use('/curriculum/referentes', referenteCurricularRoutes);
router.use('/curriculum/study-plan', studyPlanRoutes);
router.use('/teacher-assignments', teacherAssignmentRoutes);
router.use('/curricular-developments', curricularDevelopmentRoutes);

export default router;
