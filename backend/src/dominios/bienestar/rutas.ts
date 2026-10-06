import { Router } from 'express';
import casoRoutes from './convivencia/caso.routes';
import inclusionRoutes from './inclusion/inclusion.routes';
import observacionRoutes from './observador/observacion.routes';
import orientacionRoutes from './orientacion/orientacion.routes';

const router = Router();

// M14: Observaciones y convivencia (Observador)
router.use('/observaciones', observacionRoutes);

// M15: Comité de convivencia escolar (casos, protocolos, medidas y entidades de remisión)
router.use('/convivencia', casoRoutes);

// Orientación: remisiones que convivencia le envía desde un caso (psicología / orientación escolar)
router.use('/orientacion', orientacionRoutes);

// M16: Inclusión (PIAR, plan de apoyo pedagógico y sus documentos)
router.use('/inclusion', inclusionRoutes);

export default router;
