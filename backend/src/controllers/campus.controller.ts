import { ParamsDictionary } from 'express-serve-static-core';
import { EstadoUsuario } from '../constants/enums';
import * as campusService from '../services/campus.service';
import { ActualizarSedeInput, CrearSedeInput } from '../services/campus.service';
import Campus from '../models/campus.model';
import catchAsync from '../utils/catchAsync';

interface ListCampusesQuery {
  institucion_id?: string;
}

export const listCampuses = catchAsync<unknown, unknown, unknown, ListCampusesQuery>(async (req, res) => {
  const filter: Record<string, string> = {};
  if (req.query.institucion_id) filter.institucion_id = req.query.institucion_id;

  const campuses = await Campus.find(filter).sort({ nombre: 1 });
  res.status(200).json({ success: true, count: campuses.length, data: campuses });
});

export const crearSede = catchAsync<unknown, unknown, CrearSedeInput>(async (req, res) => {
  const sede = await campusService.crearSede(req.body);
  res.status(201).json({ success: true, data: sede });
});

interface SedeParams extends ParamsDictionary {
  id: string;
}

export const actualizarSede = catchAsync<SedeParams, unknown, ActualizarSedeInput>(async (req, res) => {
  const sede = await campusService.actualizarSede(req.params.id, req.body);
  res.status(200).json({ success: true, data: sede });
});

export const eliminarSede = catchAsync<SedeParams>(async (req, res) => {
  await campusService.eliminarSede(req.params.id);
  res.status(200).json({ success: true, data: null });
});

interface ActualizarEstadoSedeBody {
  estado: EstadoUsuario;
}

export const actualizarEstadoSede = catchAsync<SedeParams, unknown, ActualizarEstadoSedeBody>(async (req, res) => {
  const sede = await campusService.actualizarEstadoSede(req.params.id, req.body.estado);
  res.status(200).json({ success: true, data: sede });
});
