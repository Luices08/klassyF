import { ParamsDictionary } from 'express-serve-static-core';
import * as historialService from '../services/historialAcciones.service';
import { generarExcelTabular } from '../services/reporteTabularExcel.service';
import catchAsync from '../utils/catchAsync';

type ConsultaHistorial = Omit<historialService.FiltrosHistorial, 'page' | 'limit'> & { page?: string; limit?: string };

const aFiltros = (q: ConsultaHistorial): historialService.FiltrosHistorial => ({
  ...q,
  page: q.page ? Number(q.page) : undefined,
  limit: q.limit ? Number(q.limit) : undefined,
});

export const listAuditLogs = catchAsync<unknown, unknown, unknown, ConsultaHistorial>(async (req, res) => {
  const resultado = await historialService.listarHistorial(aFiltros(req.query));
  res.status(200).json({ success: true, count: resultado.data.length, ...resultado });
});

export const catalogoHistorial = catchAsync(async (_req, res) => {
  res.status(200).json({ success: true, data: historialService.catalogoHistorial() });
});

export const exportarHistorial = catchAsync<unknown, unknown, unknown, ConsultaHistorial>(async (req, res) => {
  const reporte = await historialService.exportarHistorial(aFiltros(req.query), req.user!._id, req.ip);
  const { buffer, nombreArchivo } = await generarExcelTabular(reporte);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  res.send(buffer);
});

export const historialDeMatricula = catchAsync<ParamsDictionary & { id: string }>(async (req, res) => {
  const data = await historialService.historialDeMatricula(req.params.id);
  res.status(200).json({ success: true, data });
});
