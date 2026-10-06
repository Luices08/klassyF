import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import { EstadoRemisionOrientacion } from '../comun/convivencia.constants';
import * as orientacionService from './remisionOrientacion.service';
import catchAsync from '../../../utils/catchAsync';

interface IdParams extends ParamsDictionary {
  id: string;
}

export const listarRemisiones = catchAsync<unknown, unknown, unknown, ParsedQs & { estado?: EstadoRemisionOrientacion; pagina?: number; limite?: number }>(
  async (req, res) => {
    const paginacion = { pagina: Number(req.query.pagina ?? 1), limite: Number(req.query.limite ?? 20) };
    res.status(200).json({ success: true, ...(await orientacionService.bandejaDeRemisiones(req.user!, { estado: req.query.estado }, paginacion, req.ip)) });
  }
);

export const obtenerRemision = catchAsync<IdParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await orientacionService.obtenerRemision(req.params.id, req.user!, req.ip) });
});

export const registrarAtencion = catchAsync<IdParams, unknown, { fecha: string; descripcion: string }>(async (req, res) => {
  res.status(201).json({ success: true, data: await orientacionService.registrarAtencion(req.params.id, req.body, req.user!, req.ip) });
});

export const marcarAtendida = catchAsync<IdParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await orientacionService.marcarAtendida(req.params.id, req.user!, req.ip) });
});
