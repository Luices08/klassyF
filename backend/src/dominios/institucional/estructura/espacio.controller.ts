import { Request } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { EstadoEspacio } from '../../../constants/enums';
import * as espacioService from './espacio.service';
import { ActualizarEspacioInput, EspacioInput, ListarEspaciosFilter } from './espacio.service';
import ApiError from '../../../utils/ApiError';
import catchAsync from '../../../utils/catchAsync';

function contexto(req: Request<any, any, any, any>) {
  if (!req.user) throw new ApiError(401, 'Usuario no autenticado.');
  return { usuarioId: req.user._id, ip: req.ip ?? null };
}

interface EspacioParams extends ParamsDictionary {
  id: string;
}

export const listarEspacios = catchAsync<unknown, unknown, unknown, ListarEspaciosFilter>(async (req, res) => {
  const espacios = await espacioService.listarEspacios(req.query);
  res.status(200).json({ success: true, count: espacios.length, data: espacios });
});

export const crearEspacio = catchAsync<unknown, unknown, EspacioInput>(async (req, res) => {
  res.status(201).json({ success: true, data: await espacioService.crearEspacio(req.body, contexto(req)) });
});

export const actualizarEspacio = catchAsync<EspacioParams, unknown, ActualizarEspacioInput>(async (req, res) => {
  res.status(200).json({ success: true, data: await espacioService.actualizarEspacio(req.params.id, req.body, contexto(req)) });
});

export const cambiarEstadoEspacio = catchAsync<EspacioParams, unknown, { estado: EstadoEspacio }>(async (req, res) => {
  const espacio = await espacioService.cambiarEstadoEspacio(req.params.id, req.body.estado, contexto(req));
  res.status(200).json({ success: true, data: espacio });
});

export const eliminarEspacio = catchAsync<EspacioParams>(async (req, res) => {
  await espacioService.eliminarEspacio(req.params.id, contexto(req));
  res.status(200).json({ success: true, data: null });
});
