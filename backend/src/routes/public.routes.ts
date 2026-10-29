import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import {
  consultarEstado,
  crearSolicitud,
  descargarComprobante,
  subirDocumentoPublico,
} from '../controllers/admissionRequest.controller';
import { verificarPublico } from '../controllers/certificado.controller';
import { verImagenPublica } from '../controllers/institution.controller';
import { verImagenPublica as verImagenSitio, verSitioPublico } from '../controllers/sitioPublico.controller';
import { conIdDeImagen } from '../validators/sitioPublico.validator';
import { listarOfertaDeAdmision, obtenerInfoPublica } from '../controllers/public.controller';
import { documentos as terminosVigentes } from '../controllers/terminos.controller';
import * as institutionValidator from '../validators/institution.validator';
import validate from '../middlewares/validate.middleware';
import * as admissionValidator from '../validators/admissionRequest.validator';
import * as certificadoValidator from '../validators/certificado.validator';
import { consultarPublica as consultarCitacion, responderPublica as responderCitacion } from '../controllers/citacion.controller';
import * as citacionValidator from '../validators/citacion.validator';

const router = Router();

// Sin autenticación (home institucional público, M01/M04). Rate limit generoso
// para lectura, más estricto para el POST que escribe (evita spam de solicitudes).
const lecturaLimiter = rateLimit({ windowMs: 15 * 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
const escrituraLimiter = rateLimit({ windowMs: 60 * 60_000, max: 20, standardHeaders: true, legacyHeaders: false });

const documentosLimiter = rateLimit({ windowMs: 60 * 60_000, max: 40, standardHeaders: true, legacyHeaders: false });
const subirEnMemoria = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

const subirAdjuntosSolicitud = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
}).fields([
  { name: 'documento_identidad', maxCount: 1 },
  { name: 'certificado_notas', maxCount: 1 },
]);

// Normaliza campos anidados si vienen como multipart/form-data
const normalizarBodySolicitud = (req: any, _res: any, next: any) => {
  if (typeof req.body?.apoyo_declarado === 'string') {
    try {
      req.body.apoyo_declarado = JSON.parse(req.body.apoyo_declarado);
    } catch {
      // ignore
    }
  }
  next();
};

const verificacionLimiter = rateLimit({ windowMs: 15 * 60_000, max: 40, standardHeaders: true, legacyHeaders: false });
router.get('/certificados/verificar', verificacionLimiter, validate(certificadoValidator.verificarPublico), verificarPublico);

const citacionLimiter = rateLimit({ windowMs: 15 * 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
router.get('/citaciones/:token', citacionLimiter, validate(citacionValidator.conToken), consultarCitacion);
router.post('/citaciones/:token/respuesta', citacionLimiter, validate(citacionValidator.responderPorToken), responderCitacion);

router.get('/institution-info', lecturaLimiter, obtenerInfoPublica);
// Términos y condiciones: se leen antes de iniciar sesión (la primera vez que se abre la plataforma en un navegador).
router.get('/terminos', lecturaLimiter, terminosVigentes);
router.get('/admission-requests/oferta', lecturaLimiter, listarOfertaDeAdmision);
router.get('/sitio', lecturaLimiter, verSitioPublico);
router.get('/sitio/imagenes/:id', lecturaLimiter, validate(conIdDeImagen), verImagenSitio);
router.get('/institution-imagen/:clave', lecturaLimiter, validate(institutionValidator.conClaveDeImagen), verImagenPublica);

router.post(
  '/admission-requests',
  escrituraLimiter,
  subirAdjuntosSolicitud,
  normalizarBodySolicitud,
  validate(admissionValidator.crearSolicitud),
  crearSolicitud
);

router.get(
  '/admission-requests/status',
  lecturaLimiter,
  validate(admissionValidator.consultarEstado),
  consultarEstado
);

router.post(
  '/admission-requests/comprobante',
  lecturaLimiter,
  validate(admissionValidator.descargarComprobante),
  descargarComprobante
);

router.post(
  '/admission-requests/documentos/:tipoDocumento',
  documentosLimiter,
  subirEnMemoria.single('file'),
  validate(admissionValidator.subirDocumentoPublico),
  subirDocumentoPublico
);

export default router;
