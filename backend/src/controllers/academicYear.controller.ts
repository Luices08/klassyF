import { Request } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import * as anioService from '../services/academicYear.service';
import {
  CambiarEstadoPeriodoInput,
  CerrarAnioInput,
  ContextoUsuario,
  CrearAnioInput,
  DatosAnioInput,
  EventoInput,
  PeriodoSedeInput,
} from '../services/academicYear.service';
import * as prorrogaService from '../services/periodoProrroga.service';
import { OtorgarProrrogaInput } from '../services/periodoProrroga.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

function contexto(req: Request<any, any, any, any>): ContextoUsuario & { rol: NonNullable<Request['user']>['rol'] } {
  if (!req.user) throw new ApiError(401, 'Usuario no autenticado.');
  return { usuarioId: req.user._id, rol: req.user.rol, ip: req.ip ?? null };
}

interface AnioParams extends ParamsDictionary {
  id: string;
}
interface PeriodoParams extends AnioParams {
  numero: string;
}
interface EventoParams extends AnioParams {
  eventoId: string;
}
interface SedeParams extends AnioParams {
  sedeId: string;
}
interface ProrrogaParams extends AnioParams {
  prorrogaId: string;
}

export const listarAnios = catchAsync(async (_req, res) => {
  const anios = await anioService.listarAnios();
  res.status(200).json({ success: true, count: anios.length, data: anios });
});

export const obtenerAnioActivo = catchAsync(async (_req, res) => {
  res.status(200).json({ success: true, data: await anioService.obtenerAnioActivo() });
});

export const obtenerAnio = catchAsync<AnioParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await anioService.obtenerAnio(req.params.id) });
});

export const crearAnio = catchAsync<unknown, unknown, CrearAnioInput>(async (req, res) => {
  res.status(201).json({ success: true, data: await anioService.crearAnio(req.body, contexto(req)) });
});

export const actualizarAnio = catchAsync<AnioParams, unknown, DatosAnioInput>(async (req, res) => {
  res.status(200).json({ success: true, data: await anioService.actualizarAnio(req.params.id, req.body, contexto(req)) });
});

export const activarAnio = catchAsync<AnioParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await anioService.activarAnio(req.params.id, contexto(req)) });
});

export const verificarCierre = catchAsync<AnioParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await anioService.verificarCierre(req.params.id) });
});

export const cerrarAnio = catchAsync<AnioParams, unknown, CerrarAnioInput>(async (req, res) => {
  res.status(200).json({ success: true, data: await anioService.cerrarAnio(req.params.id, req.body, contexto(req)) });
});

export const cambiarEstadoPeriodo = catchAsync<PeriodoParams, unknown, CambiarEstadoPeriodoInput>(async (req, res) => {
  const anio = await anioService.cambiarEstadoPeriodo(req.params.id, Number(req.params.numero), req.body, contexto(req));
  res.status(200).json({ success: true, data: anio });
});

export const listarProrrogas = catchAsync<AnioParams>(async (req, res) => {
  const prorrogas = await prorrogaService.listarProrrogas(req.params.id);
  res.status(200).json({ success: true, count: prorrogas.length, data: prorrogas });
});

export const otorgarProrroga = catchAsync<AnioParams, unknown, OtorgarProrrogaInput>(async (req, res) => {
  const prorroga = await prorrogaService.otorgarProrroga(req.params.id, req.body, contexto(req));
  res.status(201).json({ success: true, data: prorroga });
});

export const revocarProrroga = catchAsync<ProrrogaParams>(async (req, res) => {
  const prorroga = await prorrogaService.revocarProrroga(req.params.id, req.params.prorrogaId, contexto(req));
  res.status(200).json({ success: true, data: prorroga });
});

export const crearEvento = catchAsync<AnioParams, unknown, EventoInput>(async (req, res) => {
  res.status(201).json({ success: true, data: await anioService.crearEvento(req.params.id, req.body, contexto(req)) });
});

export const actualizarEvento = catchAsync<EventoParams, unknown, EventoInput>(async (req, res) => {
  const anio = await anioService.actualizarEvento(req.params.id, req.params.eventoId, req.body, contexto(req));
  res.status(200).json({ success: true, data: anio });
});

export const eliminarEvento = catchAsync<EventoParams>(async (req, res) => {
  const anio = await anioService.eliminarEvento(req.params.id, req.params.eventoId, contexto(req));
  res.status(200).json({ success: true, data: anio });
});

export const guardarCalendarioSede = catchAsync<SedeParams, unknown, { periodos: PeriodoSedeInput[] }>(async (req, res) => {
  const anio = await anioService.guardarCalendarioSede(req.params.id, req.params.sedeId, req.body.periodos, contexto(req));
  res.status(200).json({ success: true, data: anio });
});

export const quitarCalendarioSede = catchAsync<SedeParams>(async (req, res) => {
  const anio = await anioService.quitarCalendarioSede(req.params.id, req.params.sedeId, contexto(req));
  res.status(200).json({ success: true, data: anio });
});
