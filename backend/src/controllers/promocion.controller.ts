import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { MomentoPromocion } from '../constants/promocion';
import * as evaluacionService from '../services/evaluacionPromocion.service';
import * as configuracionRematriculaService from '../services/configuracionRematricula.service';
import * as politicaService from '../services/politicaPromocion.service';
import * as rolloverService from '../services/rolloverPromocion.service';
import catchAsync from '../utils/catchAsync';
import { CasoSimulado } from '../utils/simulacionPromocion';

interface AnioParams extends ParamsDictionary {
  academic_year_id: string;
}

export const obtenerPolitica = catchAsync<AnioParams>(async (req, res) => {
  const politica = await politicaService.obtenerPolitica(req.params.academic_year_id);
  res.status(200).json({ success: true, data: politica });
});

export const actualizarPolitica = catchAsync<AnioParams, unknown, politicaService.CambiosPoliticaPromocion>(async (req, res) => {
  const politica = await politicaService.actualizarPolitica(req.params.academic_year_id, req.body, req.user!, req.ip);
  res.status(200).json({ success: true, data: politica });
});

export const simularCaso = catchAsync<AnioParams, unknown, { politica: politicaService.CambiosPoliticaPromocion; caso: CasoSimulado }>(async (req, res) => {
  const data = await politicaService.simularCaso(req.params.academic_year_id, req.body.politica, req.body.caso);
  res.status(200).json({ success: true, data });
});

export const simularGrupo = catchAsync<unknown, unknown, unknown, ParsedQs & { academic_year_id: string; group_id: string; momento: MomentoPromocion }>(async (req, res) => {
  const { academic_year_id, group_id, momento } = req.query;
  res.status(200).json({ success: true, data: await evaluacionService.simularGrupo(academic_year_id, group_id, momento, req.user!) });
});

export const cerrarGrupo = catchAsync<unknown, unknown, { academic_year_id: string; group_id: string; momento: MomentoPromocion; confirm_password: string }>(async (req, res) => {
  const { academic_year_id, group_id, momento, confirm_password } = req.body;
  res.status(200).json({ success: true, data: await evaluacionService.cerrarGrupo(academic_year_id, group_id, momento, confirm_password, req.user!, req.ip) });
});

export const reevaluarEstudiante = catchAsync<unknown, unknown, { academic_year_id: string; student_id: string; motivo: string; confirm_password: string }>(async (req, res) => {
  const { academic_year_id, student_id, motivo, confirm_password } = req.body;
  res.status(201).json({ success: true, data: await evaluacionService.reevaluarEstudiante(academic_year_id, student_id, motivo, confirm_password, req.user!, req.ip) });
});

export const listarEvaluaciones = catchAsync<unknown, unknown, unknown, ParsedQs & evaluacionService.FiltrosEvaluaciones>(async (req, res) => {
  res.status(200).json({ success: true, data: await evaluacionService.listarEvaluaciones(req.query, req.user!) });
});

export const verificarIntegridad = catchAsync<{ id: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await evaluacionService.verificarIntegridad(req.params.id, req.user!) });
});

export const simularRollover = catchAsync<unknown, unknown, unknown, ParsedQs & rolloverService.FiltrosRollover>(async (req, res) => {
  res.status(200).json({ success: true, data: await rolloverService.simularRollover(req.query, req.user!) });
});

export const ejecutarRollover = catchAsync<unknown, unknown, rolloverService.FiltrosRollover & { confirm_password: string }>(async (req, res) => {
  const { confirm_password, ...filtros } = req.body;
  res.status(200).json({ success: true, data: await rolloverService.ejecutarRollover(filtros, confirm_password, req.user!, req.ip) });
});

export const obtenerConfiguracionRematricula = catchAsync(async (_req, res) => {
  res.status(200).json({ success: true, data: configuracionRematriculaService.datosDeConfiguracion(await configuracionRematriculaService.obtenerConfiguracion()) });
});

export const actualizarConfiguracionRematricula = catchAsync<unknown, unknown, configuracionRematriculaService.DatosConfiguracionRematricula>(async (req, res) => {
  const config = await configuracionRematriculaService.actualizarConfiguracion(req.body, req.user!, req.ip);
  res.status(200).json({ success: true, data: configuracionRematriculaService.datosDeConfiguracion(config) });
});
