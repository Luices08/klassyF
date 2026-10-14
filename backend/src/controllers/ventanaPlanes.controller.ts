import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import * as ventanaService from '../services/ventanaPlanes.service';
import catchAsync from '../utils/catchAsync';

interface VentanaParams extends ParamsDictionary {
  academic_year_id: string;
  numero: string;
}

export const listarVentanas = catchAsync<unknown, unknown, unknown, ParsedQs & { academic_year_id: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await ventanaService.listarVentanas(req.query.academic_year_id) });
});

export const configurarVentana = catchAsync<VentanaParams, unknown, ventanaService.CambioVentana>(async (req, res) => {
  const ventanas = await ventanaService.configurarVentana(req.params.academic_year_id, Number(req.params.numero), req.body, req.user!, req.ip);
  res.status(200).json({ success: true, data: ventanas });
});
