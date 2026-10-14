import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import * as planAulaService from '../services/planAula.service';
import type { RevisarPlanInput } from '../services/planArea.service';
import catchAsync from '../utils/catchAsync';

interface IdParams extends ParamsDictionary {
  id: string;
}

export const misPlanesDeAula = catchAsync<unknown, unknown, unknown, ParsedQs & { academic_year_id: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await planAulaService.misPlanesDeAula(req.query.academic_year_id, req.user!) });
});

export const bandejaPlanesDeAula = catchAsync<unknown, unknown, unknown, ParsedQs & planAulaService.FiltroBandeja>(async (req, res) => {
  res.status(200).json({ success: true, data: await planAulaService.bandejaPlanesDeAula(req.query, req.user!) });
});

export const planDeAulaDeAsignacion = catchAsync<unknown, unknown, unknown, ParsedQs & { teacher_assignment_id: string; periodo_numero: string }>(async (req, res) => {
  const plan = await planAulaService.planDeAulaDeAsignacion(req.query.teacher_assignment_id, Number(req.query.periodo_numero), req.user!);
  res.status(200).json({ success: true, data: plan });
});

export const obtenerPlanDeAula = catchAsync<IdParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await planAulaService.obtenerPlanDeAula(req.params.id, req.user!) });
});

export const radicarPlanDeAula = catchAsync<unknown, unknown, planAulaService.RadicarPlanAulaInput>(async (req, res) => {
  const plan = await planAulaService.radicarPlanDeAula(req.body, req.file, req.user!, req.ip);
  res.status(201).json({ success: true, data: plan });
});

export const adoptarPlanDeAula = catchAsync<unknown, unknown, { plan_origen_id: string }>(async (req, res) => {
  const plan = await planAulaService.adoptarPlanDeAula(req.body.plan_origen_id, req.user!, req.ip);
  res.status(201).json({ success: true, data: plan });
});

export const revisarPlanDeAula = catchAsync<IdParams, unknown, RevisarPlanInput>(async (req, res) => {
  res.status(200).json({ success: true, data: await planAulaService.revisarPlanDeAula(req.params.id, req.body, req.user!, req.ip) });
});

export const reabrirPlanDeAula = catchAsync<IdParams, unknown, { motivo: string }>(async (req, res) => {
  res.status(200).json({ success: true, data: await planAulaService.reabrirPlanDeAula(req.params.id, req.body.motivo, req.user!, req.ip) });
});

export const descargarPlanDeAula = catchAsync<IdParams, unknown, unknown, ParsedQs & { version?: string }>(async (req, res) => {
  const version = req.query.version ? Number(req.query.version) : undefined;
  const { ruta, nombre } = await planAulaService.rutaDelArchivoPlanDeAula(req.params.id, version, req.user!);
  res.download(ruta, nombre, (err) => {
    if (err && !res.headersSent) res.status(404).json({ success: false, message: 'El archivo del plan ya no está disponible.' });
  });
});
