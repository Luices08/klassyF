import { Router } from 'express';
import { ROLES } from '../constants/roles';
import * as horario from '../controllers/horario.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import * as v from '../validators/horario.validator';

const router = Router();

router.use(authenticate);

// Consulta personal y PDF: cualquier rol autenticado. El servicio decide qué ve cada uno (el docente lo suyo; el
// estudiante y el acudiente, su grupo; solo versiones publicadas). Van antes de `/:id` para no confundirse con un id.
router.get('/mio', horario.miHorario);
router.get('/:id/pdf', validate(v.pdfHorario), horario.pdfHorario);

// Gestión: ADMIN y COORDINADOR.
router.use(checkRole(ROLES.ADMIN, ROLES.COORDINADOR));

router.get('/variables', validate(v.listarVariables), horario.listarVariables);
router.post('/variables', validate(v.crearVariable), horario.crearVariable);
router.patch('/variables/:id', validate(v.actualizarVariable), horario.actualizarVariable);
router.patch('/variables/:id/estado', validate(v.cambiarEstadoVariable), horario.cambiarEstadoVariable);
router.delete('/variables/:id', validate(v.eliminarVariable), horario.eliminarVariable);

router.get('/insumos', validate(v.obtenerInsumos), horario.obtenerInsumos);

router.get('/', validate(v.listarHorarios), horario.listarHorarios);
router.post('/generar', validate(v.generarHorario), horario.generarHorario);
router.get('/:id', validate(v.obtenerHorario), horario.obtenerHorario);
router.patch('/:id/sesiones/:sesionId', validate(v.editarSesion), horario.editarSesion);
router.post('/:id/publicar', validate(v.publicarHorario), horario.publicarHorario);
router.delete('/:id', validate(v.eliminarHorario), horario.eliminarHorario);

export default router;
