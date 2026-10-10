import { Router } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { MAX_BYTES_IMAGEN_AUTENTICACION, TIPOS_IMAGEN_AUTENTICACION } from '../constants/certificados';
import { ROLES } from '../constants/roles';
import * as ctrl from '../controllers/certificado.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import ApiError from '../utils/ApiError';
import * as v from '../validators/certificado.validator';

const router = Router();

const SECRETARIA_Y_ADMIN = [ROLES.ADMIN, ROLES.SECRETARIA];

// El mimetype lo declara el cliente: el servicio confirma el contenido real por firma de bytes antes de escribir en disco.
const soloImagenes = (_req: Express.Request, file: Express.Multer.File, cb: FileFilterCallback) =>
  (TIPOS_IMAGEN_AUTENTICACION as readonly string[]).includes(file.mimetype) ? cb(null, true) : cb(new ApiError(400, 'Solo se aceptan imágenes PNG o JPG.') as unknown as Error);
const subirImagen = multer({ storage: multer.memoryStorage(), fileFilter: soloImagenes, limits: { fileSize: MAX_BYTES_IMAGEN_AUTENTICACION, files: 1 } });

router.use(authenticate);

// Firmas y sellos: el ADMIN configura todo; secretaría carga su firma y el sello (y la de Rectoría si hay delegación). Lo fino lo decide
// el servicio con `permisosCertificados`, así la ruta no repite la regla.
router.get('/configuracion', checkRole(...SECRETARIA_Y_ADMIN), ctrl.obtenerConfiguracion);
router.put('/configuracion', checkRole(...SECRETARIA_Y_ADMIN), validate(v.actualizarConfiguracion), ctrl.actualizarConfiguracion);
router.get('/configuracion/imagenes/:elemento', checkRole(...SECRETARIA_Y_ADMIN), validate(v.conElemento), ctrl.verImagen);
// POST como el resto de cargas de archivos del sistema: `api.upload` del frontend siempre envía POST.
router.post('/configuracion/imagenes/:elemento', checkRole(...SECRETARIA_Y_ADMIN), validate(v.conElemento), subirImagen.single('file'), ctrl.guardarImagen);
router.delete('/configuracion/imagenes/:elemento', checkRole(...SECRETARIA_Y_ADMIN), validate(v.conElemento), ctrl.quitarImagen);

// Plantillas: el texto de cada documento. Solo el ADMIN las ve y las publica.
router.get('/plantillas', checkRole(ROLES.ADMIN), ctrl.listarPlantillas);
router.get('/plantillas/:tipo/versiones', checkRole(ROLES.ADMIN), validate(v.plantillaConTipo), ctrl.versionesDePlantilla);
router.post('/plantillas/:tipo/vista-previa', checkRole(ROLES.ADMIN), validate(v.vistaPreviaPlantilla), ctrl.vistaPreviaPlantilla);
router.post('/plantillas/:tipo/restablecer', checkRole(ROLES.ADMIN), validate(v.plantillaConTipo), ctrl.restablecerPlantilla);
router.put('/plantillas/:tipo', checkRole(ROLES.ADMIN), validate(v.publicarPlantilla), ctrl.publicarPlantilla);

router.get('/estudiantes/:studentId/matriculas', checkRole(...SECRETARIA_Y_ADMIN), validate(v.matriculasDelEstudiante), ctrl.matriculasDelEstudiante);
router.post('/vista-previa', checkRole(...SECRETARIA_Y_ADMIN), validate(v.vistaPrevia), ctrl.vistaPrevia);

router.post('/', checkRole(...SECRETARIA_Y_ADMIN), validate(v.expedir), ctrl.expedir);
router.get('/', checkRole(...SECRETARIA_Y_ADMIN), validate(v.listar), ctrl.listar);
router.get('/:id/pdf', checkRole(...SECRETARIA_Y_ADMIN), validate(v.conId), ctrl.pdf);
router.get('/:id/integridad', checkRole(...SECRETARIA_Y_ADMIN), validate(v.conId), ctrl.integridad);
router.post('/:id/anular', checkRole(ROLES.ADMIN), validate(v.anular), ctrl.anular);

export default router;
