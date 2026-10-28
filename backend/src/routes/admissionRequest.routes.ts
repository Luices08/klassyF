import { Router } from 'express';
import {
  admitirSolicitud,
  aprobarYMatricular,
  cuposDeAdmision,
  descargarDocumentoSolicitud,
  listarSolicitudes,
  obtenerSolicitud,
  quitarDocumentoSolicitud,
  rechazarSolicitud,
  registrarInscripcion,
  subirDocumentoSolicitud,
} from '../controllers/admissionRequest.controller';
import { ROLES } from '../constants/roles';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import { subirDocumentoMatricula } from '../middlewares/subidaDocumentosMatricula.middleware';
import validate from '../middlewares/validate.middleware';
import * as admissionValidator from '../validators/admissionRequest.validator';

const router = Router();
const STAFF = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];

router.use(authenticate);

router.get('/', checkRole(...STAFF), validate(admissionValidator.listarSolicitudes), listarSolicitudes);
router.post('/', checkRole(...STAFF), validate(admissionValidator.registrarInscripcion), registrarInscripcion);
router.get('/cupos', checkRole(...STAFF), validate(admissionValidator.cuposDeAdmision), cuposDeAdmision);
router.get('/:id', checkRole(...STAFF), validate(admissionValidator.obtenerSolicitud), obtenerSolicitud);
router.post('/:id/documentos/:tipoDocumento', checkRole(...STAFF), subirDocumentoMatricula.single('file'), validate(admissionValidator.documentoDeSolicitud), subirDocumentoSolicitud);
router.get('/:id/documentos/:tipoDocumento/archivo', checkRole(...STAFF), validate(admissionValidator.documentoDeSolicitud), descargarDocumentoSolicitud);
router.delete('/:id/documentos/:tipoDocumento', checkRole(...STAFF), validate(admissionValidator.documentoDeSolicitud), quitarDocumentoSolicitud);
router.patch('/:id/admitir', checkRole(...STAFF), admitirSolicitud);
router.patch('/:id/aprobar', checkRole(...STAFF), validate(admissionValidator.aprobarYMatricular), aprobarYMatricular);
router.patch('/:id/matricular', checkRole(...STAFF), validate(admissionValidator.aprobarYMatricular), aprobarYMatricular);
router.patch('/:id/rechazar', checkRole(...STAFF), validate(admissionValidator.rechazarSolicitud), rechazarSolicitud);

export default router;
