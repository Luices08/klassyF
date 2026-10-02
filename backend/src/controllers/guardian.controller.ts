import { Request } from 'express';
import { ParamsDictionary } from 'express-serve-static-core';
import { EstadoUsuario, Parentesco, TipoDocumento } from '../constants/enums';
import * as guardianService from '../services/guardian.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

function contexto(req: Request<any, any, any, any>) {
  if (!req.user) throw new ApiError(401, 'Usuario no autenticado.');
  return { usuarioId: req.user._id, ip: req.ip ?? null };
}

interface ListarQuery {
  search?: string;
  page?: number;
  limit?: number;
}

export const listarAcudientes = catchAsync<unknown, unknown, unknown, ListarQuery>(async (req, res) => {
  const resultado = await guardianService.listarAcudientes(req.query);
  res.status(200).json({ success: true, ...resultado });
});

interface UserIdParams extends ParamsDictionary {
  userId: string;
}

export const listarAcudientesDeEstudiante = catchAsync<UserIdParams>(async (req, res) => {
  const data = await guardianService.listarAcudientesDeEstudiante(req.params.userId);
  res.status(200).json({ success: true, count: data.length, data });
});

interface VincularBody {
  guardian_id?: string;
  tipo_documento?: TipoDocumento;
  numero_documento?: string;
  nombre?: string;
  apellido?: string;
  telefono_principal?: string;
  telefono_secundario?: string;
  email?: string;
  ocupacion?: string;
  direccion?: string;
  parentesco: Parentesco;
  es_principal?: boolean;
  autorizado_retiro?: boolean;
  habilitar_portal?: boolean;
}

export const vincularAcudiente = catchAsync<UserIdParams, unknown, VincularBody>(async (req, res) => {
  const relacion = await guardianService.vincularAcudiente(req.params.userId, req.body, contexto(req));
  res.status(201).json({ success: true, data: relacion });
});

interface RelationParams extends ParamsDictionary {
  userId: string;
  relationId: string;
}

interface ActualizarVinculoBody {
  parentesco?: Parentesco;
  es_principal?: boolean;
  autorizado_retiro?: boolean;
}

export const actualizarVinculo = catchAsync<RelationParams, unknown, ActualizarVinculoBody>(async (req, res) => {
  const relacion = await guardianService.actualizarVinculo(req.params.relationId, req.body, contexto(req));
  res.status(200).json({ success: true, data: relacion });
});

export const desvincularAcudiente = catchAsync<RelationParams>(async (req, res) => {
  await guardianService.desvincularAcudiente(req.params.relationId, contexto(req));
  res.status(200).json({ success: true, data: null });
});

interface GuardianParams extends ParamsDictionary {
  id: string;
}

interface ActualizarAcudienteBody {
  nombre?: string;
  apellido?: string;
  telefono_principal?: string;
  telefono_secundario?: string;
  email?: string;
  ocupacion?: string;
  direccion?: string;
}

export const actualizarAcudiente = catchAsync<GuardianParams, unknown, ActualizarAcudienteBody>(async (req, res) => {
  const guardian = await guardianService.actualizarAcudiente(req.params.id, req.body, contexto(req));
  res.status(200).json({ success: true, data: guardian });
});

interface ActualizarEstadoBody {
  estado: EstadoUsuario;
}

export const actualizarEstadoAcudiente = catchAsync<GuardianParams, unknown, ActualizarEstadoBody>(async (req, res) => {
  const guardian = await guardianService.actualizarEstadoAcudiente(req.params.id, req.body.estado, contexto(req));
  res.status(200).json({ success: true, data: guardian });
});
