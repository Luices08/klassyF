import { Router } from 'express';
import { listAuditLogs } from '../controllers/auditLog.controller';
import { ROLES } from '../constants/roles';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as auditLogValidator from '../validators/auditLog.validator';

const router = Router();

router.use(authenticate);

// Bitacora de M02 (login, cambios de cuenta): solo ADMIN, es informacion de seguridad.
router.get('/', checkRole(ROLES.ADMIN), validate(auditLogValidator.listAuditLogs), listAuditLogs);

export default router;
