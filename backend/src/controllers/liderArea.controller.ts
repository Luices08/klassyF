import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import * as liderAreaService from '../services/liderArea.service';
import catchAsync from '../utils/catchAsync';

interface IdParams extends ParamsDictionary {
  id: string;
}

const contexto = (req: { user?: { _id: unknown }; ip?: string }) => ({ usuarioId: String(req.user!._id), ip: req.ip ?? null });

export const listarLideresArea = catchAsync<unknown, unknown, unknown, ParsedQs & { area_id?: string; incluir_inactivos?: string }>(async (req, res) => {
  const lideres = await liderAreaService.listarLideresArea({ area_id: req.query.area_id, incluir_inactivos: String(req.query.incluir_inactivos) === 'true' });
  res.status(200).json({ success: true, count: lideres.length, data: lideres });
});

export const crearLiderArea = catchAsync<unknown, unknown, liderAreaService.DatosLiderArea & { area_id: string }>(async (req, res) => {
  const { area_id, ...datos } = req.body;
  res.status(201).json({ success: true, data: await liderAreaService.crearLiderArea(area_id, datos, contexto(req)) });
});

export const actualizarLiderArea = catchAsync<IdParams, unknown, liderAreaService.CambiosLiderArea>(async (req, res) => {
  res.status(200).json({ success: true, data: await liderAreaService.actualizarLiderArea(req.params.id, req.body, contexto(req)) });
});

export const quitarLiderArea = catchAsync<IdParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await liderAreaService.quitarLiderArea(req.params.id, contexto(req)) });
});
