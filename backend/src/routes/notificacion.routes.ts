import { Router } from 'express';
import { ROLES } from '../constants/roles';
import * as ctrl from '../controllers/notificacion.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as v from '../validators/notificacion.validator';

const router = Router();

// M28: todo es del perfil activo de quien consulta; no hay rutas para ver las alertas de otro usuario.
router.use(authenticate);

router.get('/resumen', ctrl.resumen);
router.get('/', validate(v.listar), ctrl.listar);
router.post('/leer-todas', ctrl.leerTodas);
router.post('/visto', validate(v.visto), ctrl.visto);
router.post('/:id/leer', validate(v.idNotificacion), ctrl.leer);

// Tablero de anuncios: lo lee cualquiera (los de su perfil); rectoría y coordinación los administran.
router.get('/anuncios', ctrl.anunciosParaMi);
router.get('/anuncios/gestion', checkRole(ROLES.ADMIN, ROLES.COORDINADOR), ctrl.anunciosGestion);
router.post('/anuncios', checkRole(ROLES.ADMIN, ROLES.COORDINADOR), validate(v.crearAnuncio), ctrl.crearAnuncio);
router.patch('/anuncios/:id', checkRole(ROLES.ADMIN, ROLES.COORDINADOR), validate(v.actualizarAnuncio), ctrl.actualizarAnuncio);
router.post('/anuncios/:id/archivar', checkRole(ROLES.ADMIN, ROLES.COORDINADOR), validate(v.idAnuncio), ctrl.archivarAnuncio);

export default router;
