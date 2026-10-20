import { Router } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { MAX_BYTES_SOPORTE_SERVICIO_SOCIAL } from '../constants/titulacion';
import { ROLES } from '../constants/roles';
import * as c from '../controllers/titulacion.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import ApiError from '../utils/ApiError';
import * as v from '../validators/titulacion.validator';

const router = Router();

const TIPOS_SOPORTE = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
function soloDocumentosYFotos(_req: Express.Request, file: Express.Multer.File, cb: FileFilterCallback) {
  if (!TIPOS_SOPORTE.has(file.mimetype)) return cb(new ApiError(400, 'El soporte debe ser PDF, JPG, PNG o WEBP.') as unknown as Error);
  cb(null, true);
}
const subirSoporte = multer({ storage: multer.memoryStorage(), fileFilter: soloDocumentosYFotos, limits: { fileSize: MAX_BYTES_SOPORTE_SERVICIO_SOCIAL } });

router.use(authenticate);

// Consulta: ADMIN, SECRETARIA y COORDINADOR (el servicio acota por sedes). Registrar lo que custodia Secretaría (M26): ADMIN y SECRETARIA.
const consulta = checkRole(ROLES.ADMIN, ROLES.SECRETARIA, ROLES.COORDINADOR);
const registro = checkRole(ROLES.ADMIN, ROLES.SECRETARIA);

router.get('/estudiantes/:studentId/requisitos', consulta, validate(v.estudianteParam), c.requisitos);
router.get('/', consulta, validate(v.listarTitulaciones), c.listarTitulaciones);
router.post('/reevaluar', registro, validate(v.reevaluar), c.reevaluar);
// Multer va antes de validar: el cuerpo es multipart y solo existe después de leerlo.
router.post('/servicio-social', registro, subirSoporte.single('file'), validate(v.registrarServicioSocial), c.registrarServicioSocial);
router.get('/estudiantes/:studentId/servicio-social', consulta, validate(v.estudianteParam), c.listarServicioSocial);
router.get('/servicio-social/:id/soporte', consulta, validate(v.soporteServicioSocial), c.soporteServicioSocial);
router.post('/servicio-social/:id/verificar', consulta, validate(v.verificarServicioSocial), c.verificarServicioSocial);
router.post('/servicio-social/:id/anular', registro, validate(v.anularServicioSocial), c.anularServicioSocial);
router.put('/saber-11/:studentId', registro, validate(v.registrarSaber11), c.registrarSaber11);

export default router;
