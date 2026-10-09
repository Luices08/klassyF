import { ParsedQs } from 'qs';
import * as notasService from '../services/notas.service';
import * as excelService from '../services/notasExcel.service';
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
