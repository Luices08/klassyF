import { Router } from 'express';
import academicYearRoutes from './calendario/academicYear.routes';
import periodLockRoutes from './calendario/periodLock.routes';
import campusRoutes from './estructura/campus.routes';
import espacioRoutes from './estructura/espacio.routes';
import gradeRoutes from './estructura/grade.routes';
import groupRoutes from './estructura/group.routes';
import jornadaOperativaRoutes from './estructura/jornadaOperativa.routes';
import institutionRoutes from './institucion/institution.routes';
import userRoutes from './usuarios/user.routes';

const router = Router();

router.use('/users', userRoutes);
router.use('/institution', institutionRoutes);
router.use('/campuses', campusRoutes);
router.use('/shifts', jornadaOperativaRoutes);
router.use('/grades', gradeRoutes);
router.use('/groups', groupRoutes);

// M10: Espacios fisicos (aulas, laboratorios, canchas)
router.use('/espacios', espacioRoutes);

// M05: Año lectivo, periodos académicos y calendario
router.use('/academic-years', academicYearRoutes);
router.use('/periods', periodLockRoutes);

export default router;
