import { ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';
import * as service from '../services/citacion.service';
import { CambiosCitacion, CitacionInput, FiltrosCitaciones } from '../services/citacion.service';
import * as respuestas from '../services/citacionRespuesta.service';
import { RespuestaAsistencia } from '../constants/citaciones';
import catchAsync from '../utils/catchAsync';

type IdParams = ParamsDictionary & { id: string };
type TokenParams = ParamsDictionary & { token: string };
type RespuestaBody = { respuesta: Exclude<RespuestaAsistencia, 'PENDIENTE'> };

const ok = (res: import('express').Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });

export const listar = catchAsync(async (req, res) => ok(res, await service.listarCitaciones(req.query as unknown as FiltrosCitaciones, req.user!)));
export const grupos = catchAsync(async (req, res) => ok(res, await service.gruposQueConvoca(req.user!)));
export const estudiantes = catchAsync<ParamsDictionary, unknown, unknown, ParsedQs & { group_id: string }>(async (req, res) =>
  ok(res, await service.estudiantesDelGrupo(req.user!, req.query.group_id))
);
export const crear = catchAsync<ParamsDictionary, unknown, CitacionInput>(async (req, res) => ok(res, await service.crearCitacion(req.body, req.user!, req.ip), 201));
export const detalle = catchAsync<IdParams>(async (req, res) => ok(res, await service.detalleCitacion(req.params.id, req.user!)));
export const actualizar = catchAsync<IdParams, unknown, CambiosCitacion>(async (req, res) => ok(res, await service.actualizarCitacion(req.params.id, req.body, req.user!, req.ip)));
export const cancelar = catchAsync<IdParams, unknown, { motivo: string }>(async (req, res) => ok(res, await service.cancelarCitacion(req.params.id, req.body.motivo, req.user!, req.ip)));
export const realizada = catchAsync<IdParams>(async (req, res) => ok(res, await service.marcarRealizada(req.params.id, req.user!, req.ip)));
export const reenviar = catchAsync<IdParams & { destinatarioId: string }>(async (req, res) =>
  ok(res, await service.reenviarCorreo(req.params.id, req.params.destinatarioId, req.user!, req.ip))
);

// Enlace del correo: sin sesión, el token es la credencial.
export const consultarPublica = catchAsync<TokenParams>(async (req, res) => ok(res, await respuestas.consultarPorToken(req.params.token)));
export const responderPublica = catchAsync<TokenParams, unknown, RespuestaBody>(async (req, res) => ok(res, await respuestas.responderPorToken(req.params.token, req.body.respuesta)));
