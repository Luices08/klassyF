import { Router } from 'express';
import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import {
  actualizarComentarioDocumento,
  agregarDocumentoChecklist,
  cambiarGrupo,
  cargarDocumento,
  createEnrollment,
  descargarActa,
  descargarDocumento,
  eliminarDocumentoChecklist,
  getEnrollment,
  listarDocumentosPorRevisar,
  listarDocumentosPrevistos,
  listEnrollments,
  revisarDocumento,
  sincronizarRequisitos,
  updateStatus,
} from '../controllers/enrollment.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import { subirDocumentoMatricula } from '../middlewares/subidaDocumentosMatricula.middleware';
import validate from '../middlewares/validate.middleware';
import * as enrollmentValidator from '../validators/enrollment.validator';

const router = Router();

const STAFF_MATRICULAS: Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR, ROLES.SECRETARIA];

router.use(authenticate);

router.post('/', checkRole(...STAFF_MATRICULAS), validate(enrollmentValidator.createEnrollment), createEnrollment);
router.get('/', checkRole(...STAFF_MATRICULAS), validate(enrollmentValidator.listEnrollments), listEnrollments);
// Antes de '/:id' para que no la tome como un id.
router.get(
  '/documentos-por-revisar',
  checkRole(...STAFF_MATRICULAS),
  validate(enrollmentValidator.listarDocumentosPorRevisar),
  listarDocumentosPorRevisar
);
router.get(
  '/documentos-previstos',
  checkRole(...STAFF_MATRICULAS),
  validate(enrollmentValidator.listarDocumentosPrevistos),
  listarDocumentosPrevistos
);
router.get('/:id', checkRole(...STAFF_MATRICULAS), validate(enrollmentValidator.getEnrollment), getEnrollment);

router.patch('/:id/status', checkRole(...STAFF_MATRICULAS), validate(enrollmentValidator.updateStatus), updateStatus);
router.patch('/:id/grupo', checkRole(...STAFF_MATRICULAS), validate(enrollmentValidator.cambiarGrupo), cambiarGrupo);

router.post(
  '/:id/checklist/:tipoDocumento/upload',
  checkRole(...STAFF_MATRICULAS),
  validate(enrollmentValidator.cargarDocumento),
  subirDocumentoMatricula.single('file'),
  cargarDocumento
);
router.patch(
  '/:id/checklist/:tipoDocumento/revisar',
  checkRole(...STAFF_MATRICULAS),
  validate(enrollmentValidator.revisarDocumento),
  revisarDocumento
);
router.get(
  '/:id/checklist/:tipoDocumento/archivo',
  checkRole(...STAFF_MATRICULAS),
  validate(enrollmentValidator.descargarDocumento),
  descargarDocumento
);

router.get('/:id/acta-compromiso.pdf', checkRole(...STAFF_MATRICULAS), validate(enrollmentValidator.descargarActa), descargarActa);

router.post(
  '/:id/checklist',
  checkRole(...STAFF_MATRICULAS),
  validate(enrollmentValidator.agregarDocumentoChecklist),
  agregarDocumentoChecklist
);

router.delete(
  '/:id/checklist/:tipoDocumento',
  checkRole(...STAFF_MATRICULAS),
  validate(enrollmentValidator.eliminarDocumentoChecklist),
  eliminarDocumentoChecklist
);

router.post(
  '/:id/sincronizar-requisitos',
  checkRole(...STAFF_MATRICULAS),
  validate(enrollmentValidator.getEnrollment),
  sincronizarRequisitos
);

router.patch(
  '/:id/checklist/:tipoDocumento/comentario',
  checkRole(...STAFF_MATRICULAS),
  validate(enrollmentValidator.actualizarComentario),
  actualizarComentarioDocumento
);

export default router;
