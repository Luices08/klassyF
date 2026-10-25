import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import catchAsync from '../../utils/catchAsync';
import * as analisis from './services/analisis.service';
import * as modelos from './services/modelos.service';

interface IdParams extends ParamsDictionary {
  id: string;
}
type ConsultaBusqueda = ParsedQs & { q?: string; academic_year_id?: string };
type ConsultaAnio = ParsedQs & { academic_year_id?: string };

export const listarModelos = catchAsync(async (_req, res) => {
  res.status(200).json({ success: true, data: await modelos.listarModelos() });
});

export const entrenar = catchAsync(async (req, res) => {
  res.status(202).json({ success: true, data: await modelos.solicitarEntrenamiento(req.user!, req.ip) });
});

export const activar = catchAsync<IdParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await modelos.activarModelo(req.params.id, req.user!, req.ip) });
});

export const buscarEstudiantes = catchAsync<ParamsDictionary, unknown, unknown, ConsultaBusqueda>(async (req, res) => {
  res.status(200).json({ success: true, data: await analisis.buscarEstudiantes(req.user!, req.query.q ?? '', req.query.academic_year_id) });
});

export const analisisDeEstudiante = catchAsync<IdParams, unknown, unknown, ConsultaAnio>(async (req, res) => {
  res.status(200).json({ success: true, data: await analisis.analisisParaPersonal(req.user!, req.params.id, req.query.academic_year_id, req.ip) });
});

export const analisisPropio = catchAsync(async (req, res) => {
  res.status(200).json({ success: true, data: await analisis.analisisPropio(req.user!, req.ip) });
});

export const analisisDeHijo = catchAsync<IdParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await analisis.analisisDeHijo(req.user!, req.params.id, req.ip) });
});
