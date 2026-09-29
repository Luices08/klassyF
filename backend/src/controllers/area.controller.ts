import { ParamsDictionary } from 'express-serve-static-core';
import { EstadoArea } from '../constants/enums';
import Area from '../models/area.model';
import ApiError from '../utils/ApiError';
import catchAsync from '../utils/catchAsync';

interface CreateAreaBody {
  institucion_id: string;
  nombre: string;
  descripcion: string;
  codigo: string;
  estado?: EstadoArea;
}

export const createArea = catchAsync<unknown, unknown, CreateAreaBody>(async (req, res) => {
  const area = await Area.create(req.body);
  res.status(201).json({ success: true, data: area });
});

interface ListAreasQuery {
  institucion_id?: string;
  estado?: EstadoArea;
}

export const listAreas = catchAsync<unknown, unknown, unknown, ListAreasQuery>(async (req, res) => {
  const filter: Record<string, string> = {};
  if (req.query.institucion_id) filter.institucion_id = req.query.institucion_id;
  if (req.query.estado) filter.estado = req.query.estado;

  const areas = await Area.find(filter).sort({ nombre: 1 });
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
  const area = await Area.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!area) throw new ApiError(404, 'Area no encontrada.');

  res.status(200).json({ success: true, data: area });
});

interface ActualizarEstadoAreaBody {
  estado: EstadoArea;
}

// Activa/inactiva el area. Nunca se elimina: puede tener asignaturas, notas,
// boletines o desarrollos curriculares asociados (trazabilidad, ver CLAUDE.md).
export const actualizarEstadoArea = catchAsync<AreaParams, unknown, ActualizarEstadoAreaBody>(
  async (req, res) => {
    const area = await Area.findByIdAndUpdate(
      req.params.id,
      { estado: req.body.estado },
      { new: true, runValidators: true }
    );
    if (!area) throw new ApiError(404, 'Area no encontrada.');

    res.status(200).json({ success: true, data: area });
  }
);
