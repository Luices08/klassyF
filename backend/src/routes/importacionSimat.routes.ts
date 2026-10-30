import { Router } from 'express';
import multer from 'multer';
import { MAX_BYTES_SIMAT } from '../constants/importacionSimat';
import { ROLES } from '../constants/roles';
import { aplicar, descartar, filas, informe, listar, obtener, simular } from '../controllers/importacionSimat.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as validador from '../validators/importacionSimat.validator';

const router = Router();

// El archivo se procesa en memoria y se descarta: de él solo se conserva su huella (los datos de menores no quedan en disco).
const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES_SIMAT, files: 1 } });

router.use(authenticate, checkRole(ROLES.ADMIN, ROLES.SECRETARIA));

router.post('/simular', subida.single('file'), validate(validador.simular), simular);
router.get('/', listar);
router.get('/:id', validate(validador.idImportacion), obtener);
router.get('/:id/filas', validate(validador.filas), filas);
router.get('/:id/informe', validate(validador.idImportacion), informe);
router.post('/:id/aplicar', validate(validador.aplicar), aplicar);
router.delete('/:id', validate(validador.idImportacion), descartar);

export default router;
