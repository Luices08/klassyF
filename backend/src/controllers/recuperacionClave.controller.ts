import { ParamsDictionary } from 'express-serve-static-core';
import * as service from '../services/recuperacionClave.service';
import catchAsync from '../utils/catchAsync';

type IdParams = ParamsDictionary & { id: string };

// Misma respuesta exista o no el documento: no se puede usar para averiguar quién tiene cuenta.
const MENSAJE_GENERICO = 'Si el documento está registrado, la secretaría del colegio recibió tu solicitud. Acércate a ella para que te entreguen una clave nueva.';

export const solicitar = catchAsync<ParamsDictionary, unknown, { numero_documento: string; nota?: string }>(async (req, res) => {
  await service.solicitarRecuperacion(req.body, req.ip);
  res.status(202).json({ success: true, data: { mensaje: MENSAJE_GENERICO } });
});

export const listar = catchAsync(async (req, res) => {
  const vista = (req.query.vista as 'PENDIENTES' | 'ATENDIDAS' | undefined) ?? 'PENDIENTES';
  res.status(200).json({ success: true, data: await service.listarSolicitudes(req.user!, vista) });
});

export const aprobar = catchAsync<IdParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await service.aprobarSolicitud(req.params.id, req.user!, req.ip) });
});

export const rechazar = catchAsync<IdParams, unknown, { motivo?: string }>(async (req, res) => {
  await service.rechazarSolicitud(req.params.id, req.body.motivo, req.user!, req.ip);
  res.status(200).json({ success: true, data: null });
});
