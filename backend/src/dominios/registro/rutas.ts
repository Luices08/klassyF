import { Router } from 'express';
import admissionRequestRoutes from './admisiones/admissionRequest.routes';
import publicRoutes from './admisiones/public.routes';
import enrollmentRoutes from './matriculas/enrollment.routes';
import guardianRoutes from './estudiantes/guardian.routes';
import studentRoutes from './estudiantes/student.routes';

const router = Router();

router.use('/enrollments', enrollmentRoutes);

// M03: Expediente y hoja de vida del estudiante
router.use('/students', studentRoutes);
router.use('/guardians', guardianRoutes);

// M04: Admisiones — revision interna de secretaria y sitio publico sin login
router.use('/admission-requests', admissionRequestRoutes);
router.use('/public', publicRoutes);

export default router;
