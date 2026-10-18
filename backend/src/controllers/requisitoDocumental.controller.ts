import { ParamsDictionary } from 'express-serve-static-core';
import * as servicio from '../services/requisitoDocumental.service';
import catchAsync from '../utils/catchAsync';

interface IdParams extends ParamsDictionary {
  id: string;
}

export const listar = catchAsync<unknown, unknown, unknown, { estado?: 'activo' | 'inactivo' }>(async (req, res) => {
  res.status(200).json({ success: true, data: await servicio.listarRequisitos({ estado: req.query.estado }) });
});

export const crear = catchAsync<unknown, unknown, servicio.DatosRequisito>(async (req, res) => {
  res.status(201).json({ success: true, data: await servicio.crearRequisito(req.body, req.user!, req.ip) });
});

export const actualizar = catchAsync<IdParams, unknown, servicio.DatosRequisito>(async (req, res) => {
  res.status(200).json({ success: true, data: await servicio.actualizarRequisito(req.params.id, req.body, req.user!, req.ip) });
});

export const cambiarEstado = catchAsync<IdParams, unknown, { estado: 'activo' | 'inactivo' }>(async (req, res) => {
  res.status(200).json({ success: true, data: await servicio.cambiarEstadoRequisito(req.params.id, req.body.estado, req.user!, req.ip) });
});

export const eliminar = catchAsync<IdParams>(async (req, res) => {
  await servicio.eliminarRequisito(req.params.id, req.user!, req.ip);
  res.status(200).json({ success: true });
});
