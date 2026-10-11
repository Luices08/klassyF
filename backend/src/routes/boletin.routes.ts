import { Router } from 'express';
import { ROLES } from '../constants/roles';
import {
  accesoEstudiante,
  actualizarConfiguracion,
  descargarMuestraPdf,
  guardarFrase,
  guardarObservaciones,
  listarFrases,
  listarObservaciones,
  obtenerConfiguracion,
  obtenerPublicacion,
  publicarGrupo,
} from '../controllers/boletin.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as boletinValidator from '../validators/boletin.validator';

const router = Router();

router.use(authenticate);

// Política y textos del boletín: son del SIEE del colegio. Coordinación consulta, el ADMIN decide.
router.get('/configuracion', checkRole(ROLES.ADMIN, ROLES.COORDINADOR), obtenerConfiguracion);
router.patch('/configuracion', checkRole(ROLES.ADMIN), validate(boletinValidator.actualizarConfiguracion), actualizarConfiguracion);
router.get('/frases', checkRole(ROLES.ADMIN, ROLES.COORDINADOR), listarFrases);
router.put('/frases', checkRole(ROLES.ADMIN), validate(boletinValidator.guardarFrase), guardarFrase);

// Observaciones por clase: las escribe el docente titular (el servicio lo exige); coordinación solo consulta.
router.get('/observaciones', checkRole(ROLES.DOCENTE, ROLES.ADMIN, ROLES.COORDINADOR), validate(boletinValidator.listarObservaciones), listarObservaciones);
router.put('/observaciones', checkRole(ROLES.DOCENTE), validate(boletinValidator.guardarObservaciones), guardarObservaciones);

// Quién de la familia ve el boletín: el administrador publica por grupo y periodo y deja excepciones por estudiante; coordinación consulta.
router.get('/publicacion', checkRole(ROLES.ADMIN, ROLES.COORDINADOR), validate(boletinValidator.obtenerPublicacion), obtenerPublicacion);
router.put('/publicacion', checkRole(ROLES.ADMIN), validate(boletinValidator.publicarGrupo), publicarGrupo);
router.put('/publicacion/estudiante', checkRole(ROLES.ADMIN), validate(boletinValidator.accesoEstudiante), accesoEstudiante);

// Boletín de muestra para revisar el diseño (datos inventados, textos y escala reales). POST porque puede traer el borrador que se está editando.
router.post('/muestra/pdf', checkRole(ROLES.ADMIN, ROLES.COORDINADOR), validate(boletinValidator.muestraPdf), descargarMuestraPdf);

export default router;
