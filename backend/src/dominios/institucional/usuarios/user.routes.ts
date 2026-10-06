import { Router } from 'express';
import multer from 'multer';
import { ROLES } from '../../../constants/roles';
import {
  actualizarVinculo,
  desvincularAcudiente,
  listarAcudientesDeEstudiante,
  vincularAcudiente,
} from '../../../controllers/guardian.controller';
import { actualizarEstadoPerfil, getProfile, upsertProfile } from '../../../controllers/studentProfile.controller';
import {
  actualizarEstadoUsuario,
  actualizarMiPerfil,
  bulkImportUsers,
  cambiarMiPassword,
  cerrarSesiones,
  createUser,
  eliminarUsuario,
  getMe,
  listUsers,
  resetearPassword,
  updateUser,
} from './user.controller';
import { authenticate, checkRole } from '../../../middlewares/auth.middleware';
import validate from '../../../middlewares/validate.middleware';
import * as guardianValidator from '../../../validators/guardian.validator';
import * as studentProfileValidator from '../../../validators/studentProfile.validator';
import * as userValidator from './user.validator';

const router = Router();

// Memoria (no disco): el CSV se procesa en el momento y no necesita persistirse.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

router.use(authenticate);

// Mi Cuenta (autoservicio): cualquier rol autenticado, va antes de "/:id" para
// que Express no interprete "me" como un ObjectId de la ruta parametrica.
router.get('/me', getMe);
router.patch('/me', validate(userValidator.actualizarMiPerfil), actualizarMiPerfil);
router.patch('/me/password', validate(userValidator.cambiarMiPassword), cambiarMiPassword);

router.post(
  '/',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA),
  validate(userValidator.createUser),
  createUser
);

router.post(
  '/bulk-import',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA),
  upload.single('file'),
  bulkImportUsers
);

router.get(
  '/',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA, ROLES.DOCENTE),
  validate(userValidator.listUsers),
  listUsers
);

router.patch(
  '/:id',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA),
  validate(userValidator.updateUser),
  updateUser
);

router.patch(
  '/:id/estado',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA),
  validate(userValidator.actualizarEstado),
  actualizarEstadoUsuario
);

router.patch(
  '/:id/reset-password',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA),
  validate(userValidator.resetearPassword),
  resetearPassword
);

router.patch(
  '/:id/cerrar-sesiones',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA),
  validate(userValidator.cerrarSesiones),
  cerrarSesiones
);

router.delete(
  '/:id',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA),
  validate(userValidator.eliminarUsuario),
  eliminarUsuario
);

// Hoja de vida del estudiante (StudentProfile) - anidada bajo /users/:userId
router.put(
  '/:userId/student-profile',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA),
  validate(studentProfileValidator.upsertProfile),
  upsertProfile
);

router.get(
  '/:userId/student-profile',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA, ROLES.DOCENTE),
  validate(studentProfileValidator.getProfile),
  getProfile
);

router.patch(
  '/:userId/student-profile/estado',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA),
  validate(studentProfileValidator.actualizarEstado),
  actualizarEstadoPerfil
);

// Acudientes vinculados al estudiante (M03: relacion N:M via StudentGuardian)
router.get(
  '/:userId/guardians',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA, ROLES.DOCENTE),
  validate(guardianValidator.listarAcudientesDeEstudiante),
  listarAcudientesDeEstudiante
);

router.post(
  '/:userId/guardians',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA),
  validate(guardianValidator.vincularAcudiente),
  vincularAcudiente
);

router.patch(
  '/:userId/guardians/:relationId',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA),
  validate(guardianValidator.actualizarVinculo),
  actualizarVinculo
);

router.delete(
  '/:userId/guardians/:relationId',
  checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA),
  validate(guardianValidator.desvincularAcudiente),
  desvincularAcudiente
);

export default router;
