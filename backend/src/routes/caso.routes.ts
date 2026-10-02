import { Router } from 'express';
import { Rol } from '../constants/enums';
import { ROLES } from '../constants/roles';
import * as ctrl from '../controllers/caso.controller';
import * as comite from '../controllers/comite.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as v from '../validators/caso.validator';
import * as vc from '../validators/comite.validator';

const router = Router();

// Los casos son de convivencia: ADMIN y el coordinador de convivencia (de su sede). Nadie más, ni siquiera el coordinador
// académico o secretaría; el servidor vuelve a comprobar el rol, la sede y los impedimentos en cada operación.
const CONVIVENCIA: Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR_CONVIVENCIA];

router.use(authenticate, checkRole(...CONVIVENCIA));

// Catálogos del manual: medidas, entidades de remisión y protocolos por tipo de situación.
router.get('/catalogos', validate(v.listarCatalogosCaso), ctrl.listarCatalogosCaso);
router.post('/medidas', validate(v.crearMedida), ctrl.crearMedida);
router.patch('/medidas/:id', validate(v.actualizarMedida), ctrl.actualizarMedida);
router.patch('/medidas/:id/estado', validate(v.cambiarEstadoCatalogoCaso), ctrl.cambiarEstadoMedida);
router.delete('/medidas/:id', validate(v.eliminarCatalogoCaso), ctrl.eliminarMedida);
router.post('/entidades', validate(v.crearEntidad), ctrl.crearEntidad);
router.patch('/entidades/:id', validate(v.actualizarEntidad), ctrl.actualizarEntidad);
router.patch('/entidades/:id/estado', validate(v.cambiarEstadoCatalogoCaso), ctrl.cambiarEstadoEntidad);
router.delete('/entidades/:id', validate(v.eliminarCatalogoCaso), ctrl.eliminarEntidad);
router.put('/protocolos/:tipo', validate(v.guardarProtocolo), ctrl.guardarProtocolo);

router.post('/casos', validate(v.abrirCaso), ctrl.abrirCaso);
router.get('/casos', validate(v.listarCasos), ctrl.listarCasos);
router.get('/casos/:id', validate(v.obtenerCaso), ctrl.obtenerCaso);
router.post('/casos/:id/estado', validate(v.cambiarEstadoCaso), ctrl.cambiarEstadoCaso);
router.post('/casos/:id/tipo', validate(v.reclasificarCaso), ctrl.reclasificarCaso);
router.put('/casos/:id/atencion', validate(v.registrarAtencion), ctrl.registrarAtencion);
router.patch('/casos/:id/pasos/:pasoId', validate(v.actualizarPaso), ctrl.actualizarPaso);
router.post('/casos/:id/registros/:coleccion', ctrl.validarRegistroDeCaso, ctrl.agregarRegistroCaso);
router.put('/casos/:id/decision', validate(v.registrarDecision), ctrl.registrarDecision);
router.post('/casos/:id/cierre', validate(v.cerrarCaso), ctrl.cerrarCaso);
router.post('/casos/:id/reapertura', validate(v.accionConMotivo), ctrl.reabrirCaso);
router.post('/casos/:id/anulacion', validate(v.accionConMotivo), ctrl.anularCaso);
router.post('/casos/:id/impedimento', validate(v.declararImpedimento), ctrl.declararImpedimento);

// Alertas calculadas (el envío de avisos es de M28).
router.get('/alertas', comite.casosConAlertas);

// Informe de registros que ya cumplieron su plazo de conservación (solo ADMIN; el sistema no borra nada).
router.get('/retencion', comite.reporteRetencion);

// Comité: miembros por año, sesiones y actas. Firmar es solo del ADMIN (rector); el servicio lo vuelve a comprobar.
router.get('/comite/miembros', validate(vc.listarMiembros), comite.listarMiembros);
router.post('/comite/miembros', validate(vc.crearMiembro), comite.crearMiembro);
router.patch('/comite/miembros/:id', validate(vc.actualizarMiembro), comite.actualizarMiembro);
router.patch('/comite/miembros/:id/estado', validate(vc.cambiarEstadoMiembro), comite.cambiarEstadoMiembro);
router.delete('/comite/miembros/:id', validate(vc.eliminarMiembro), comite.eliminarMiembro);

router.get('/comite/sesiones', validate(vc.listarSesiones), comite.listarSesiones);
router.post('/comite/sesiones', validate(vc.crearSesion), comite.crearSesion);
router.get('/comite/sesiones/:id', validate(vc.obtenerSesion), comite.obtenerSesion);
router.patch('/comite/sesiones/:id', validate(vc.actualizarSesion), comite.actualizarSesion);
router.post('/comite/sesiones/:id/firma', validate(vc.firmarSesion), comite.firmarSesion);
router.get('/comite/sesiones/:id/integridad', validate(vc.verificarIntegridad), comite.verificarIntegridad);
router.post('/comite/sesiones/:id/anexos', validate(vc.agregarAnexo), comite.agregarAnexo);
router.post('/comite/sesiones/:id/anulacion', validate(vc.anularSesion), comite.anularSesion);
router.get('/comite/sesiones/:id/pdf', validate(vc.descargarActa), comite.descargarActa);

export default router;
