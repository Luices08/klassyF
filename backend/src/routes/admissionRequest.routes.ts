import { Router } from 'express';
import {
  aprobarSolicitud,
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
// Inscripción en el mostrador: la misma solicitud que la familia radica por el sitio público, con el documento del acudiente.
router.post('/', checkRole(...STAFF), validate(admissionValidator.registrarInscripcion), registrarInscripcion);
router.get('/:id', checkRole(...STAFF), validate(admissionValidator.obtenerSolicitud), obtenerSolicitud);
// Documentos que se reciben con la solicitud, antes de que haya matrícula (identidad, boletín...). La API nunca devuelve la ruta del archivo.
router.post('/:id/documentos/:tipoDocumento', checkRole(...STAFF), subirDocumentoMatricula.single('file'), validate(admissionValidator.documentoDeSolicitud), subirDocumentoSolicitud);
router.get('/:id/documentos/:tipoDocumento/archivo', checkRole(...STAFF), validate(admissionValidator.documentoDeSolicitud), descargarDocumentoSolicitud);
router.delete('/:id/documentos/:tipoDocumento', checkRole(...STAFF), validate(admissionValidator.documentoDeSolicitud), quitarDocumentoSolicitud);
router.patch(
  '/:id/aprobar',
  checkRole(...STAFF),
  validate(admissionValidator.aprobarSolicitud),
  aprobarSolicitud
);
router.patch(
  '/:id/rechazar',
  checkRole(...STAFF),
  validate(admissionValidator.rechazarSolicitud),
  rechazarSolicitud
);

export default router;
