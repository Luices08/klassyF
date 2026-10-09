import { Router } from 'express';
import multer from 'multer';
import { Rol } from '../constants/enums';
import { MAX_BYTES_EXCEL_NOTAS } from '../constants/notas';
import { ROLES } from '../constants/roles';
import {
  actualizarCasilla,
  actualizarPlantilla,
  cerrarPlanilla,
  crearCasilla,
  declararDefinitivas,
  descargarExcel,
  descargarExcelDeMuestra,
  descargarPdf,
  eliminarCasilla,
  establecerPesos,
  guardarCeldas,
  importarExcel,
  misNotas,
  obtenerBloques,
  obtenerPlanilla,
  obtenerPlantilla,
  reabrirPlanilla,
  seguimiento,
  vistaPreviaMolde,
} from '../controllers/notas.controller';
import { authenticate, checkRole } from '../middlewares/auth.middleware';
import validate from '../middlewares/validate.middleware';
import ApiError from '../utils/ApiError';
import * as notasValidator from '../validators/notas.validator';

const router = Router();

const GESTION: Rol[] = [ROLES.ADMIN, ROLES.COORDINADOR];

// Google Sheets exporta el mismo .xlsx; algunos navegadores lo declaran como octet-stream, así que se confía en la
// extensión aquí y el servicio confirma por firma de bytes.
const uploadExcel = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) =>
    /\.xlsx$/i.test(file.originalname)
      ? cb(null, true)
      : cb(new ApiError(400, 'Solo se acepta un archivo Excel (.xlsx).') as unknown as Error),
  limits: { fileSize: MAX_BYTES_EXCEL_NOTAS },
});

router.use(authenticate);

// La planilla de una clase y periodo: el docente titular la digita; coordinación y administración la consultan.
router.get('/planilla', checkRole(ROLES.DOCENTE, ...GESTION), validate(notasValidator.obtenerPlanilla), obtenerPlanilla);
router.put('/planilla', checkRole(ROLES.DOCENTE), validate(notasValidator.guardarCeldas), guardarCeldas);

// Casillas: el docente titular agrega notas sueltas, las renombra/mueve/pesa y fija el peso de sus actividades.
router.get('/bloques', checkRole(ROLES.DOCENTE, ...GESTION), validate(notasValidator.obtenerPlanilla), obtenerBloques);
router.post('/columnas', checkRole(ROLES.DOCENTE), validate(notasValidator.crearCasilla), crearCasilla);
router.patch('/columnas/:id', checkRole(ROLES.DOCENTE), validate(notasValidator.actualizarCasilla), actualizarCasilla);
router.delete('/columnas/:id', checkRole(ROLES.DOCENTE), validate(notasValidator.eliminarCasilla), eliminarCasilla);
router.put('/pesos', checkRole(ROLES.DOCENTE), validate(notasValidator.establecerPesos), establecerPesos);

// Plantilla de la planilla (M21 mínimo): la lee quien digita o consulta; solo el administrador la cambia.
router.get('/plantilla', checkRole(ROLES.DOCENTE, ...GESTION), obtenerPlantilla);
router.put('/plantilla', checkRole(ROLES.ADMIN), validate(notasValidator.actualizarPlantilla), actualizarPlantilla);

// Vista previa del molde (administración): cómo recibirá el docente su planilla, con datos de ejemplo, en pantalla y en Excel.
router.get('/molde/vista-previa', checkRole(...GESTION), validate(notasValidator.consultaAnio), vistaPreviaMolde);
router.get('/molde/excel', checkRole(...GESTION), validate(notasValidator.consultaAnio), descargarExcelDeMuestra);

// El estudiante ve sus propias notas por asignatura (lo del periodo abierto es provisional; el boletín solo lee lo cerrado).
router.get('/mias', checkRole(ROLES.ESTUDIANTE), validate(notasValidator.misNotas), misNotas);

// Versión para imprimir y firmar.
router.get('/planilla/pdf', checkRole(ROLES.DOCENTE, ...GESTION), validate(notasValidator.obtenerPlanilla), descargarPdf);

// Trabajo sin conexión (M22): la misma planilla en Excel, con fórmulas protegidas.
router.get('/planilla/excel', checkRole(ROLES.DOCENTE), validate(notasValidator.obtenerPlanilla), descargarExcel);
router.post('/planilla/excel', checkRole(ROLES.DOCENTE), uploadExcel.single('file'), importarExcel);

// Ciclo de estados: el docente cierra, coordinación declara definitivas, se reabre con motivo.
router.post('/planilla/cerrar', checkRole(ROLES.DOCENTE), validate(notasValidator.cerrarPlanilla), cerrarPlanilla);
router.post('/planilla/reabrir', checkRole(ROLES.DOCENTE, ...GESTION), validate(notasValidator.reabrirPlanilla), reabrirPlanilla);
router.post('/definitivas', checkRole(...GESTION), validate(notasValidator.declararDefinitivas), declararDefinitivas);
router.get('/seguimiento', checkRole(...GESTION), validate(notasValidator.seguimiento), seguimiento);

export default router;
