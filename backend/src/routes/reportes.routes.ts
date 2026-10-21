import { Router } from 'express';
import { ROLES } from '../constants/roles';
import * as c from '../controllers/reportes.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as v from '../validators/reportes.validator';

const router = Router();

router.use(authenticate);

// Reportes de cierre anual (M33). Se calculan al descargar: ninguno guarda datos propios.
router.get('/sabana/excel', checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA), validate(v.sabana), c.sabanaExcel);
router.get('/sabana/pdf', checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA), validate(v.sabana), c.sabanaPdf);

// Informe final del año: el personal lo baja siempre (borrador o definitivo); la familia solo cuando el administrador lo publica.
router.get('/informe-final/pdf', checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA), validate(v.informeFinal), c.informeFinalPdf);
router.get('/informe-final/mio/pdf', checkRole(ROLES.ESTUDIANTE, ROLES.ACUDIENTE), validate(v.informeFinalDeFamilia), c.informeFinalDeFamiliaPdf);
router.get('/informe-final/publicacion', checkRole(ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA), validate(v.informeFinalPublicacion), c.informeFinalPublicacion);
router.put('/informe-final/publicacion', checkRole(ROLES.ADMIN), validate(v.publicarInformeFinal), c.publicarInformeFinal);

const PERSONAL = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];
router.get('/recuperacion-final/excel', checkRole(...PERSONAL), validate(v.listado), c.recuperacionFinalExcel);
router.get('/recuperacion-final/pdf', checkRole(...PERSONAL), validate(v.listado), c.recuperacionFinalPdf);
router.get('/retirados/excel', checkRole(...PERSONAL), validate(v.listado), c.retiradosExcel);
router.get('/retirados/pdf', checkRole(...PERSONAL), validate(v.listado), c.retiradosPdf);
router.get('/servicio-social/excel', checkRole(...PERSONAL), validate(v.listado), c.servicioSocialExcel);
router.get('/servicio-social/pdf', checkRole(...PERSONAL), validate(v.listado), c.servicioSocialPdf);

// Balance de inclusión: son datos de estudiantes con necesidades de apoyo, así que Secretaría no entra (el servicio acota a las sedes de cada rol y coordinación no ve la modalidad).
const INCLUSION = [ROLES.ADMIN, ROLES.ORIENTADOR, ROLES.COORDINADOR];
router.get('/balance-inclusion/excel', checkRole(...INCLUSION), validate(v.listado), c.balanceInclusionExcel);
router.get('/balance-inclusion/pdf', checkRole(...INCLUSION), validate(v.listado), c.balanceInclusionPdf);

// SIMAT: revisar lo puede hacer también coordinación; bajar el archivo que se sube al MEN, solo administración y secretaría.
router.get('/simat/revision', checkRole(...PERSONAL), validate(v.listado), c.simatRevision);
router.get('/simat/excel', checkRole(ROLES.ADMIN, ROLES.SECRETARIA), validate(v.listado), c.simatExcel);
router.get('/simat/csv', checkRole(ROLES.ADMIN, ROLES.SECRETARIA), validate(v.listado), c.simatCsv);

// Reporte tipo C-600 (M30): verlo en pantalla lo puede hacer también coordinación; bajarlo (Excel o PDF), solo administración y secretaría (esta, de sus sedes).
router.get('/c600', checkRole(...PERSONAL), validate(v.c600), c.c600Vista);
router.get('/c600/excel', checkRole(ROLES.ADMIN, ROLES.SECRETARIA), validate(v.c600), c.c600Excel);
router.get('/c600/pdf', checkRole(ROLES.ADMIN, ROLES.SECRETARIA), validate(v.c600), c.c600Pdf);

// Consolidado general de la institución (los indicadores y la matriz de eficiencia del panel de rectoría, descargables): solo administración y coordinación.
router.get('/consolidado/excel', checkRole(ROLES.ADMIN, ROLES.COORDINADOR), validate(v.consolidado), c.consolidadoExcel);
router.get('/consolidado/pdf', checkRole(ROLES.ADMIN, ROLES.COORDINADOR), validate(v.consolidado), c.consolidadoPdf);

// Libro de calificaciones: emiten y anulan administración y secretaría (esta de sus sedes); coordinación consulta y reimprime.
router.post('/libro-calificaciones', checkRole(ROLES.ADMIN, ROLES.SECRETARIA), validate(v.emitirLibro), c.libroEmitir);
router.get('/libro-calificaciones', checkRole(ROLES.ADMIN, ROLES.SECRETARIA, ROLES.COORDINADOR), validate(v.listarLibros), c.libroListar);
router.get('/libro-calificaciones/:id/pdf', checkRole(ROLES.ADMIN, ROLES.SECRETARIA, ROLES.COORDINADOR), validate(v.libroPorId), c.libroPdf);
router.get('/libro-calificaciones/:id/integridad', checkRole(ROLES.ADMIN, ROLES.SECRETARIA, ROLES.COORDINADOR), validate(v.libroPorId), c.libroIntegridad);
router.post('/libro-calificaciones/:id/anular', checkRole(ROLES.ADMIN, ROLES.SECRETARIA), validate(v.anularLibro), c.libroAnular);

export default router;
