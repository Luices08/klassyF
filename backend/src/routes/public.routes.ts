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
import { listarGradosPublicos, obtenerInfoPublica } from '../controllers/public.controller';
import validate from '../middlewares/validate.middleware';
import * as admissionValidator from '../validators/admissionRequest.validator';
import * as certificadoValidator from '../validators/certificado.validator';

const router = Router();

// Sin autenticacion (home institucional publico, M01/M04). Rate limit generoso
// para lectura, mas estricto para el POST que escribe (evita spam de solicitudes).
const lecturaLimiter = rateLimit({ windowMs: 15 * 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
const escrituraLimiter = rateLimit({ windowMs: 60 * 60_000, max: 10, standardHeaders: true, legacyHeaders: false });

// Documentos de la preinscripcion: en memoria (max 5MB) hasta verificar la identidad del acudiente;
// solo despues se escriben a disco. El tipo real se confirma por firma de bytes en el servicio.
const documentosLimiter = rateLimit({ windowMs: 60 * 60_000, max: 40, standardHeaders: true, legacyHeaders: false });
const subirEnMemoria = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

// Verificación de certificados (M26): más estricto que la lectura normal, porque quien adivina códigos no debe poder probarlos a ritmo libre.
const verificacionLimiter = rateLimit({ windowMs: 15 * 60_000, max: 40, standardHeaders: true, legacyHeaders: false });
router.get('/certificados/verificar', verificacionLimiter, validate(certificadoValidator.verificarPublico), verificarPublico);

router.get('/institution-info', lecturaLimiter, obtenerInfoPublica);
router.get('/grades', lecturaLimiter, listarGradosPublicos);

router.post(
  '/admission-requests',
  escrituraLimiter,
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
