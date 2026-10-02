import { Router } from 'express';
import multer from 'multer';
import { MAX_BYTES_IMPORTACION } from '../constants/importacionConvivencia';
import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import * as ctrl from '../controllers/importacion.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import ApiError from '../utils/ApiError';
import * as v from '../validators/importacion.validator';

const router = Router();

// El rol solo abre la puerta; cada proceso vuelve a comprobar quién puede usarlo y cada fila pasa por las reglas del registro individual.
const CARGAN: Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.COORDINADOR_CONVIVENCIA, ROLES.DOCENTE];

// En memoria y con tope de tamaño; la extensión decide el lector y el contenido se verifica (firma ZIP del .xlsx) en el servicio.
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) =>
    /\.(xlsx|csv)$/i.test(file.originalname)
      ? cb(null, true)
      : cb(new ApiError(400, 'Solo se acepta un archivo Excel (.xlsx) o CSV (.csv).') as unknown as Error),
  limits: { fileSize: MAX_BYTES_IMPORTACION, files: 1 },
});

router.use(authenticate, checkRole(...CARGAN));

router.get('/plantilla/:proceso', validate(v.descargarPlantilla), ctrl.descargarPlantilla);
router.get('/lotes', ctrl.listarLotes);
router.post('/lotes/:id/anulacion', validate(v.anularLote), ctrl.anularLote);
router.post('/:proceso', validate(v.importar), upload.single('archivo'), ctrl.importar);

export default router;
