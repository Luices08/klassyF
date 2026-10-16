import { Router } from 'express';
import { ROLES } from '../constants/roles';
import * as ctrl from '../controllers/portalAcudiente.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import { subirDocumentoMatricula } from '../middlewares/subidaDocumentosMatricula.middleware';
import validate from '../middlewares/validate.middleware';
import * as v from '../validators/portalAcudiente.validator';

const router = Router();

// M27: solo el perfil de acudiente. Quien es docente Y acudiente entra aquí con el perfil «Acudiente» (cambiar-perfil); con el de docente, 403.
// Cada ruta de un hijo vuelve a comprobar el vínculo con ese estudiante en el servicio: el rol solo dice que es acudiente, no de quién.
router.use(authenticate, checkRole(ROLES.ACUDIENTE));

router.get('/hijos', ctrl.listarHijos);
router.get('/hijos/:studentId/notas', validate(v.notas), ctrl.notas);
router.get('/hijos/:studentId/inasistencias', validate(v.inasistencias), ctrl.inasistencias);
router.get('/hijos/:studentId/convivencia', validate(v.conHijo), ctrl.convivencia);

router.get('/hijos/:studentId/documentos', validate(v.conHijo), ctrl.documentos);
router.post('/hijos/:studentId/documentos/:tipoDocumento', validate(v.subirDocumento), subirDocumentoMatricula.single('file'), ctrl.subirDocumento);

router.get('/hijos/:studentId/certificados', validate(v.conHijo), ctrl.certificados);
router.post('/hijos/:studentId/certificados', validate(v.generarCertificado), ctrl.generarCertificado);
router.get('/hijos/:studentId/certificados/:certificadoId/pdf', validate(v.certificadoPdf), ctrl.certificadoPdf);

export default router;
