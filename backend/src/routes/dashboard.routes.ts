import { Router } from 'express';
import { ROLES } from '../constants/roles';
import * as c from '../controllers/dashboard.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as v from '../validators/dashboard.validator';

const router = Router();

router.use(authenticate);

// Dashboards de rectoría y coordinación (M30). Solo leen: cada bloque se calcula con lo que ya registran los demás módulos y se guarda unos segundos.
// Rectoría y coordinación ven lo mismo de la institución; las alertas de convivencia y orientación viven en los dashboards de esos perfiles.
const DIRECTIVOS = [ROLES.ADMIN, ROLES.COORDINADOR];

router.get('/indicadores', checkRole(...DIRECTIVOS), validate(v.consulta), c.indicadores);
router.get('/eficiencia', checkRole(...DIRECTIVOS), validate(v.consulta), c.eficiencia);
router.get('/morbilidad', checkRole(...DIRECTIVOS), validate(v.consulta), c.morbilidad);

router.get('/coordinacion/entrega-notas', checkRole(...DIRECTIVOS), validate(v.consulta), c.entregaDeNotas);
router.get('/coordinacion/riesgo', checkRole(...DIRECTIVOS), validate(v.consulta), c.riesgo);
router.get('/coordinacion/recuperaciones', checkRole(...DIRECTIVOS), validate(v.consulta), c.recuperaciones);
router.get('/coordinacion/servicio-social', checkRole(...DIRECTIVOS), validate(v.consulta), c.servicioSocial);
router.get('/coordinacion/desempeno', checkRole(...DIRECTIVOS), validate(v.consulta), c.desempeno);
router.get('/coordinacion/comparativo', checkRole(...DIRECTIVOS), validate(v.consulta), c.comparativo);
router.get('/coordinacion/alertas', checkRole(...DIRECTIVOS), validate(v.consulta), c.alertas);

// Convivencia y orientación: conteos y códigos de casos, nunca hechos ni nombres. El coordinador académico no entra (no ve convivencia ni orientación en M14/M15).
router.get('/convivencia', checkRole(ROLES.ADMIN, ROLES.COORDINADOR_CONVIVENCIA), validate(v.consultaBienestar), c.panelConvivencia);
router.get('/orientacion', checkRole(ROLES.ADMIN, ROLES.ORIENTADOR), validate(v.consultaBienestar), c.panelOrientacion);

// Secretaría: conteos de matrículas, admisiones, documentos y salidas de sus sedes. Rectoría tiene sus propios indicadores; el resto de roles no entra.
router.get('/secretaria', checkRole(ROLES.SECRETARIA), validate(v.consultaBienestar), c.panelSecretaria);

export default router;
