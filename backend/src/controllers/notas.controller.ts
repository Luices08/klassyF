import { ParsedQs } from 'qs';
import * as casillasService from '../services/columnasPlanilla.service';
import * as notasService from '../services/notas.service';
import * as plantillaService from '../services/configuracionPlanilla.service';
import * as excelService from '../services/notasExcel.service';
import * as pdfService from '../services/planillaPdf.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

type ConsultaPlanilla = ParsedQs & { teacher_assignment_id: string; periodo_numero: number };

export const obtenerPlanilla = catchAsync<unknown, unknown, unknown, ConsultaPlanilla>(async (req, res) => {
  const planilla = await notasService.obtenerPlanilla(req.query.teacher_assignment_id, Number(req.query.periodo_numero), req.user!);
  res.status(200).json({ success: true, data: planilla });
});

export const guardarCeldas = catchAsync<unknown, unknown, notasService.GuardarCeldasInput>(async (req, res) => {
  const resultado = await notasService.guardarCeldas(req.body, req.user!, req.ip);
  res.status(200).json({ success: true, data: resultado });
});

// --- Casillas de la planilla (las arma el docente dentro del molde del año) ---

export const obtenerBloques = catchAsync<unknown, unknown, unknown, ConsultaPlanilla>(async (req, res) => {
  const bloques = await casillasService.obtenerBloques(req.query.teacher_assignment_id, Number(req.query.periodo_numero), req.user!);
  res.status(200).json({ success: true, data: bloques });
});

export const crearCasilla = catchAsync<unknown, unknown, casillasService.CrearCasillaInput>(async (req, res) => {
  res.status(201).json({ success: true, data: await casillasService.crearCasilla(req.body, req.user!, req.ip) });
});

export const actualizarCasilla = catchAsync<{ id: string }, unknown, casillasService.ActualizarCasillaInput>(async (req, res) => {
  res.status(200).json({ success: true, data: await casillasService.actualizarCasilla(req.params.id, req.body, req.user!, req.ip) });
});

export const eliminarCasilla = catchAsync<{ id: string }>(async (req, res) => {
  await casillasService.eliminarCasilla(req.params.id, req.user!, req.ip);
  res.status(200).json({ success: true });
});

export const establecerPesos = catchAsync<unknown, unknown, casillasService.EstablecerPesosInput>(async (req, res) => {
  res.status(200).json({ success: true, data: await casillasService.establecerPesos(req.body, req.user!, req.ip) });
});

export const cerrarPlanilla = catchAsync<unknown, unknown, notasService.PlanillaRef>(async (req, res) => {
  res.status(200).json({ success: true, data: await notasService.cerrarPlanilla(req.body, req.user!, req.ip) });
});

export const reabrirPlanilla = catchAsync<unknown, unknown, notasService.PlanillaRef & { motivo: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await notasService.reabrirPlanilla(req.body, req.user!, req.ip) });
});

export const declararDefinitivas = catchAsync<unknown, unknown, notasService.DefinitivasInput>(async (req, res) => {
  res.status(200).json({ success: true, data: await notasService.declararDefinitivas(req.body, req.user!, req.ip) });
});

export const seguimiento = catchAsync<unknown, unknown, unknown, ParsedQs & notasService.SeguimientoQuery>(async (req, res) => {
  const filas = await notasService.seguimiento({
    academic_year_id: req.query.academic_year_id,
    periodo_numero: Number(req.query.periodo_numero),
    group_id: req.query.group_id,
  });
  res.status(200).json({ success: true, count: filas.length, data: filas });
});

export const descargarExcel = catchAsync<unknown, unknown, unknown, ConsultaPlanilla>(async (req, res) => {
  const { buffer, nombreArchivo } = await excelService.generarPlantillaNotas(
    req.query.teacher_assignment_id,
    Number(req.query.periodo_numero),
    req.user!
  );
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  res.send(buffer);
});

export const importarExcel = catchAsync(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Debes adjuntar un archivo en el campo "file".');
  res.status(200).json({ success: true, data: await excelService.importarPlantillaNotas(req.file.buffer, req.user!, req.ip) });
});

// --- Plantilla de la planilla (presentación) y PDF ---

export const obtenerPlantilla = catchAsync(async (_req, res) => {
  res.status(200).json({ success: true, data: await plantillaService.obtenerPlantillaPlanilla() });
});

export const actualizarPlantilla = catchAsync<unknown, unknown, plantillaService.CambiosPlantilla>(async (req, res) => {
  res.status(200).json({ success: true, data: await plantillaService.actualizarPlantillaPlanilla(req.body, req.user!, req.ip) });
});

export const descargarPdf = catchAsync<unknown, unknown, unknown, ConsultaPlanilla>(async (req, res) => {
  const { buffer, nombreArchivo } = await pdfService.generarPdfPlanilla(req.query.teacher_assignment_id, Number(req.query.periodo_numero), req.user!);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  res.send(buffer);
});
