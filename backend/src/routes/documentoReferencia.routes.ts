import { Router } from 'express';
import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import {
  actualizarDocumento,
  crearDocumento,
  descargarDocumento,
  eliminarDocumento,
  listarDocumentos,
  reemplazarArchivoDocumento,
} from '../controllers/documentoReferencia.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import { subirPdfPlaneacion } from '../middlewares/subirPdfPlaneacion.middleware';
import validate from '../middlewares/validate.middleware';
import * as planeacionValidator from '../validators/planeacion.validator';

const router = Router();

// El ADMIN tiene todo lo del coordinador; `checkRole` no hereda, por eso se nombran los dos.
const GESTION: Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR];

router.use(authenticate);

// Los docentes consultan los PDF de apoyo (su plan de área o de aula se arma con ellos al lado); solo coordinación los administra.
router.get('/', checkRole(...GESTION, ROLES.DOCENTE), validate(planeacionValidator.listarDocumentos), listarDocumentos);
router.get('/:id/archivo', checkRole(...GESTION, ROLES.DOCENTE), validate(planeacionValidator.idParam), descargarDocumento);

// multer va antes de validate: el cuerpo multipart no existe hasta que multer lo lee.
router.post('/', checkRole(...GESTION), subirPdfPlaneacion, validate(planeacionValidator.crearDocumento), crearDocumento);
// Los datos se editan en JSON; el PDF se reemplaza aparte, por POST como todas las subidas del sistema (`api.upload` solo envía POST).
router.patch('/:id', checkRole(...GESTION), validate(planeacionValidator.actualizarDocumento), actualizarDocumento);
router.post('/:id/archivo', checkRole(...GESTION), subirPdfPlaneacion, validate(planeacionValidator.idParam), reemplazarArchivoDocumento);
router.delete('/:id', checkRole(...GESTION), validate(planeacionValidator.idParam), eliminarDocumento);

export default router;
