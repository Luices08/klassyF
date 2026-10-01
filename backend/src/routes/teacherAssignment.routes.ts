import { Router } from 'express';
import { ROLES } from '../constants/roles';
import {
  createTeacherAssignment,
  deleteTeacherAssignment,
  getDocentesResumen,
  listTeacherAssignments,
  myLoad,
} from '../controllers/teacherAssignment.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as teacherAssignmentValidator from '../validators/teacherAssignment.validator';

const router = Router();

router.use(authenticate);

// 1. Asignar carga académica a un docente
router.post(
  '/',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(teacherAssignmentValidator.createTeacherAssignment),
  createTeacherAssignment
);

// 2. Listado filtrado de asignaciones (para Coordinación / Admin)
router.get(
  '/',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(teacherAssignmentValidator.listTeacherAssignments),
  listTeacherAssignments
);

// 3. Resumen y semáforo de carga docente por año lectivo (Decreto 1850)
router.get(
  '/docentes-resumen',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(teacherAssignmentValidator.docentesResumen),
  getDocentesResumen
);

// 4. Consulta de carga para el docente autenticado
router.get(
  '/my-load',
  checkRole(ROLES.DOCENTE),
  validate(teacherAssignmentValidator.myLoad),
  myLoad
);

// 5. Eliminar / desasignar carga
router.delete(
  '/:id',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR),
  validate(teacherAssignmentValidator.idParam),
  deleteTeacherAssignment
);

export default router;
