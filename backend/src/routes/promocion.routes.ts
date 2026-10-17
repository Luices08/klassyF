import { Router } from 'express';
import { ROLES } from '../constants/roles';
import { actualizarPolitica, cerrarGrupo, listarEvaluaciones, obtenerPolitica, reevaluarEstudiante, simularGrupo, simularRollover, ejecutarRollover, verificarIntegridad } from '../controllers/promocion.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as promocionValidator from '../validators/promocion.validator';

const router = Router();

router.use(authenticate);

// La política de promoción es el SIEE del colegio: la comunidad tiene derecho a conocerla (lee cualquier usuario con sesión);
// solo el administrador la cambia.
router.get('/politica/:academic_year_id', validate(promocionValidator.anioParam), obtenerPolitica);
router.put('/politica/:academic_year_id', checkRole(ROLES.ADMIN), validate(promocionValidator.actualizarPolitica), actualizarPolitica);

// Simulación y consulta de cierres: coordinación y administración (el servicio vuelve a comprobarlo). Cerrar y corregir: solo ADMIN, con contraseña.
router.get('/simulacion', checkRole(ROLES.ADMIN, ROLES.COORDINADOR), validate(promocionValidator.simulacion), simularGrupo);
router.get('/evaluaciones', checkRole(ROLES.ADMIN, ROLES.COORDINADOR), validate(promocionValidator.listarEvaluaciones), listarEvaluaciones);
router.get('/evaluaciones/:id/integridad', checkRole(ROLES.ADMIN, ROLES.COORDINADOR), validate(promocionValidator.idParam), verificarIntegridad);
router.post('/cierre', checkRole(ROLES.ADMIN), validate(promocionValidator.cierreGrupo), cerrarGrupo);
router.post('/reevaluar', checkRole(ROLES.ADMIN), validate(promocionValidator.reevaluar), reevaluarEstudiante);

// Paso al año siguiente: la simulación la ve coordinación; reservar los cupos (pre-matrículas) es del ADMIN, con su contraseña.
router.get('/rollover', checkRole(ROLES.ADMIN, ROLES.COORDINADOR), validate(promocionValidator.simulacionRollover), simularRollover);
router.post('/rollover', checkRole(ROLES.ADMIN), validate(promocionValidator.ejecutarRollover), ejecutarRollover);

export default router;
