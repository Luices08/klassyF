import { Router } from 'express';
import { catalogoHistorial, exportarHistorial, listAuditLogs } from '../controllers/auditLog.controller';
import { ROLES } from '../constants/roles';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as auditLogValidator from '../validators/auditLog.validator';

const router = Router();

router.use(authenticate);

// M31: el historial general es solo del ADMIN (trae accesos, cambios de cuenta y consultas de datos de menores de todos los módulos).
// El historial de una matrícula lo ve quien gestiona matrículas: está en /enrollments/:id/historial.
router.get('/', checkRole(ROLES.ADMIN), validate(auditLogValidator.listAuditLogs), listAuditLogs);
router.get('/catalogo', checkRole(ROLES.ADMIN), catalogoHistorial);
router.get('/excel', checkRole(ROLES.ADMIN), validate(auditLogValidator.exportarHistorial), exportarHistorial);

export default router;
