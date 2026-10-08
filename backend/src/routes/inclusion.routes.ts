import { Router } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { Rol } from '../constants/enums';
import { MAX_BYTES_SOPORTE } from '../constants/inclusion';
import { ROLES } from '../constants/roles';
import * as ctrl from '../controllers/inclusion.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import ApiError from '../utils/ApiError';
import * as v from '../validators/inclusion.validator';

const router = Router();

const BANDEJA: Rol[] = [ROLES.ADMIN, ROLES.ORIENTADOR, ROLES.COORDINADOR];
const CON_DOCENTE: Rol[] = [...BANDEJA, ROLES.DOCENTE];
const ORIENTACION: Rol[] = [ROLES.ADMIN, ROLES.ORIENTADOR];

// El mimetype lo declara el cliente: el servicio confirma el contenido real por firma de bytes antes de escribir en disco.
const TIPOS_PERMITIDOS = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const soloDocumentosYFotos = (_req: Express.Request, file: Express.Multer.File, cb: FileFilterCallback) =>
  TIPOS_PERMITIDOS.has(file.mimetype) ? cb(null, true) : cb(new ApiError(400, 'Solo se aceptan PDF, JPG, PNG o WEBP.') as unknown as Error);

const upload = multer({ storage: multer.memoryStorage(), fileFilter: soloDocumentosYFotos, limits: { fileSize: MAX_BYTES_SOPORTE, files: 1 } });

// El rol decide quién entra; el servicio vuelve a comprobar sede y vínculo con el estudiante (y responde 404 si no hay acceso).
router.use(authenticate);

// Buscador acotado a las sedes del usuario o a los grupos del docente; no se abre /students a orientación.
router.get('/grupos', checkRole(...CON_DOCENTE), ctrl.grupos);
router.get('/estudiantes', checkRole(...CON_DOCENTE), validate(v.buscarEstudiantes), ctrl.estudiantes);

router.get('/configuracion', checkRole(...BANDEJA), ctrl.obtenerConfiguracionInclusion);
router.put('/configuracion', checkRole(ROLES.ADMIN), validate(v.actualizarConfiguracion), ctrl.actualizarConfiguracion);

// Solicitudes de apoyo (entrada única: matrícula, preinscripción, docente, convivencia, directo)
router.post('/solicitudes', checkRole(...CON_DOCENTE), validate(v.crearSolicitud), ctrl.crearSolicitud);
router.get('/solicitudes', checkRole(...BANDEJA), validate(v.listarSolicitudes), ctrl.bandejaDeSolicitudes);
router.get('/solicitudes/mias', checkRole(ROLES.DOCENTE), ctrl.misSolicitudes);
router.post('/solicitudes/:id/valorar', checkRole(...ORIENTACION), validate(v.valorarSolicitud), ctrl.valorarSolicitud);
router.post('/solicitudes/:id/resolver', checkRole(...ORIENTACION), validate(v.resolverSolicitud), ctrl.resolverSolicitud);

// Expedientes
router.get('/mis-estudiantes', checkRole(ROLES.DOCENTE), ctrl.misEstudiantes);
router.get('/grupos/:groupId/indicador', checkRole(...CON_DOCENTE), validate(v.indicadorDeGrupo), ctrl.indicadorDeGrupo);
router.get('/expedientes', checkRole(...BANDEJA), validate(v.listarExpedientes), ctrl.listarExpedientes);
router.post('/expedientes', checkRole(...ORIENTACION), validate(v.abrirExpediente), ctrl.abrirExpediente);
router.get('/expedientes/:id', checkRole(...CON_DOCENTE), validate(v.obtenerExpediente), ctrl.obtenerExpediente);

router.patch('/expedientes/:id/anexo-info', checkRole(...ORIENTACION), validate(v.anexoInfo), ctrl.guardarAnexoInfo);
router.patch('/expedientes/:id/caracteristicas', checkRole(...ORIENTACION), validate(v.caracteristicas), ctrl.guardarCaracteristicas);
router.patch('/expedientes/:id/categoria', checkRole(...ORIENTACION), validate(v.categoria), ctrl.guardarCategoria);
router.patch('/expedientes/:id/transversales', checkRole(...CON_DOCENTE), validate(v.transversales), ctrl.guardarTransversales);
router.patch('/expedientes/:id/pmi', checkRole(...ORIENTACION), validate(v.pmi), ctrl.guardarPmi);
router.patch('/expedientes/:id/compromisos-familia', checkRole(...ORIENTACION), validate(v.compromisosFamilia), ctrl.guardarCompromisosFamilia);
router.patch('/expedientes/:id/compromisos-aula', checkRole(...ORIENTACION), validate(v.compromisosAula), ctrl.guardarCompromisosAula);
router.patch('/expedientes/:id/plan-apoyo', checkRole(...ORIENTACION), validate(v.planApoyo), ctrl.guardarPlanApoyo);
router.patch('/expedientes/:id/informe-anual', checkRole(...CON_DOCENTE), validate(v.informeAnual), ctrl.guardarInformeAnual);

router.post('/expedientes/:id/consentimiento', checkRole(...ORIENTACION), validate(v.consentimiento), ctrl.registrarConsentimiento);
router.post('/expedientes/:id/consentimiento/revocar', checkRole(...ORIENTACION), validate(v.revocarConsentimiento), ctrl.revocarConsentimiento);

// multer va antes de validate porque el cuerpo multipart no existe hasta que multer lo lee.
router.post('/expedientes/:id/soportes', checkRole(...ORIENTACION), upload.single('file'), validate(v.cargarSoporte), ctrl.cargarSoporte);
router.get('/expedientes/:id/soportes/:soporteId/archivo', checkRole(...ORIENTACION), validate(v.archivoDeSoporte), ctrl.descargarSoporte);

router.post('/expedientes/:id/iniciar', checkRole(...ORIENTACION), validate(v.transicion), ctrl.iniciarConstruccion);
router.post('/expedientes/:id/aprobar', checkRole(ROLES.ADMIN, ROLES.COORDINADOR), validate(v.transicion), ctrl.aprobarExpediente);
router.post('/expedientes/:id/devolver', checkRole(ROLES.ADMIN, ROLES.COORDINADOR), validate(v.transicion), ctrl.devolverExpediente);
router.post('/expedientes/:id/cerrar', checkRole(...ORIENTACION), validate(v.cerrarExpediente), ctrl.cerrarExpediente);

// Ajustes por asignatura (Anexo 2): el docente solo edita la suya; el servicio lo decide con su asignación (M08)
router.get('/expedientes/:id/ajustes', checkRole(...CON_DOCENTE), validate(v.listarAjustes), ctrl.listarAjustes);
router.put('/expedientes/:id/ajustes/:subjectId', checkRole(...CON_DOCENTE), validate(v.guardarAjuste), ctrl.guardarAjuste);
router.post('/expedientes/:id/ajustes/:subjectId/seguimientos', checkRole(...CON_DOCENTE), validate(v.registrarSeguimiento), ctrl.registrarSeguimiento);

// Documentos
router.get('/expedientes/:id/documentos', checkRole(...BANDEJA), validate(v.listarDocumentos), ctrl.listarDocumentos);
router.post('/expedientes/:id/documentos', checkRole(...ORIENTACION), validate(v.emitirDocumento), ctrl.emitirDocumento);
router.get('/documentos/:id/pdf', checkRole(...BANDEJA), validate(v.documento), ctrl.pdfDeDocumento);
router.get('/documentos/:id/integridad', checkRole(...BANDEJA), validate(v.documento), ctrl.integridadDeDocumento);
router.post('/documentos/:id/firmar', checkRole(...ORIENTACION), upload.single('file'), ctrl.parsearFirmantes, validate(v.firmarDocumento), ctrl.firmarDocumento);
router.get('/documentos/:id/firmado/archivo', checkRole(...BANDEJA), validate(v.documento), ctrl.descargarFirmado);

export default router;
