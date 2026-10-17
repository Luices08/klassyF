import { Router } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import { MAX_BYTES_SOPORTE_TRASLADO } from '../constants/traslados';
import * as controller from '../controllers/traslado.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import ApiError from '../utils/ApiError';
import * as v from '../validators/traslado.validator';

const router = Router();

// Secretaría y coordinación registran traslados y homologan; las escalas de otras instituciones son configuración institucional (M32).
const QUIEN_HOMOLOGA: Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];
const QUIEN_CONFIGURA_ESCALAS: Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR];

const TIPOS_PERMITIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
function soloDocumentosYFotos(_req: Express.Request, file: Express.Multer.File, cb: FileFilterCallback) {
  if (!TIPOS_PERMITIDOS.has(file.mimetype)) return cb(new ApiError(400, 'Solo se aceptan PDF, JPG, PNG o WEBP.') as unknown as Error);
  cb(null, true);
}
const upload = multer({ storage: multer.memoryStorage(), fileFilter: soloDocumentosYFotos, limits: { fileSize: MAX_BYTES_SOPORTE_TRASLADO } });

router.use(authenticate, checkRole(...QUIEN_HOMOLOGA));

// Escalas externas: van antes de `/:id` para que Express no las tome como un id.
router.get('/escalas', validate(v.listarEscalas), controller.listarEscalas);
router.post('/escalas', checkRole(...QUIEN_CONFIGURA_ESCALAS), validate(v.crearEscala), controller.crearEscala);
router.put('/escalas/:id', checkRole(...QUIEN_CONFIGURA_ESCALAS), validate(v.actualizarEscala), controller.actualizarEscala);
router.patch('/escalas/:id/estado', checkRole(...QUIEN_CONFIGURA_ESCALAS), validate(v.estadoEscala), controller.estadoEscala);
router.delete('/escalas/:id', checkRole(...QUIEN_CONFIGURA_ESCALAS), validate(v.eliminarEscala), controller.eliminarEscala);

router.get('/', validate(v.listar), controller.listar);
router.get('/matriculas-disponibles', validate(v.matriculasDisponibles), controller.matriculasDisponibles);
router.post('/', validate(v.crear), controller.crear);
router.get('/:id', validate(v.detalle), controller.detalle);
router.put('/:id', validate(v.actualizar), controller.actualizar);
router.post('/:id/homologacion/vista-previa', validate(v.vistaPrevia), controller.vistaPrevia);
router.put('/:id/homologacion', validate(v.guardarHomologacion), controller.guardarHomologacion);
router.post('/:id/soportes', validate(v.soporte), upload.single('file'), controller.cargarSoporte);
router.get('/:id/soportes/:soporteId', validate(v.soporteId), controller.descargarSoporte);
router.delete('/:id/soportes/:soporteId', validate(v.soporteId), controller.quitarSoporte);

export default router;
