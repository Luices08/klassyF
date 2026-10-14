import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import * as planAreaService from '../services/planArea.service';
import catchAsync from '../utils/catchAsync';

interface IdParams extends ParamsDictionary {
  id: string;
}

export const listarPlanesDeArea = catchAsync<unknown, unknown, unknown, ParsedQs & { academic_year_id: string }>(async (req, res) => {
  const filas = await planAreaService.listarPlanesDeArea(req.query.academic_year_id, req.user!);
  res.status(200).json({ success: true, count: filas.length, data: filas });
});

export const obtenerPlanDeArea = catchAsync<IdParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await planAreaService.obtenerPlanDeArea(req.params.id, req.user!) });
});

export const radicarPlanDeArea = catchAsync<unknown, unknown, planAreaService.RadicarPlanAreaInput>(async (req, res) => {
  const plan = await planAreaService.radicarPlanDeArea(req.body, req.file, req.user!, req.ip);
  res.status(201).json({ success: true, data: plan });
});

export const revisarPlanDeArea = catchAsync<IdParams, unknown, planAreaService.RevisarPlanInput>(async (req, res) => {
  res.status(200).json({ success: true, data: await planAreaService.revisarPlanDeArea(req.params.id, req.body, req.user!, req.ip) });
});

export const reabrirPlanDeArea = catchAsync<IdParams, unknown, { motivo: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await planAreaService.reabrirPlanDeArea(req.params.id, req.body.motivo, req.user!, req.ip) });
});

export const descargarPlanDeArea = catchAsync<IdParams, unknown, unknown, ParsedQs & { version?: string }>(async (req, res) => {
  const version = req.query.version ? Number(req.query.version) : undefined;
  const { ruta, nombre } = await planAreaService.rutaDelArchivoPlanDeArea(req.params.id, version, req.user!);
  res.download(ruta, nombre, (err) => {
    if (err && !res.headersSent) res.status(404).json({ success: false, message: 'El archivo del plan ya no está disponible.' });
  });
});
