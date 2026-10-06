import { ParamsDictionary } from 'express-serve-static-core';
import JornadaOperativa from './jornadaOperativa.model';
import * as jornadaOperativaService from './jornadaOperativa.service';
import { CrearJornadaInput } from './jornadaOperativa.service';
import ApiError from '../../../utils/ApiError';
import catchAsync from '../../../utils/catchAsync';
import { ActualizarHorarioInput } from './jornadaOperativa.service';

export const crearJornada = catchAsync<unknown, unknown, CrearJornadaInput>(async (req, res) => {
  const jornada = await jornadaOperativaService.crearJornada(req.body);
  res.status(201).json({ success: true, data: jornada });
});

interface JornadaParams extends ParamsDictionary {
  id: string;
}

export const actualizarHorario = catchAsync<JornadaParams, unknown, ActualizarHorarioInput>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'Usuario no autenticado.');
  const jornada = await jornadaOperativaService.actualizarHorario(req.params.id, req.body, {
    usuarioId: req.user._id,
    ip: req.ip ?? null,
  });
  res.status(200).json({ success: true, data: jornada });
});

export const franjasDesdePlantilla = catchAsync<JornadaParams>(async (req, res) => {
  const resultado = await jornadaOperativaService.franjasDesdePlantilla(req.params.id);
  res.status(200).json({ success: true, data: resultado });
});

interface ListarJornadasQuery {
  sede_id?: string;
}

export const listarJornadas = catchAsync<unknown, unknown, unknown, ListarJornadasQuery>(async (req, res) => {
  const filter: Record<string, string> = {};
  if (req.query.sede_id) filter.sede_id = req.query.sede_id;

  const jornadas = await JornadaOperativa.find(filter).populate('sede_id', 'nombre').sort({ nombre: 1 });
  res.status(200).json({ success: true, count: jornadas.length, data: jornadas });
});
