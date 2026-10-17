import { Router } from 'express';
import { ROLES } from '../constants/roles';
import * as c from '../controllers/titulacion.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as v from '../validators/titulacion.validator';

const router = Router();

router.use(authenticate);

// Consulta: ADMIN, SECRETARIA y COORDINADOR (el servicio acota por sedes). Registrar lo que custodia Secretaría (M26): ADMIN y SECRETARIA.
const consulta = checkRole(ROLES.ADMIN, ROLES.SECRETARIA, ROLES.COORDINADOR);
const registro = checkRole(ROLES.ADMIN, ROLES.SECRETARIA);

router.get('/estudiantes/:studentId/requisitos', consulta, validate(v.estudianteParam), c.requisitos);
router.get('/', consulta, validate(v.listarTitulaciones), c.listarTitulaciones);
router.post('/reevaluar', registro, validate(v.reevaluar), c.reevaluar);
router.post('/servicio-social', registro, validate(v.registrarServicioSocial), c.registrarServicioSocial);
router.post('/servicio-social/:id/anular', registro, validate(v.anularServicioSocial), c.anularServicioSocial);
router.put('/saber-11/:studentId', registro, validate(v.registrarSaber11), c.registrarSaber11);
router.post('/carpeta', registro, validate(v.registrarCertificadoExterno), c.registrarCertificadoExterno);

export default router;
