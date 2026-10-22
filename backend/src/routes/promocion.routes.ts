import { Router } from 'express';
import { ROLES } from '../constants/roles';
import { actualizarPolitica, cerrarGrupo, listarEvaluaciones, obtenerPolitica, reevaluarEstudiante, simularCaso, simularGrupo, simularRollover, ejecutarRollover, verificarIntegridad, obtenerConfiguracionRematricula, actualizarConfiguracionRematricula, listarEspera, asignarDesdeEspera, descartarDeEspera } from '../controllers/promocion.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as promocionValidator from '../validators/promocion.validator';

const router = Router();

router.use(authenticate);

// La política de promoción es el SIEE del colegio: la comunidad tiene derecho a conocerla (lee cualquier usuario con sesión);
// solo el administrador la cambia.
router.get('/politica/:academic_year_id', validate(promocionValidator.anioParam), obtenerPolitica);
router.put('/politica/:academic_year_id', checkRole(ROLES.ADMIN), validate(promocionValidator.actualizarPolitica), actualizarPolitica);

// «Pruébalo»: prueba la política en borrador con un estudiante inventado; no escribe nada.
router.post('/politica/:academic_year_id/simular-caso', checkRole(ROLES.ADMIN, ROLES.COORDINADOR), validate(promocionValidator.simularCaso), simularCaso);

// Simulación y consulta de cierres: coordinación y administración (el servicio vuelve a comprobarlo). Cerrar y corregir: solo ADMIN, con contraseña.
router.get('/simulacion', checkRole(ROLES.ADMIN, ROLES.COORDINADOR), validate(promocionValidator.simulacion), simularGrupo);
router.get('/evaluaciones', checkRole(ROLES.ADMIN, ROLES.COORDINADOR), validate(promocionValidator.listarEvaluaciones), listarEvaluaciones);
router.get('/evaluaciones/:id/integridad', checkRole(ROLES.ADMIN, ROLES.COORDINADOR), validate(promocionValidator.idParam), verificarIntegridad);
router.post('/cierre', checkRole(ROLES.ADMIN), validate(promocionValidator.cierreGrupo), cerrarGrupo);
router.post('/reevaluar', checkRole(ROLES.ADMIN), validate(promocionValidator.reevaluar), reevaluarEstudiante);

// Paso al año siguiente (rematrícula por sede, grado o grupo): la simulación la ven coordinación, secretaría y administración; reservar los cupos
// (pre-matrículas) es del ADMIN y de la secretaría en sus sedes, con su contraseña. Los servicios vuelven a comprobar el rol y las sedes.
router.get('/rollover', checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA), validate(promocionValidator.simulacionRollover), simularRollover);
router.post('/rollover', checkRole(ROLES.ADMIN, ROLES.SECRETARIA), validate(promocionValidator.ejecutarRollover), ejecutarRollover);

// Reglas de prioridad y balanceo de la rematrícula: las lee quien la procesa; solo el ADMIN las cambia.
router.get('/rematricula/configuracion', checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA), obtenerConfiguracionRematricula);
router.put('/rematricula/configuracion', checkRole(ROLES.ADMIN), validate(promocionValidator.configuracionRematricula), actualizarConfiguracionRematricula);

// Lista de espera: quien no alcanzó cupo. La ven coordinación, secretaría (sus sedes) y administración; asignar o descartar es directivo.
router.get('/rematricula/lista-espera', checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA), validate(promocionValidator.listaEspera), listarEspera);
router.post('/rematricula/lista-espera/:id/asignar', checkRole(ROLES.ADMIN, ROLES.COORDINADOR), validate(promocionValidator.asignarEspera), asignarDesdeEspera);
router.post('/rematricula/lista-espera/:id/descartar', checkRole(ROLES.ADMIN, ROLES.COORDINADOR), validate(promocionValidator.descartarEspera), descartarDeEspera);

export default router;
