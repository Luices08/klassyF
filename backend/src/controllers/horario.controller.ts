import { Request } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { EstadoUsuario } from '../constants/enums';
import * as horarioService from '../services/horario.service';
import { ActualizarVariableInput, EditarSesionInput, GenerarInput, ListarPorContexto, VariableInput } from '../services/horario.service';
import * as horarioPdfService from '../services/horarioPdf.service';
import { VistaPdfHorario } from '../services/horarioPdf.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

function contexto(req: Request<any, any, any, any>) {
  if (!req.user) throw new ApiError(401, 'Usuario no autenticado.');
  return { usuarioId: req.user._id, ip: req.ip ?? null };
}

interface IdParams extends ParamsDictionary {
  id: string;
}

// Joi ya exigió ambos campos (validators/horario.validator.ts); Express tipa el query como opcional.
type QueryContexto = Partial<ListarPorContexto>;
const aContexto = (q: QueryContexto) => q as ListarPorContexto;

export const listarVariables = catchAsync<unknown, unknown, unknown, QueryContexto>(async (req, res) => {
  const variables = await horarioService.listarVariables(aContexto(req.query));
  res.status(200).json({ success: true, count: variables.length, data: variables });
});

export const crearVariable = catchAsync<unknown, unknown, VariableInput>(async (req, res) => {
  res.status(201).json({ success: true, data: await horarioService.crearVariable(req.body, contexto(req)) });
});

export const actualizarVariable = catchAsync<IdParams, unknown, ActualizarVariableInput>(async (req, res) => {
  res.status(200).json({ success: true, data: await horarioService.actualizarVariable(req.params.id, req.body, contexto(req)) });
});

export const cambiarEstadoVariable = catchAsync<IdParams, unknown, { estado: EstadoUsuario }>(async (req, res) => {
  res.status(200).json({ success: true, data: await horarioService.cambiarEstadoVariable(req.params.id, req.body.estado, contexto(req)) });
});

export const eliminarVariable = catchAsync<IdParams>(async (req, res) => {
  await horarioService.eliminarVariable(req.params.id, contexto(req));
  res.status(200).json({ success: true, data: null });
});

export const obtenerInsumos = catchAsync<unknown, unknown, unknown, QueryContexto>(async (req, res) => {
  res.status(200).json({ success: true, data: await horarioService.obtenerInsumos(aContexto(req.query)) });
});

export const listarHorarios = catchAsync<unknown, unknown, unknown, QueryContexto>(async (req, res) => {
  const horarios = await horarioService.listarHorarios(aContexto(req.query));
  res.status(200).json({ success: true, count: horarios.length, data: horarios });
});

// 202: la versión queda en GENERANDO y el motor sigue en segundo plano.
export const generarHorario = catchAsync<unknown, unknown, GenerarInput>(async (req, res) => {
  res.status(202).json({ success: true, data: await horarioService.generarHorario(req.body, contexto(req)) });
});

interface SesionParams extends ParamsDictionary {
  id: string;
  sesionId: string;
}

export const editarSesion = catchAsync<SesionParams, unknown, EditarSesionInput>(async (req, res) => {
  res.status(200).json({ success: true, data: await horarioService.editarSesion(req.params.id, req.params.sesionId, req.body, contexto(req)) });
});

export const miHorario = catchAsync(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'Usuario no autenticado.');
  res.status(200).json({ success: true, data: await horarioService.miHorario(req.user) });
});

export const pdfHorario = catchAsync<IdParams, unknown, unknown, { vista?: VistaPdfHorario; entidad_id?: string }>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'Usuario no autenticado.');
  const { buffer, nombreArchivo } = await horarioPdfService.generarPdfHorario(req.params.id, req.query.vista ?? 'GRUPO', req.query.entidad_id, req.user);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${nombreArchivo}"`);
  res.send(buffer);
});

export const obtenerHorario = catchAsync<IdParams>(async (req, res) => {
  res.status(200).json({ success: true, data: await horarioService.obtenerHorario(req.params.id) });
});

export const publicarHorario = catchAsync<IdParams, unknown, { confirm_password: string }>(async (req, res) => {
  const horario = await horarioService.publicarHorario(req.params.id, req.body.confirm_password, contexto(req));
  res.status(200).json({ success: true, data: horario });
});

export const eliminarHorario = catchAsync<IdParams>(async (req, res) => {
  await horarioService.eliminarHorario(req.params.id, contexto(req));
  res.status(200).json({ success: true, data: null });
});
