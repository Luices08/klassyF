import { Router } from 'express';
import activityRoutes from './activity.routes';
import attendanceRoutes from './attendance.routes';
import auditLogRoutes from './auditLog.routes';
import authRoutes from './auth.routes';
import reportCardRoutes from './reportCard.routes';
import rutasBienestar from '../dominios/bienestar/rutas';
import rutasCurricular from '../dominios/curricular/rutas';
import rutasInstitucional from '../dominios/institucional/rutas';
import rutasRegistro from '../dominios/registro/rutas';

const router = Router();

router.use('/auth', authRoutes);
router.use('/audit-logs', auditLogRoutes);

// Institucional (M01 institución y estructura, M02 usuarios, M05 calendario, M10 espacios)
router.use(rutasInstitucional);

// Registro (M03 estudiantes y acudientes, M04 admisiones y matrículas)
router.use(rutasRegistro);

// Curricular (M06 plan de estudios, M07 referentes y desarrollo curricular, M08 carga docente)
router.use(rutasCurricular);

// Bienestar (M14 observador, M15 convivencia y comité, orientación, M16 inclusión)
router.use(rutasBienestar);

// Prompt 3: Actividades, Calificaciones, Asistencia y Motor de Boletines
router.use('/activities', activityRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/reports', reportCardRoutes);

export default router;
