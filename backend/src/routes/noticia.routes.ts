import { Router } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { MAX_BYTES_IMAGEN_NOTICIA, TIPOS_IMAGEN_NOTICIA } from '../constants/noticias';
import { ROLES } from '../constants/roles';
import * as c from '../controllers/noticia.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import ApiError from '../utils/ApiError';
import * as v from '../validators/noticia.validator';

const router = Router();

// El mimetype lo declara el cliente: el servicio confirma el contenido real por firma de bytes.
const soloImagenes = (_req: Express.Request, file: Express.Multer.File, cb: FileFilterCallback) =>
  (TIPOS_IMAGEN_NOTICIA as readonly string[]).includes(file.mimetype) ? cb(null, true) : cb(new ApiError(400, 'Solo se aceptan imágenes PNG, JPG o WEBP.') as unknown as Error);
const subirImagen = multer({ storage: multer.memoryStorage(), fileFilter: soloImagenes, limits: { fileSize: MAX_BYTES_IMAGEN_NOTICIA, files: 1 } });

router.use(authenticate);

// Noticias y eventos institucionales. Todos los perfiles autenticados leen lo que les toca; quien puede publicar lo decide el servicio con la regla de cada rol
// (administración y coordinación todo, secretaría sus sedes, un docente solo si lo habilitaron). Las rutas fijas van antes de `/:id`.
const PUBLICAN = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA, ROLES.DOCENTE];
const ADMINISTRAN = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];

router.get('/mias', validate(v.mias), c.mias);
router.get('/permisos', c.permisos);
router.get('/gestion', checkRole(...PUBLICAN), c.gestion);

// Categorías: las lee cualquiera (para elegir al publicar); las gestionan administración, coordinación y secretaría.
router.get('/categorias', validate(v.listarCategorias), c.listarCategorias);
router.post('/categorias', checkRole(...ADMINISTRAN), validate(v.crearCategoria), c.crearCategoria);
router.patch('/categorias/:id', checkRole(...ADMINISTRAN), validate(v.actualizarCategoria), c.actualizarCategoria);
router.delete('/categorias/:id', checkRole(...ADMINISTRAN), validate(v.porId), c.eliminarCategoria);

// Quién más publica: las habilitaciones de docentes.
router.get('/habilitaciones', checkRole(...ADMINISTRAN), c.listarHabilitaciones);
router.post('/habilitaciones', checkRole(...ADMINISTRAN), validate(v.otorgarHabilitacion), c.otorgarHabilitacion);
router.patch('/habilitaciones/:id', checkRole(...ADMINISTRAN), validate(v.actualizarHabilitacion), c.actualizarHabilitacion);
router.post('/habilitaciones/:id/revocar', checkRole(...ADMINISTRAN), validate(v.porId), c.revocarHabilitacion);

// Una noticia con su cuerpo: va después de las rutas fijas (`/mias`, `/categorias`…) para que no las tome como un id.
router.get('/:id', validate(v.porId), c.detalle);
router.post('/', checkRole(...PUBLICAN), validate(v.crear), c.crear);
router.patch('/:id', checkRole(...PUBLICAN), validate(v.actualizar), c.actualizar);
// La imagen: se sube (POST, como todas las subidas del sistema), se quita y se pide con sesión.
router.get('/:id/imagen', validate(v.porId), c.verImagen);
router.post('/:id/imagen', checkRole(...PUBLICAN), validate(v.porId), subirImagen.single('file'), c.subirImagen);
router.delete('/:id/imagen', checkRole(...PUBLICAN), validate(v.porId), c.quitarImagen);
router.post('/:id/archivar', checkRole(...PUBLICAN), validate(v.porId), c.archivar);

export default router;
