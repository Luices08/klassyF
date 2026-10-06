import { Router } from 'express';
import auditLogRoutes from './auditLog.routes';
import authRoutes from './auth.routes';
import rutasAcademico from '../dominios/academico/rutas';
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

// Académico (M11/M12 actividades y notas, M13 asistencia, M17 boletines)
router.use(rutasAcademico);

export default router;
