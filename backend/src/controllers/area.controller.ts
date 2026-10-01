import { ParamsDictionary } from 'express-serve-static-core';
import { EstadoArea } from '../constants/enums';
import * as areaService from '../services/area.service';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

interface CreateAreaBody {
  nombre: string;
  descripcion: string;
  codigo: string;
}

export const createArea = catchAsync<unknown, unknown, CreateAreaBody>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'Usuario no autenticado.');
  const area = await areaService.crearArea(req.body, { usuarioId: req.user._id, ip: req.ip ?? null });
  res.status(201).json({ success: true, data: area });
});

interface ListAreasQuery {
  estado?: EstadoArea;
}

export const listAreas = catchAsync<unknown, unknown, unknown, ListAreasQuery>(async (req, res) => {
  const areas = await areaService.listarAreas(req.query);
  res.status(200).json({ success: true, count: areas.length, data: areas });
});

interface AreaParams extends ParamsDictionary {
  id: string;
}

interface ActualizarAreaBody {
  nombre?: string;
  descripcion?: string;
  codigo?: string;
}

// Edita los datos descriptivos del area. No permite cambiar institucion_id
// (el area no cambia de institucion) ni estado (eso vive en actualizarEstadoArea).
export const actualizarArea = catchAsync<AreaParams, unknown, ActualizarAreaBody>(async (req, res) => {
  if (!req.user) throw new ApiError(401, 'Usuario no autenticado.');
  const area = await areaService.actualizarArea(req.params.id, req.body, {
    usuarioId: req.user._id,
    ip: req.ip ?? null,
  });
  res.status(200).json({ success: true, data: area });
});

interface ActualizarEstadoAreaBody {
  estado: EstadoArea;
}

// Activa/inactiva el area. Nunca se elimina: puede tener asignaturas, notas,
// boletines o desarrollos curriculares asociados (trazabilidad, ver CLAUDE.md).
export const actualizarEstadoArea = catchAsync<AreaParams, unknown, ActualizarEstadoAreaBody>(
  async (req, res) => {
    if (!req.user) throw new ApiError(401, 'Usuario no autenticado.');
    const area = await areaService.actualizarEstadoArea(req.params.id, req.body.estado, {
      usuarioId: req.user._id,
      ip: req.ip ?? null,
    });
    res.status(200).json({ success: true, data: area });
  }
);
